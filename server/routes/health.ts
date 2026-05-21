import { Router } from 'express';

const startedAt = Date.now();

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '3.0.0-alpha.0',
    uptimeMs: Date.now() - startedAt,
  });
});
