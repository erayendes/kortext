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

describe('POST /api/backlog', () => {
  it('creates a task with a generated id, defaulting status to to_do', async () => {
    const a = app();
    const { status, body } = await call(a, 'POST', '/api/backlog', { type: 'task', title: 'Do the thing' });
    expect(status).toBe(201);
    expect(body.item).toMatchObject({ type: 'task', title: 'Do the thing', status: 'to_do' });
    expect(body.item.id).toMatch(/^T\d+$/);
  });

  it('persists the optional version label (New-task form seeds it from the board filter)', async () => {
    const a = app();
    const { body } = await call(a, 'POST', '/api/backlog', { type: 'bug', title: 'Crash', version: 'v0.3' });
    expect(body.item.version).toBe('v0.3');
    expect(body.item.type).toBe('bug');
  });

  it('rejects an empty title and an unknown type', async () => {
    const a = app();
    expect((await call(a, 'POST', '/api/backlog', { type: 'task', title: '  ' })).status).toBe(400);
    expect((await call(a, 'POST', '/api/backlog', { type: 'nope', title: 'x' })).status).toBe(400);
  });

  it('accepts a valid epic parent and rejects a non-epic / missing parent', async () => {
    const a = app();
    const epic = (await call(a, 'POST', '/api/backlog', { type: 'epic', title: 'Payments' })).body.item;
    const ok = await call(a, 'POST', '/api/backlog', { type: 'task', title: 'Child', parent_id: epic.id });
    expect(ok.status).toBe(201);
    expect(ok.body.item.parent_id).toBe(epic.id);

    const task = (await call(a, 'POST', '/api/backlog', { type: 'task', title: 'A task' })).body.item;
    expect((await call(a, 'POST', '/api/backlog', { type: 'task', title: 'Bad', parent_id: task.id })).status).toBe(400);
    expect((await call(a, 'POST', '/api/backlog', { type: 'task', title: 'Bad', parent_id: 'NOPE' })).status).toBe(400);
  });
});

describe('POST /api/backlog/:id/comment', () => {
  it('appends a human comment to the activity feed as item_comment', async () => {
    const a = app();
    const item = (await call(a, 'POST', '/api/backlog', { type: 'task', title: 'Commentable' })).body.item;

    const posted = await call(a, 'POST', `/api/backlog/${item.id}/comment`, { text: '  looks good to me  ' });
    expect(posted.status).toBe(201);
    expect(posted.body.entry).toMatchObject({
      action: 'item_comment',
      resource_type: 'backlog_item',
      resource_id: item.id,
      actor: '+you',
    });
    expect(posted.body.entry.payload.text).toBe('looks good to me'); // trimmed

    const feed = await call(a, 'GET', `/api/backlog/${item.id}/activity`);
    expect(feed.body.activity.some((e: { action: string }) => e.action === 'item_comment')).toBe(true);
  });

  it('rejects an empty comment and an unknown item', async () => {
    const a = app();
    const item = (await call(a, 'POST', '/api/backlog', { type: 'task', title: 'X' })).body.item;
    expect((await call(a, 'POST', `/api/backlog/${item.id}/comment`, { text: '   ' })).status).toBe(400);
    expect((await call(a, 'POST', '/api/backlog/NOPE/comment', { text: 'hi' })).status).toBe(404);
  });
});

describe('GET /api/backlog/:id/activity', () => {
  it('drops the noisy per-item backlog.patch rows but keeps comments', async () => {
    const a = app();
    const item = (await call(a, 'POST', '/api/backlog', { type: 'task', title: 'Noisy' })).body.item;
    for (let i = 0; i < 5; i++) {
      repos.auditLog.append({
        actor: 'engine',
        action: 'backlog.patch',
        resource_type: 'backlog_item',
        resource_id: item.id,
        payload: {},
      });
    }
    await call(a, 'POST', `/api/backlog/${item.id}/comment`, { text: 'a real comment' });

    const feed = await call(a, 'GET', `/api/backlog/${item.id}/activity`);
    const actions = feed.body.activity.map((e: { action: string }) => e.action);
    expect(actions).toContain('item_comment');
    expect(actions).not.toContain('backlog.patch');
  });
});
