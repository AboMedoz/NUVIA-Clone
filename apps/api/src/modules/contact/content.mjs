import { Router } from 'express';
import { z, parse } from '../../shared/validation.mjs';
export function siteContentRoutes(deps) {
  const router = Router();
  router.get('/public/content/:page', async (req, res) => {
    const page = parse(
      z.enum(['terms', 'privacy', 'about', 'help', 'security', 'status', 'stories', 'pricing']),
      req.params.page,
    );
    const text = deps.config.siteContent?.[page] || '';
    let database;
    if (page === 'status') {
      try {
        await deps.db.command({ ping: 1 }, { timeoutMS: 3000 });
        database = 'available';
      } catch {
        database = 'unavailable';
      }
    }
    res.json({
      page,
      published: Boolean(text),
      text,
      ...(page === 'status' ? { api: 'operational', database } : {}),
    });
  });
  return router;
}
