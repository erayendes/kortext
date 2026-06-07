/**
 * Tests for GET /api/backlog/aggregate
 *
 * Covers:
 *  - epics: all type='epic' items returned
 *  - epicProgress: per-epic child counts (total + done) computed server-side
 *  - statusCounts: keyed by status
 *  - distinct versions / assignees
 *  - total: full table count
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

describe('GET /api/backlog/aggregate', () => {
  it('returns 200 with the expected shape on empty db', async () => {
    const a = app();
    const { status, body } = await call(a, 'GET', '/api/backlog/aggregate');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      epics: [],
      epicProgress: {},
      statusCounts: {},
      versions: [],
      assignees: [],
      total: 0,
    });
  });

  it('epics only contains type=epic items', async () => {
    const a = app();
    // Create an epic + a task
    await call(a, 'POST', '/api/backlog', { type: 'epic', title: 'E1' });
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T1' });

    const { body } = await call(a, 'GET', '/api/backlog/aggregate');
    expect(body.epics).toHaveLength(1);
    expect(body.epics[0].type).toBe('epic');
    expect(body.total).toBe(2);
  });

  it('epicProgress: epic with 2 done / 4 children → {total:4, done:2}', async () => {
    const a = app();
    // Create epic
    const { body: eb } = await call(a, 'POST', '/api/backlog', { type: 'epic', title: 'Epic A' });
    const epicId: string = eb.item.id;

    // Create 4 children
    const childIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const { body: cb } = await call(a, 'POST', '/api/backlog', {
        type: 'task',
        title: `Task ${i + 1}`,
        parent_id: epicId,
      });
      childIds.push(cb.item.id as string);
    }

    // Move 2 children to done via the repo directly (no personas needed)
    repos.backlog.transitionStatus(childIds[0]!, 'done');
    repos.backlog.transitionStatus(childIds[1]!, 'done');

    const { body } = await call(a, 'GET', '/api/backlog/aggregate');
    expect(body.epicProgress[epicId]).toEqual({ total: 4, done: 2 });
  });

  it('epicProgress: epic with no children is absent from the map', async () => {
    const a = app();
    const { body: eb } = await call(a, 'POST', '/api/backlog', { type: 'epic', title: 'Empty Epic' });
    const epicId: string = eb.item.id;

    const { body } = await call(a, 'GET', '/api/backlog/aggregate');
    // No children → parent_id never appears in GROUP BY result → key is absent
    expect(body.epicProgress[epicId]).toBeUndefined();
  });

  it('statusCounts: keyed by status with correct counts', async () => {
    const a = app();
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T1' });
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T2' });
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T3' });

    // Move one to in_progress
    const { body: lb } = await call(a, 'GET', '/api/backlog');
    repos.backlog.transitionStatus(lb.items[0].id, 'in_progress');

    const { body } = await call(a, 'GET', '/api/backlog/aggregate');
    expect(body.statusCounts['to_do']).toBe(2);
    expect(body.statusCounts['in_progress']).toBe(1);
  });

  it('versions: distinct non-empty version labels, alphabetical', async () => {
    const a = app();
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T1', version: 'v1.0' });
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T2', version: 'v2.0' });
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T3', version: 'v1.0' }); // duplicate

    const { body } = await call(a, 'GET', '/api/backlog/aggregate');
    expect(body.versions).toEqual(['v1.0', 'v2.0']);
  });

  it('assignees: distinct non-epic owners', async () => {
    const a = app();
    // Epic owner is excluded
    await call(a, 'POST', '/api/backlog', { type: 'epic', title: 'E1', owner: '+epic-owner' });
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T1', owner: '+alice' });
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T2', owner: '+alice' }); // duplicate
    await call(a, 'POST', '/api/backlog', { type: 'task', title: 'T3', owner: '+bob' });

    const { body } = await call(a, 'GET', '/api/backlog/aggregate');
    expect(body.assignees).toContain('+alice');
    expect(body.assignees).toContain('+bob');
    expect(body.assignees).not.toContain('+epic-owner');
    // No duplicates
    expect(body.assignees.length).toBe(2);
  });

  it('total reflects the full table count regardless of other fields', async () => {
    const a = app();
    for (let i = 0; i < 7; i++) {
      await call(a, 'POST', '/api/backlog', { type: 'task', title: `T${i + 1}` });
    }
    const { body } = await call(a, 'GET', '/api/backlog/aggregate');
    expect(body.total).toBe(7);
  });

  it('/aggregate route is reachable and not shadowed by the :id route', async () => {
    const a = app();
    const { status } = await call(a, 'GET', '/api/backlog/aggregate');
    expect(status).toBe(200);
  });
});
