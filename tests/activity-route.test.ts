import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { FEED_EXCLUDED_ACTIONS } from '../server/db/repositories/audit-log.ts';
import { activityRouter } from '../server/routes/activity.ts';

let repos: Repositories;
beforeEach(() => {
  repos = openDb({ path: ':memory:' }).repositories;
});

function seed() {
  // One meaningful lifecycle event…
  repos.auditLog.append({
    actor: 'orchestrator',
    action: 'pipeline.succeeded',
    resource_type: 'run',
    resource_id: '2',
    payload: { workflow_id: 'planning-pipeline' },
  });
  // …and a flood of noisy per-item patches that must be filtered out.
  for (let i = 0; i < 50; i++) {
    repos.auditLog.append({
      actor: 'engine',
      action: 'backlog.patch',
      resource_type: 'backlog_item',
      resource_id: `T-${i}`,
      payload: {},
    });
  }
  // A per-step summary survives (it is not in the excluded set).
  repos.auditLog.append({
    actor: 'engine',
    action: 'backlog.patch.summary',
    resource_type: 'run_step',
    resource_id: '5',
    payload: { count: 50 },
  });
}

async function get(app: express.Express, path: string): Promise<{ status: number; body: any }> {
  const { createServer } = await import('node:http');
  return new Promise((resolveP, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      void fetch(`http://127.0.0.1:${port}${path}`)
        .then(async (res) => {
          const body = await res.json();
          server.close(() => resolveP({ status: res.status, body }));
        })
        .catch((e) => {
          server.close(() => reject(e));
        });
    });
  });
}

describe('GET /api/activity', () => {
  it('filters out the high-volume per-item patch noise', async () => {
    seed();
    const app = express();
    app.use('/api', activityRouter({ repos }));

    const { status, body } = await get(app, '/api/activity?limit=40');
    expect(status).toBe(200);
    const actions: string[] = body.activity.map((e: { action: string }) => e.action);
    expect(actions).toContain('pipeline.succeeded');
    expect(actions).toContain('backlog.patch.summary');
    for (const excluded of FEED_EXCLUDED_ACTIONS) {
      expect(actions).not.toContain(excluded);
    }
    // 51 noisy patches were inserted; only 2 meaningful rows remain.
    expect(body.activity.length).toBe(2);
  });

  it('returns newest-first', async () => {
    repos.auditLog.append({ actor: 'a', action: 'pipeline.step.started', resource_type: 'run', resource_id: '1', payload: {} });
    repos.auditLog.append({ actor: 'b', action: 'pipeline.succeeded', resource_type: 'run', resource_id: '1', payload: {} });
    const app = express();
    app.use('/api', activityRouter({ repos }));
    const { body } = await get(app, '/api/activity');
    expect(body.activity[0].action).toBe('pipeline.succeeded');
    expect(body.activity[1].action).toBe('pipeline.step.started');
  });
});
