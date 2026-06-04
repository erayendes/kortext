import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { docsRouter } from '../server/routes/docs.ts';

// The docs router lists/serves markdown under an allow-list of scope dirs.
// Key behavior under test: scope dirs are created LAZILY by the agents that
// write into them, so a freshly-onboarded project has no memory/ or reports/
// dir yet. Listing such a scope must return an empty list — NOT a 500 — or the
// Memory/Reports screens break on every new project (the bug this UAT found).

let server: Server;
let baseUrl: string;
let tmp: string;
let presentDir: string; // an existing scope dir
let missingDir: string; // an allow-listed scope whose dir does NOT exist

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'kx-docs-'));
  presentDir = join(tmp, 'references');
  missingDir = join(tmp, 'memory'); // intentionally NOT created
  await mkdir(presentDir, { recursive: true });
  await writeFile(join(presentDir, 'GROWTH.md'), '# Growth\n', 'utf8');
  await writeFile(join(presentDir, 'ignore.txt'), 'nope', 'utf8');

  const app = express();
  app.use('/api', docsRouter({ scopes: { references: presentDir, memory: missingDir } }));
  server = await listen(app);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(tmp, { recursive: true, force: true });
});

describe('GET /api/docs/:scope — listing', () => {
  it('returns 404 for a scope outside the allow-list', async () => {
    const res = await fetch(`${baseUrl}/api/docs/secrets`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('unknown_scope');
  });

  it('lists only .md files in an existing scope', async () => {
    const res = await fetch(`${baseUrl}/api/docs/references`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scope: string; files: { name: string }[] };
    expect(body.scope).toBe('references');
    expect(body.files.map((f) => f.name)).toEqual(['GROWTH.md']); // .txt excluded
  });

  it('returns an empty list (NOT 500) when the scope dir does not exist yet', async () => {
    // Regression: a fresh project has no memory/ dir until an agent writes a
    // handover. Listing must degrade to empty, not ENOENT → 500.
    const res = await fetch(`${baseUrl}/api/docs/memory`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scope: string; files: unknown[] };
    expect(body.scope).toBe('memory');
    expect(body.files).toEqual([]);
  });
});

describe('GET /api/docs/:scope/:file — reading', () => {
  it('returns the raw markdown body', async () => {
    const res = await fetch(`${baseUrl}/api/docs/references/GROWTH.md`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { body: string }).body).toBe('# Growth\n');
  });

  it('404s a missing file', async () => {
    const res = await fetch(`${baseUrl}/api/docs/references/NOPE.md`);
    expect(res.status).toBe(404);
  });

  it('blocks path traversal out of the scope', async () => {
    const res = await fetch(`${baseUrl}/api/docs/references/${encodeURIComponent('../secrets.md')}`);
    expect([400, 403]).toContain(res.status);
  });
});
