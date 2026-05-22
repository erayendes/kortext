import { useMemo, useState } from 'react';
import { usePolling } from '../lib/api.ts';
import { useShell } from '../lib/shell-store.tsx';
import type { Handover, Run } from '../lib/api-types.ts';
import { Activity, X, Search, ChevronDown } from 'lucide-react';
import { personaColor } from '../lib/persona-colors.ts';

type Event =
  | { kind: 'run'; id: string; at: number; run: Run }
  | { kind: 'handover'; id: string; at: number; handover: Handover };

type FilterKind = 'all' | 'run' | 'handover';

const FILTER_LABEL: Record<FilterKind, string> = {
  all: 'All events',
  run: 'Runs',
  handover: 'Handovers',
};

function formatClock(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Right-side drawer — recent activity. Mixes handovers + runs into a single
 * reverse-chronological stream with persona-routed colour, an event-kind
 * filter, and a free-text search. Refreshes via two independent polls (5s).
 */
export function TimelinePanel() {
  const { timelineOpen, closeTimeline } = useShell();
  const { data: runsData } = usePolling<{ runs: Run[] }>('/api/runs?limit=20', 5000);
  const { data: hData } = usePolling<{ handovers: Handover[] }>('/api/handovers?limit=20', 5000);

  const [filter, setFilter] = useState<FilterKind>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');

  const events = useMemo<Event[]>(() => {
    if (!timelineOpen) return [];
    const list: Event[] = [];
    for (const r of runsData?.runs ?? []) {
      list.push({
        kind: 'run',
        id: `r-${r.id}`,
        at: r.started_at ?? r.created_at,
        run: r,
      });
    }
    for (const h of hData?.handovers ?? []) {
      list.push({ kind: 'handover', id: `h-${h.id}`, at: h.created_at, handover: h });
    }
    list.sort((a, b) => b.at - a.at);
    return list.slice(0, 30);
  }, [timelineOpen, runsData, hData]);

  const filtered = events.filter((e) => {
    if (filter !== 'all' && e.kind !== filter) return false;
    if (search.trim().length === 0) return true;
    const needle = search.toLowerCase();
    if (e.kind === 'run') {
      return (
        e.run.workflow_id.toLowerCase().includes(needle) ||
        e.run.status.includes(needle) ||
        (e.run.item_id ?? '').toLowerCase().includes(needle)
      );
    }
    return (
      e.handover.from_persona.toLowerCase().includes(needle) ||
      e.handover.to_persona.toLowerCase().includes(needle) ||
      (e.handover.reason ?? '').toLowerCase().includes(needle)
    );
  });

  if (!timelineOpen) return null;

  return (
    <aside
      className="fixed top-[var(--header-h)] bottom-[var(--footer-h)] right-0 w-[380px] border-l z-30 flex flex-col"
      style={{
        background: 'var(--bg-1)',
        borderColor: 'var(--border-default)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.35)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.10em] text-tx-2">
          <Activity size={13} style={{ color: 'var(--accent)' }} />
          Timeline
        </div>
        <button
          type="button"
          onClick={closeTimeline}
          className="text-tx-3 hover:text-tx-1 transition-colors"
          aria-label="Close timeline"
        >
          <X size={14} />
        </button>
      </div>

      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Event-kind dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md"
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border-default)',
              color: 'var(--tx-2)',
            }}
          >
            {FILTER_LABEL[filter]}
            <ChevronDown size={11} />
          </button>
          {filterOpen ? (
            <div
              className="absolute top-full left-0 mt-1 rounded-md py-1 z-10"
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border-default)',
                minWidth: '120px',
              }}
            >
              {(Object.keys(FILTER_LABEL) as FilterKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setFilter(k);
                    setFilterOpen(false);
                  }}
                  className="block w-full text-left px-3 py-1 text-[11px] hover:bg-bg-3 transition-colors"
                  style={{ color: filter === k ? 'var(--tx-1)' : 'var(--tx-3)' }}
                >
                  {FILTER_LABEL[k]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={11}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-tx-3"
          />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-[11px] py-1 pl-7 pr-2 rounded-md"
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border-default)',
              color: 'var(--tx-1)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-4 text-[13px] text-tx-3">No events match.</div>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((e) => (
              <li
                key={e.id}
                className="grid items-start gap-2 px-2 py-1.5 rounded hover:bg-bg-2 transition-colors"
                style={{ gridTemplateColumns: '42px 1fr' }}
              >
                <span className="mono text-[11px] text-tx-3 mt-0.5">
                  {formatClock(e.at)}
                </span>
                <div className="text-[12px] text-tx-2 leading-snug">
                  {e.kind === 'run' ? (
                    <RunEvent run={e.run} />
                  ) : (
                    <HandoverEvent h={e.handover} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function RunEvent({ run }: { run: Run }) {
  const tone = runStatusTone(run.status);
  return (
    <span>
      <span className="mono" style={{ color: tone }}>
        {run.status}
      </span>
      <span className="text-tx-3"> · </span>
      <span className="mono" style={{ color: 'var(--accent-soft)' }}>
        {run.workflow_id}
      </span>
      <span className="text-tx-3"> · </span>
      <span className="mono text-tx-3">#{run.id}</span>
      {run.item_id ? (
        <>
          <span className="text-tx-3"> · </span>
          <span className="mono text-tx-3">{run.item_id}</span>
        </>
      ) : null}
    </span>
  );
}

function HandoverEvent({ h }: { h: Handover }) {
  return (
    <span>
      <span className="mono" style={{ color: personaColor(h.from_persona), fontWeight: 600 }}>
        {h.from_persona}
      </span>
      <span className="text-tx-3 mx-1">→</span>
      <span className="mono" style={{ color: personaColor(h.to_persona), fontWeight: 600 }}>
        {h.to_persona}
      </span>
      {h.item_id ? (
        <>
          <span className="text-tx-3 mx-1">·</span>
          <span className="mono text-tx-3">{h.item_id}</span>
        </>
      ) : null}
      {h.reason ? (
        <>
          <span className="text-tx-3 mx-1">—</span>
          <span className="text-tx-2">{h.reason}</span>
        </>
      ) : null}
    </span>
  );
}

function runStatusTone(s: Run['status']): string {
  switch (s) {
    case 'running':
      return 'var(--signal)';
    case 'failed':
      return 'var(--danger)';
    case 'succeeded':
      return 'var(--success)';
    case 'awaiting_approval':
      return 'var(--warning)';
    default:
      return 'var(--tx-3)';
  }
}
