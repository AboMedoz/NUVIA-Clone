import { defineSchema, text, date } from './schema.mjs';

export const billingAccountSchema = defineSchema('billing_accounts', {
  workspaceId: text,
  customerId: { type: String, default: null },
  subscriptionId: { type: String, default: null },
  planId: { type: String, default: 'free' },
  status: { type: String, default: 'none' },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  currentPeriodEnd: { type: Date, default: null },
  lastEventCreated: { type: Number, default: 0 },
  lastEventId: { type: String, default: null },
  checkoutLeaseUntil: { type: Date, default: null },
  checkoutKey: { type: String, default: null },
  checkoutSessionId: { type: String, default: null },
  checkoutPlan: { type: String, default: null },
  checkoutUrl: { type: String, default: null },
  checkoutExpiresAt: { type: Date, default: null },
  createdAt: date,
  updatedAt: date,
});
billingAccountSchema.index({ workspaceId: 1 }, { unique: true });
billingAccountSchema.index(
  { customerId: 1 },
  { unique: true, partialFilterExpression: { customerId: { $type: 'string' } } },
);
billingAccountSchema.index(
  { subscriptionId: 1 },
  { unique: true, partialFilterExpression: { subscriptionId: { $type: 'string' } } },
);

export const billingEventSchema = defineSchema('billing_events', {
  type: text,
  createdAt: date,
  processedAt: date,
});
billingEventSchema.index({ createdAt: 1 });
