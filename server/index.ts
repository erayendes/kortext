import express from 'express';
import { env } from './config/env.ts';
import { healthRouter } from './routes/health.ts';
import { dbInfoRouter } from './routes/db-info.ts';
import { getDb } from './db/client.ts';

// Open DB + run migrations before the HTTP server starts accepting traffic.
const { schemaVersion } = getDb();
console.log(`[kortext] db ready (schema v${schemaVersion})`);

const app = express();

app.use(express.json());
app.use('/api', healthRouter);
app.use('/api', dbInfoRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[kortext]', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const server = app.listen(env.KORTEXT_PORT, () => {
  console.log(`[kortext] server listening on http://localhost:${env.KORTEXT_PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`[kortext] received ${signal}, closing`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
