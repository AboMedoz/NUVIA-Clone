import { Router } from 'express';
import { z, parse } from '../../shared/validation.mjs';
import { requireVerifiedUser } from '../auth/sessions.mjs';
import { resolveAccess, requireWrite } from '../team/access.mjs';
import { csrfMiddleware } from '../../middleware/security.mjs';
import { createLimiter } from '../../middleware/rate-limits.mjs';
import { billingView, createCheckout, createPortal, processBillingWebhook } from './service.mjs';

export function billingWebhook(deps) {
  return async (req, res) =>
    res.json(await processBillingWebhook(req.body, req.get('Stripe-Signature'), deps));
}

export function billingRoutes(deps) {
  const router = Router();
  const limit = createLimiter(deps);
  router.use(async (req, res, next) => {
    req.billingUser = await requireVerifiedUser(req, deps);
    req.billingAccess = await resolveAccess(req.billingUser.id, deps);
    requireWrite(req.billingAccess, true);
    const reading = ['GET', 'HEAD'].includes(req.method);
    limit(
      `billing:${reading ? 'read' : 'write'}:${req.billingUser.id}`,
      reading ? 300 : 30,
      900000,
      res,
    );
    next();
  });
  router.get('/', async (req, res) => res.json(await billingView(req.billingAccess, deps)));
  router.use(csrfMiddleware(deps));
  router.post('/checkout', async (req, res) => {
    const { plan } = parse(
      z.object({ plan: z.enum(['starter', 'pro', 'business']) }).strict(),
      req.body,
    );
    res.json(await createCheckout(plan, req.billingAccess, req.billingUser, deps));
  });
  router.post('/portal', async (req, res) => {
    parse(z.object({}).strict(), req.body);
    res.json(await createPortal(req.billingAccess, deps));
  });
  return router;
}
