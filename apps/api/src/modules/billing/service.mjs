import { randomUUID } from 'node:crypto';
import { ApiError } from '../../middleware/errors.mjs';
import { transaction } from '../../shared/database/connection.mjs';
import { stripeRequest, verifyStripeEvent } from './stripe.mjs';

export const billingPlans = [
  { id: 'starter', name: 'Starter' },
  { id: 'pro', name: 'Pro' },
  { id: 'business', name: 'Business' },
];
const configured = (deps) =>
  Boolean(deps.config.billing?.secretKey && deps.config.billing?.webhookSecret);
const activeStatuses = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];
const idOf = (value) => (typeof value === 'string' ? value : value?.id);

export async function billingView(access, deps) {
  const account = await deps.models.BillingAccount.findOne({
    workspaceId: access.workspace._id,
  }).lean();
  const paid = account && ['active', 'trialing'].includes(account.status);
  const current = billingPlans.find((plan) => plan.id === account?.planId);
  const responses = await deps.models.Response.countDocuments({
    workspaceId: access.workspace._id,
  });
  return {
    plan: {
      id: paid ? account.planId : 'free',
      name: paid ? current?.name || account.planId : 'Free',
    },
    usage: { responses, period: 'all_time' },
    subscription: account?.subscriptionId
      ? {
          status: account.status,
          customerId: account.customerId,
          cancelAtPeriodEnd: account.cancelAtPeriodEnd,
          currentPeriodEnd: account.currentPeriodEnd,
        }
      : null,
    configured: configured(deps),
    plans: billingPlans.map((plan) => ({
      ...plan,
      available: configured(deps) && Boolean(deps.config.billing?.prices?.[plan.id]),
    })),
  };
}

async function customerFor(access, user, deps) {
  const workspaceId = access.workspace._id;
  try {
    await deps.models.BillingAccount.updateOne(
      { workspaceId },
      {
        $setOnInsert: {
          _id: randomUUID(),
          workspaceId,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  const account = await deps.models.BillingAccount.findOne({ workspaceId }).lean();
  if (account.customerId) return account;
  const customer = await stripeRequest(
    'customers',
    { 'metadata[workspaceId]': workspaceId, email: user.email, name: access.workspace.name },
    deps,
    { idempotencyKey: 'nuvia-customer-' + workspaceId },
  );
  if (!/^cus_[a-zA-Z0-9]+$/.test(customer.id || '')) throw new ApiError(502, 'BILLING_UNAVAILABLE');
  await deps.models.BillingAccount.updateOne(
    { workspaceId, customerId: null },
    { $set: { customerId: customer.id, updatedAt: deps.now() } },
  );
  return deps.models.BillingAccount.findOne({ workspaceId }).lean();
}

export async function createCheckout(plan, access, user, deps) {
  if (!configured(deps) || !deps.config.billing.prices?.[plan])
    throw new ApiError(503, 'BILLING_NOT_CONFIGURED');
  const account = await customerFor(access, user, deps);
  if (account.subscriptionId && activeStatuses.includes(account.status))
    throw new ApiError(409, 'SUBSCRIPTION_ALREADY_EXISTS');
  const checkoutKey = randomUUID();
  const locked = await deps.models.BillingAccount.findOneAndUpdate(
    {
      _id: account._id,
      $or: [{ checkoutLeaseUntil: null }, { checkoutLeaseUntil: { $lte: deps.now() } }],
    },
    { $set: { checkoutKey, checkoutLeaseUntil: new Date(deps.now().getTime() + 60000) } },
    { returnDocument: 'after' },
  ).lean();
  if (!locked) throw new ApiError(409, 'BILLING_CHECKOUT_IN_PROGRESS');
  try {
    if (locked.checkoutSessionId && locked.checkoutExpiresAt > deps.now()) {
      if (locked.checkoutPlan === plan && locked.checkoutUrl) return { url: locked.checkoutUrl };
      // Invalidate an unfinished different-plan session before offering another; completed sessions require webhook reconciliation.
      await stripeRequest(
        'checkout/sessions/' + encodeURIComponent(locked.checkoutSessionId) + '/expire',
        {},
        deps,
      );
    }
    const session = await stripeRequest(
      'checkout/sessions',
      {
        mode: 'subscription',
        customer: account.customerId,
        'line_items[0][price]': deps.config.billing.prices[plan],
        'line_items[0][quantity]': '1',
        client_reference_id: access.workspace._id,
        'subscription_data[metadata][workspaceId]': access.workspace._id,
        'subscription_data[metadata][planId]': plan,
        success_url: deps.config.appOrigin + '/#/subscription?checkout=returned',
        cancel_url: deps.config.appOrigin + '/#/subscription?checkout=cancelled',
      },
      deps,
      { idempotencyKey: 'nuvia-checkout-' + account._id + '-' + checkoutKey },
    );
    if (
      !/^cs_[a-zA-Z0-9_]+$/.test(session.id || '') ||
      !session.url ||
      new URL(session.url).origin !== 'https://checkout.stripe.com' ||
      !Number.isSafeInteger(session.expires_at)
    )
      throw new ApiError(502, 'BILLING_UNAVAILABLE');
    await deps.models.BillingAccount.updateOne(
      { _id: account._id, checkoutKey },
      {
        $set: {
          checkoutSessionId: session.id,
          checkoutPlan: plan,
          checkoutUrl: session.url,
          checkoutExpiresAt: new Date(session.expires_at * 1000),
          updatedAt: deps.now(),
        },
      },
    );
    return { url: session.url };
  } finally {
    await deps.models.BillingAccount.updateOne(
      { _id: account._id, checkoutKey },
      { $set: { checkoutLeaseUntil: null } },
    );
  }
}

export async function createPortal(access, deps) {
  if (!configured(deps)) throw new ApiError(503, 'BILLING_NOT_CONFIGURED');
  const account = await deps.models.BillingAccount.findOne({
    workspaceId: access.workspace._id,
  }).lean();
  if (!account?.customerId) throw new ApiError(409, 'BILLING_CUSTOMER_REQUIRED');
  const result = await stripeRequest(
    'billing_portal/sessions',
    { customer: account.customerId, return_url: deps.config.appOrigin + '/#/subscription' },
    deps,
  );
  if (!result.url || new URL(result.url).origin !== 'https://billing.stripe.com')
    throw new ApiError(502, 'BILLING_UNAVAILABLE');
  return { url: result.url };
}

export async function processBillingWebhook(raw, signature, deps) {
  const event = verifyStripeEvent(
    raw,
    signature,
    deps.config.billing?.webhookSecret,
    deps.now().getTime(),
  );
  if (await deps.models.BillingEvent.findOne({ _id: event.id }).lean()) return { received: true };
  if (
    ![
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ].includes(event.type)
  )
    return { received: true };
  const object = event.data.object;
  const customerId = idOf(object.customer);
  const subscriptionId =
    event.type === 'checkout.session.completed' ? idOf(object.subscription) : object.id;
  if (
    !/^cus_[a-zA-Z0-9]+$/.test(customerId || '') ||
    !/^sub_[a-zA-Z0-9]+$/.test(subscriptionId || '')
  )
    throw new ApiError(400, 'INVALID_BILLING_EVENT');
  const account = await deps.models.BillingAccount.findOne({ customerId }).lean();
  // Events for customers not created by this application cannot claim a workspace through metadata.
  if (!account) return { received: true };
  const subscription = await stripeRequest(
    'subscriptions/' + encodeURIComponent(subscriptionId),
    null,
    deps,
    { method: 'GET' },
  );
  if (
    idOf(subscription.customer) !== account.customerId ||
    subscription.metadata?.workspaceId !== account.workspaceId ||
    subscription.id !== subscriptionId
  )
    throw new ApiError(400, 'INVALID_BILLING_EVENT');
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = billingPlans.find((plan) => deps.config.billing.prices?.[plan.id] === priceId);
  if (!plan) throw new ApiError(400, 'UNKNOWN_SUBSCRIPTION_PRICE');
  // Retrieve current Stripe state; a replayed or out-of-order event payload never reactivates a cancelled subscription.
  const end = subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end;
  try {
    await transaction(deps, async (session) => {
      if (await deps.models.BillingEvent.findOne({ _id: event.id }, null, { session }).lean())
        return;
      const latest = await deps.models.BillingAccount.findOne({ _id: account._id }, null, {
        session,
      }).lean();
      const differentActiveSubscription =
        latest.subscriptionId &&
        latest.subscriptionId !== subscriptionId &&
        activeStatuses.includes(latest.status);
      if (!differentActiveSubscription && event.created >= (latest.lastEventCreated || 0)) {
        await deps.models.BillingAccount.updateOne(
          { _id: account._id },
          {
            $set: {
              subscriptionId,
              status: subscription.status,
              planId: plan.id,
              cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
              currentPeriodEnd: Number.isSafeInteger(end) ? new Date(end * 1000) : null,
              lastEventCreated: event.created,
              lastEventId: event.id,
              updatedAt: deps.now(),
              checkoutSessionId: null,
              checkoutPlan: null,
              checkoutUrl: null,
              checkoutExpiresAt: null,
            },
          },
          { session },
        );
      }
      await deps.models.BillingEvent.insertOne(
        {
          _id: event.id,
          type: event.type,
          createdAt: new Date(event.created * 1000),
          processedAt: deps.now(),
        },
        { session },
      );
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return { received: true };
}
