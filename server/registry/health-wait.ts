/**
 * Confirm a freshly-spawned daemon is actually serving on its port before we
 * hand the browser off to it. The daemon spawn is detached and fire-and-forget,
 * so without this a port collision (EADDRINUSE) or a crash would leave the user
 * redirected to a dead/foreign server ("Cannot GET /") with no recourse.
 *
 * Polls `probe(url)` until it succeeds or `timeoutMs` elapses. Everything that
 * touches the clock or the network is injectable so the loop is deterministically
 * testable.
 */
export type WaitForHealthyOptions = {
  url: string;
  timeoutMs?: number;
  intervalMs?: number;
  probe?: (url: string) => Promise<boolean>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** Default probe: a GET that resolves true only on a 2xx response. */
async function defaultProbe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForHealthy(opts: WaitForHealthyOptions): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const intervalMs = opts.intervalMs ?? 150;
  const probe = opts.probe ?? defaultProbe;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const start = now();
  for (;;) {
    if (await probe(opts.url)) return true;
    if (now() - start >= timeoutMs) return false;
    await sleep(intervalMs);
  }
}
