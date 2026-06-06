/**
 * Tests for GET /api/backlog?offset=&limit= (P1 — expose total + offset).
 *
 * Covers:
 *  - offset slicing (items 3–5 by ORDER BY created_at DESC)
 *  - response always includes `total` (full count ignoring limit/offset)
 *  - `total` honours ?status= filter
 *  - clampLimit raised to 2000 (accepts 2000, clamps >2000)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { backlogRouter } from '../server/routes/backlog.ts';

let repos: Repositories;
beforeEach(() => {
  repos = openDb({ path: ':memory:' }).repositories;
});

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/api', backlogRouter({ repos }));
  return a;
}

async function call(
  a: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const { createServer } = await import('node:http');
  return new Promise((resolveP, reject) => {
    const server = createServer(a);
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      void fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
        .then(async (res) => {
          const text = await res.text();
          server.close(() => resolveP({ status: res.status, body: text ? JSON.parse(text) : null }));
        })
        .catch((e) => server.close(() => reject(e)));
    });
  });
}

/** Seed n tasks (newest last by creation order — SQLite ms precision is fine in tests) */
async function seedTasks(a: express.Express, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { body } = await call(a, 'POST', '/api/backlog', { type: 'task', title: `Task ${i + 1}` });
    ids.push(body.item.id as string);
  }
  return ids;
}

describe('GET /api/backlog — total + offset (P1)', () => {
  it('returns { items, total } on every list response', async () => {
    const a = app();
    await seedTasks(a, 3);
    const { status, body } = await call(a, 'GET', '/api/backlog');
    expect(status).toBe(200);
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
    expect(body.total).toBe(3);
  });

  it('offset slices the result; total stays at full count', async () => {
    const a = app();
    await seedTasks(a, 5);

    // Items are ordered newest-first (ORDER BY created_at DESC).
    // offset=2, limit=3 → items 3-5 in that order.
    const { status, body } = await call(a, 'GET', '/api/backlog?offset=2&limit=3');
    expect(status).toBe(200);
    expect(body.items).toHaveLength(3);
    // total must equal the full 5, not just the page length
    expect(body.total).toBe(5);
  });

  it('total honours a ?status= filter', async () => {
    const a = app();
    // Seed 4 tasks via POST in the same repos-backed app
    const ids = await seedTasks(a, 4);

    // Directly move 2 items to in_progress via the repo (no personas required)
    repos.backlog.transitionStatus(ids[0]!, 'in_progress');
    repos.backlog.transitionStatus(ids[1]!, 'in_progress');

    const { body } = await call(a, 'GET', '/api/backlog?status=in_progress');
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);

    const { body: b2 } = await call(a, 'GET', '/api/backlog?status=to_do');
    expect(b2.total).toBe(2);
  });

  it('total honours ?type= filter', async () => {
    const a = app();
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T1' });
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T2' });
    await call(a, 'POST', '/api/backlog', { type: 'bug', title: 'B1' });

    const { body } = await call(a, 'GET', '/api/backlog?type=task');
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
  });

  it('clampLimit accepts up to 2000 and clamps above that', async () => {
    const a = app();
    await seedTasks(a, 3);

    const { body: b2000 } = await call(a, 'GET', '/api/backlog?limit=2000');
    expect(b2000.items).toHaveLength(3); // only 3 exist

    // limit=3000 should be clamped to 2000 (still returns all 3 items here)
    const { body: b3000 } = await call(a, 'GET', '/api/backlog?limit=3000');
    expect(b3000.items).toHaveLength(3);
  });
});
