import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, parse, name, email } from '../../shared/validation.mjs';
import { createLimiter } from '../../middleware/rate-limits.mjs';
import { ApiError } from '../../middleware/errors.mjs';
export function contactRoutes(deps) {
  const router = Router(),
    limit = createLimiter(deps);
  router.post('/public/contact', async (req, res) => {
    if (req.get('Origin') !== deps.config.appOrigin) throw new ApiError(403, 'ORIGIN_REJECTED');
    limit('contact:' + req.ip, 5, 3600000, res);
    const input = parse(z.object({ name, email, company: name }).strict(), req.body);
    await deps.models.ContactRequest.insertOne({
      ...input,
      _id: randomUUID(),
      createdAt: deps.now(),
      status: 'new',
    });
    res.status(202).json({ status: 'accepted' });
  });
  return router;
}
