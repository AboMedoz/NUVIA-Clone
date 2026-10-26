import { siteContentRoutes } from './modules/contact/content.mjs';
import { searchRoutes } from './modules/search/routes.mjs';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '@nuvia/shared-types';
import { authRoutes } from './modules/auth/routes.mjs';
import { workspaceRoutes } from './modules/workspaces/routes.mjs';
import { multiWorkspaceRoutes } from './modules/workspaces/multi-workspace.mjs';
import { workspaceRequestContext } from './modules/workspaces/request-context.mjs';
import { accountRoutes } from './modules/account/routes.mjs';
import { googleRoutes } from './modules/auth/google.mjs';
import { billingRoutes, billingWebhook } from './modules/billing/routes.mjs';
import { actionRoutes } from './modules/actions/routes.mjs';
import { contactRoutes } from './modules/contact/routes.mjs';
import { productRoutes } from './modules/product-routes.mjs';
import { randomUUID } from 'node:crypto';
import { ApiError, errorHandler } from './middleware/errors.mjs';

export function createApp(dependencies) {
  const { config, db } = dependencies;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-ID', req.requestId).set('Cache-Control', 'no-store');
    next();
  });
  app.post(
    `${API_PREFIX}/billing/webhook`,
    express.raw({ type: 'application/json', limit: '256kb' }),
    billingWebhook(dependencies),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use(API_PREFIX, siteContentRoutes(dependencies));
  app.use(workspaceRequestContext(dependencies));
  app.use(API_PREFIX, contactRoutes(dependencies));
  app.use(`${API_PREFIX}/auth/google`, googleRoutes(dependencies));
  app.use(`${API_PREFIX}/auth`, authRoutes(dependencies));
  app.use(`${API_PREFIX}/account`, accountRoutes(dependencies));
  app.use(`${API_PREFIX}/billing`, billingRoutes(dependencies));
  app.use(`${API_PREFIX}/actions`, actionRoutes(dependencies));
  app.use(API_PREFIX, searchRoutes(dependencies));
  app.use(`${API_PREFIX}/workspaces`, multiWorkspaceRoutes(dependencies));
  app.get(`${API_PREFIX}/health/live`, (_req, res) => res.json({ status: 'live' }));
  app.get(`${API_PREFIX}/health/ready`, async (_req, res) => {
    try {
      await db.command({ ping: 1 }, { timeoutMS: 3000 });
      res.json({ status: 'ready' });
    } catch {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE');
    }
  });
  app.use(API_PREFIX, productRoutes(dependencies));
  app.use(API_PREFIX, workspaceRoutes(dependencies));
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND')));
  app.use(errorHandler);
  return app;
}
