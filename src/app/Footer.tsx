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
import { Bot, GitBranch, ShieldUser, Terminal, ChevronUp } from 'lucide-react';
import { usePolling } from '../lib/api.ts';
import { emitShell } from './shell-events.ts';
import type { Run } from '../lib/api-types.ts';

/** Open a footer popover anchored under the foot-item that was clicked. */
function openPop(
  name: 'open-agents' | 'open-worktrees' | 'open-review' | 'open-terminal',
  el: HTMLElement,
): void {
  emitShell(name, { rect: el.getBoundingClientRect() });
}

type DriveLite = { armed: boolean; inFlight: boolean };

export function Footer() {
  const runs = usePolling<{ runs: Run[] }>('/api/runs', 5000);
  const drive = usePolling<DriveLite>('/api/drive', 4000);

  const runList = runs.data?.runs ?? [];
  // Real agent runtime, straight from the run records (matches the Terminal).
  const running = runList.filter((r) => r.status === 'running').length;
  const queued = runList.filter((r) => r.status === 'queued').length;
  const awaiting = runList.filter((r) => r.status === 'awaiting_approval').length;
  // A drive pass spans several agent sub-steps; individual runs flip
  // running→succeeded fast, so the count alone can read 0 mid-pass. `driving`
  // (inFlight) is the honest "the house is working right now" signal.
  const driving = drive.data?.inFlight ?? false;

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
      <span className="foot-item" style={{ cursor: 'default' }} title="Kortext daemon">
        <span
          className="foot-dot"
          style={{ background: connected ? 'var(--green)' : 'var(--red)' }}
        />
        <span className="mono">daemon :3200</span>
      </span>

      <span
        className="foot-item"
        onClick={(e) => openPop('open-agents', e.currentTarget)}
        title={
          driving
            ? 'Driver pass in progress — agents are working'
            : 'active: çalışıyor · idle: sırada · blocked: onay bekliyor'
        }
      >
        <Bot className="ic" />
        {driving && (
          <span
            className="foot-dot dot-pulse"
            style={{ background: 'var(--green)' }}
            aria-label="driving"
          />
        )}
        <span className="mono">
          <span style={{ color: 'var(--green)' }}>{running} active</span>{' '}
          <span className="faint">·</span> <span style={{ color: 'var(--amber)' }}>{queued} idle</span>{' '}
          <span className="faint">·</span>{' '}
          <span style={{ color: 'var(--red)' }}>{awaiting} blocked</span>
        </span>
        <ChevronUp className="ic" />
      </span>

      <span className="foot-item" onClick={(e) => openPop('open-worktrees', e.currentTarget)}>
        <GitBranch className="ic" />
        <span className="mono">{worktrees} worktrees</span>
        <ChevronUp className="ic" />
      </span>

      <div className="foot-right">
        <span
          className="foot-item"
          onClick={(e) => openPop('open-review', e.currentTarget)}
          title="Skip reviews"
        >
          <ShieldUser className="ic" />
          <span style={{ color: 'var(--violet)' }}>review</span>
          <ChevronUp className="ic" />
        </span>
        <span className="foot-item" onClick={(e) => openPop('open-terminal', e.currentTarget)}>
          <Terminal className="ic" />
          Terminal
        </span>
      </div>
    </footer>
  );
}
