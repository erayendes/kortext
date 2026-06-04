import { useEffect, useRef, useState } from 'react';

/**
 * Tiny JSON fetcher — throws on non-2xx so usePolling can surface errors.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`GET ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export type ApiPostError = {
  status: number;
  error: string;
  message?: string;
  details?: unknown;
};

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const obj = (payload as Record<string, unknown> | null) ?? {};
    const err: ApiPostError = {
      status: res.status,
      error: typeof obj.error === 'string' ? obj.error : `http_${res.status}`,
      message: typeof obj.message === 'string' ? obj.message : undefined,
      details: obj.details,
    };
    throw err;
  }
  return payload as T;
}

async function apiMutate<T>(
  method: 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const obj = (payload as Record<string, unknown> | null) ?? {};
    const err: ApiPostError = {
      status: res.status,
      error: typeof obj.error === 'string' ? obj.error : `http_${res.status}`,
      message: typeof obj.message === 'string' ? obj.message : undefined,
      details: obj.details,
    };
    throw err;
  }
  return payload as T;
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiMutate<T>('PUT', path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiMutate<T>('DELETE', path);
}

export type PollingState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Increments on every successful refresh; useful for "last updated" UIs. */
  tick: number;
  refresh: () => void;
};

/**
 * Poll `path` every `intervalMs` and keep the latest response in state.
 *
 * - First fetch runs eagerly on mount.
 * - On error, keeps the previous data and surfaces `error`.
 * - StrictMode-safe: cleans up the interval and ignores stale resolutions.
 */
export function usePolling<T>(path: string, intervalMs = 3000): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const aliveRef = useRef(true);
  const triggerRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    const run = async () => {
      const myTrigger = triggerRef.current;
      try {
        const next = await apiGet<T>(path);
        if (!aliveRef.current || myTrigger !== triggerRef.current) return;
        setData(next);
        setError(null);
        setTick((n) => n + 1);
      } catch (e) {
        if (!aliveRef.current || myTrigger !== triggerRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (aliveRef.current && myTrigger === triggerRef.current) {
          setLoading(false);
        }
      }
    };

    void run();
    const id = setInterval(run, intervalMs);
    return () => {
      aliveRef.current = false;
      triggerRef.current += 1;
      clearInterval(id);
    };
  }, [path, intervalMs]);

  const refresh = () => {
    setLoading(true);
    triggerRef.current += 1;
    void apiGet<T>(path)
      .then((next) => {
        setData(next);
        setError(null);
        setTick((n) => n + 1);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  };

  return { data, error, loading, tick, refresh };
}

/**
 * Format a Unix-ms timestamp as elapsed-since (e.g. "4m 12s", "2h 03m").
 */
export function formatElapsed(fromMs: number, nowMs: number = Date.now()): string {
  const sec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m`;
}
