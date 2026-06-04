import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { driveRouter } from '../server/routes/drive.ts';

let server: Server;
let baseUrl: string;

// Injected test harness state — the router takes `enabled` + `drive` as deps so
// the switch/guard/dispatch logic is exercised without real git or agents (that
// end-to-end path is covered by driver-e2e.test.ts).
let enabled: boolean;
let driveCalls: number;
let deferreds: Array<{ resolve: () => void; reject: (e: unknown) => void }>;

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

function mount(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    driveRouter({
      enabled: () => enabled,
      // A controllable drive: increments a counter and returns a promise that
      // stays pending until the test settles it — so a press can be "in flight".
      drive: () =>
        new Promise<void>((resolve, reject) => {
          driveCalls++;
          deferreds.push({ resolve, reject });
        }),
      log: () => {}, // keep test output pristine — the log path itself is prod-only
    }),
  );
  return app;
}

beforeEach(async () => {
  enabled = false;
  driveCalls = 0;
  deferreds = [];
  server = await listen(mount());
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
});

afterEach(async () => {
  // Settle any in-flight drive so nothing dangles, then close.
  deferreds.forEach((d) => d.resolve());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('POST /api/drive — the start-button trigger (locked by default, §5.16)', () => {
  it('refuses with 403 drive_disabled when the safety switch is off (drive never called)', async () => {
    enabled = false;
    const res = await fetch(`${baseUrl}/api/drive`, { method: 'POST' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('drive_disabled');
    expect(driveCalls).toBe(0);
  });

  it('starts one pass with 202 started when the switch is on and nothing is running', async () => {
    enabled = true;
    const res = await fetch(`${baseUrl}/api/drive`, { method: 'POST' });
    // Responds immediately even though the drive promise is still pending —
    // proving the trigger is fire-and-forget, not blocking on the pass.
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('started');
    expect(driveCalls).toBe(1);
  });

  it('rejects a second press with 409 drive_in_progress while a pass is in flight', async () => {
    enabled = true;
    const first = await fetch(`${baseUrl}/api/drive`, { method: 'POST' });
    expect(first.status).toBe(202);
    expect(driveCalls).toBe(1);

    const second = await fetch(`${baseUrl}/api/drive`, { method: 'POST' });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('drive_in_progress');
    expect(driveCalls).toBe(1); // the in-flight guard blocked a second pass

    // Let the first pass finish → the guard clears → a fresh press runs again.
    deferreds.forEach((d) => d.resolve());
    deferreds = [];
    await new Promise((r) => setTimeout(r, 10)); // flush the finally() microtask
    const third = await fetch(`${baseUrl}/api/drive`, { method: 'POST' });
    expect(third.status).toBe(202);
    expect(driveCalls).toBe(2);
  });

  it('clears the in-flight guard even when a pass throws (button is not stuck forever)', async () => {
    enabled = true;
    const first = await fetch(`${baseUrl}/api/drive`, { method: 'POST' });
    expect(first.status).toBe(202);
    expect(driveCalls).toBe(1);

    // The pass crashes — the guard must still release.
    deferreds.forEach((d) => d.reject(new Error('boom')));
    deferreds = [];
    await new Promise((r) => setTimeout(r, 10));

    const second = await fetch(`${baseUrl}/api/drive`, { method: 'POST' });
    expect(second.status).toBe(202);
    expect(driveCalls).toBe(2);
  });
});

describe('GET /api/drive — status', () => {
  it('reports armed=switch, scheduler off, no pass yet', async () => {
    enabled = false;
    let res = await fetch(`${baseUrl}/api/drive`);
    let body = (await res.json()) as {
      armed: boolean;
      inFlight: boolean;
      scheduler: { running: boolean; intervalSec: number | null };
      lastPass: unknown;
    };
    expect(body.armed).toBe(false);
    expect(body.inFlight).toBe(false);
    expect(body.scheduler).toEqual({ running: false, intervalSec: null });
    expect(body.lastPass).toBeNull();

    enabled = true;
    res = await fetch(`${baseUrl}/api/drive`);
    body = (await res.json()) as typeof body;
    expect(body.armed).toBe(true);
  });

  it('records lastPass after a pass settles', async () => {
    enabled = true;
    await fetch(`${baseUrl}/api/drive`, { method: 'POST' });
    deferreds.forEach((d) => d.resolve());
    deferreds = [];
    await new Promise((r) => setTimeout(r, 10));
    const body = (await (await fetch(`${baseUrl}/api/drive`)).json()) as {
      lastPass: { ok: boolean } | null;
    };
    expect(body.lastPass?.ok).toBe(true);
  });
});

describe('POST /api/drive/scheduler — auto-drive toggle (on top of the master lock)', () => {
  it('refuses to arm the scheduler with 403 when the master switch is off', async () => {
    enabled = false;
    const res = await fetch(`${baseUrl}/api/drive/scheduler`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('drive_disabled');
  });

  it('422 when enabled is not a boolean', async () => {
    enabled = true;
    const res = await fetch(`${baseUrl}/api/drive/scheduler`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: 'yes' }),
    });
    expect(res.status).toBe(422);
  });

  it('turns auto-drive on (kicks an immediate pass) and off', async () => {
    enabled = true;
    const on = await fetch(`${baseUrl}/api/drive/scheduler`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, intervalSec: 60 }),
    });
    expect(on.status).toBe(200);
    expect(((await on.json()) as { scheduler: unknown }).scheduler).toEqual({
      running: true,
      intervalSec: 60,
    });
    expect(driveCalls).toBe(1); // immediate kick

    // GET reflects the running scheduler.
    const status = (await (await fetch(`${baseUrl}/api/drive`)).json()) as {
      scheduler: { running: boolean };
    };
    expect(status.scheduler.running).toBe(true);

    const off = await fetch(`${baseUrl}/api/drive/scheduler`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(((await off.json()) as { scheduler: unknown }).scheduler).toEqual({
      running: false,
      intervalSec: null,
    });
  });
});
