/**
 * Footer — design-handoff status bar (app.js `shell()` footer).
 *
 *   daemon :PORT · agents (running · waiting · awaiting) · worktrees   |   review · Terminal
 *
 * Counts are live and reflect *real agent runtime* — derived from `/api/runs`
 * (the same lens the Terminal `status` command uses), NOT backlog item statuses:
 *   running  → runs executing right now
 *   queued   → runs lined up, waiting for an agent to start them
 *   awaiting → runs paused on a gate / approval
 * worktrees come from the same runs. The daemon entry is a static health light
 * (not a popover). Each clickable foot-item opens its popover via a window event.
 */
import { useEffect, useRef, useState } from 'react';
import { Bot, GitBranch, ShieldUser, Terminal, ChevronUp, Clock, Pause, Play } from 'lucide-react';
import { apiPost, usePolling } from '../lib/api.ts';
import { emitShell } from './shell-events.ts';
import type { Run } from '../lib/api-types.ts';

export type RuntimeRunningStep = {
  id: number;
  label: string;
  persona: string | null;
  startedAt: number | null;
};

export type RuntimeInfo = {
  now: number;
  projectStartedAt: number | null;
  sessionStartedAt: number;
  running: RuntimeRunningStep[];
};

/** A clock that re-renders every `ms` so elapsed counters tick live. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Compact elapsed label: "12s" · "2m 03s" · "1h 04m" · "2d 03h". */
export function elapsed(fromMs: number | null | undefined, nowMs: number): string {
  if (fromMs == null) return '—';
  const sec = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${String(sec % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${String(h % 24).padStart(2, '0')}h`;
}

/** Open a footer popover anchored under the foot-item that was clicked. */
function openPop(
  name: 'open-agents' | 'open-worktrees' | 'open-review' | 'open-terminal' | 'open-durations',
  el: HTMLElement,
): void {
  emitShell(name, { rect: el.getBoundingClientRect() });
}

export function Footer() {
  const runs = usePolling<{ runs: Run[]; runningSteps?: number }>('/api/runs', 5000);
  const runtime = usePolling<RuntimeInfo>('/api/runtime', 5000);
  const now = useNow(1000); // ticks the session counter live
  const pause = usePolling<{ paused: boolean }>('/api/pause', 4000);
  const paused = pause.data?.paused ?? false;
  const togglePause = () =>
    void apiPost('/api/pause', { paused: !paused }).then(() => pause.refresh());

  // Active-session timer: stops advancing while paused; resume continues seamlessly
  // (paused spans are subtracted, so the clock reflects ACTIVE time only).
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (paused) {
      if (pauseStartRef.current == null) pauseStartRef.current = Date.now();
    } else if (pauseStartRef.current != null) {
      pausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
  }, [paused]);
  const effectiveNow = (paused ? (pauseStartRef.current ?? now) : now) - pausedMsRef.current;

  const runList = runs.data?.runs ?? [];
  // "active" = agents executing right now = concurrent running STEPS, not runs:
  // a single setup run drafts several artifacts in parallel, so the run count
  // under-reports. Fall back to the running-run count on older backends.
  const runningRuns = runList.filter((r) => r.status === 'running').length;
  const running = runs.data?.runningSteps ?? runningRuns;
  const queued = runList.filter((r) => r.status === 'queued').length;
  const awaiting = runList.filter((r) => r.status === 'awaiting_approval').length;

  const worktrees = new Set(
    runList
      .filter((r) => (r.status === 'running' || r.status === 'awaiting_approval') && r.worktree_path)
      .map((r) => r.worktree_path),
  ).size;

  // The daemon dot is a live health light: green only while the backend is
  // actually answering polls, red the moment a poll errors (process gone).
  const connected = !runs.error && runs.data != null;

  return (
    <footer className="footer">
      {/* LEFT — daemon health + running port */}
      <span className="foot-item" style={{ cursor: 'default' }} title="Kortext daemon">
        <span
          className="foot-dot"
          style={{ background: connected ? 'var(--green)' : 'var(--red)' }}
        />
        <span className="mono">daemon: {window.location.port || '3200'}</span>
      </span>

      {/* RIGHT — session timer + run-state/pause */}
      <div className="foot-right" style={{ marginLeft: 'auto' }}>
        <span
          className="foot-item"
          onClick={(e) => openPop('open-durations', e.currentTarget)}
          title="Süreler — toplam oturum · aktif işler"
        >
          <span className="mono">{elapsed(runtime.data?.sessionStartedAt, effectiveNow)}</span>
          <ChevronUp className="ic" />
        </span>

        {/* Run state + soft pause: 'play' (+ pulse) while agents work; pause to hold. */}
        <span
          className="foot-item"
          onClick={togglePause}
          title={paused ? 'Devam et — yeni adımlar başlasın' : 'Duraklat — yeni adım başlatma'}
        >
          {paused ? (
            <>
              <Pause className="ic" />
              <span>paused</span>
            </>
          ) : (
            <>
              <Play className="ic" style={running > 0 ? { color: 'var(--green)' } : undefined} />
              {running > 0 && (
                <span className="foot-dot dot-pulse" style={{ background: 'var(--green)' }} />
              )}
              <span style={running > 0 ? { color: 'var(--green)' } : undefined}>play</span>
            </>
          )}
        </span>
      </div>
    </footer>
  );
}
