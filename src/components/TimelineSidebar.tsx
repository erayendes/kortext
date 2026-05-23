import { useMemo, useState } from 'react';
import { Activity, ChevronsRight } from 'lucide-react';
import { usePolling } from '../lib/api.ts';
import type { Handover, Run } from '../lib/api-types.ts';
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

export function TimelineSidebar({ onClose }: { onClose?: () => void } = {}) {
  const { data: runsData } = usePolling<{ runs: Run[] }>('/api/runs?limit=20', 5000);
  const { data: hData } = usePolling<{ handovers: Handover[] }>('/api/handovers?limit=20', 5000);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [search, setSearch] = useState('');

  const events = useMemo<Event[]>(() => {
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
  }, [runsData, hData]);

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

  return (
    <aside
      className="w-[340px] flex-shrink-0 border-l flex flex-col"
      style={{
        background: 'var(--bg-0)',
        borderLeftColor: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderBottomColor: 'rgba(255, 255, 255, 0.08)' }}
      >
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em] text-tx-2">
          <Activity size={12} style={{ color: 'var(--accent)' }} />
          Timeline
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-tx-3 hover:text-tx-1 transition-colors"
            aria-label="Close timeline"
          >
            <ChevronsRight size={14} />
          </button>
        ) : null}
      </div>

      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{ borderBottomColor: 'rgba(255, 255, 255, 0.08)' }}
      >
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterKind)}
          className="text-[11px] py-1 px-2 rounded"
          style={{
            background: 'var(--bg-1)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--tx-2)',
            outline: 'none',
          }}
        >
          {(Object.keys(FILTER_LABEL) as FilterKind[]).map((k) => (
            <option key={k} value={k}>
              {FILTER_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-[11px] py-1 px-2 rounded"
          style={{
            background: 'var(--bg-1)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--tx-1)',
            outline: 'none',
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filtered.length === 0 ? (
          <div className="px-1 py-3 text-[13px] text-tx-3">No events.</div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((e) => (
              <li
                key={e.id}
                className="grid items-start gap-2 py-1.5"
                style={{ gridTemplateColumns: '40px 14px 1fr' }}
              >
                <span className="mono text-[11px] text-tx-3 mt-0.5">
                  {formatClock(e.at)}
                </span>
                <span className="mt-1.5">
                  <span className={`dot ${dotForEvent(e)}`} />
                </span>
                <div className="text-[12px] leading-snug">
                  {e.kind === 'run' ? <RunLine run={e.run} /> : <HandoverLine h={e.handover} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function dotForEvent(e: Event): string {
  if (e.kind === 'handover') return 'dot-info';
  switch (e.run.status) {
    case 'succeeded':
      return 'dot-success';
    case 'failed':
      return 'dot-danger';
    case 'awaiting_approval':
      return 'dot-warning';
    case 'running':
      return 'dot-success';
    default:
      return 'dot-muted';
  }
}

function RunLine({ run }: { run: Run }) {
  return (
    <span>
      <span className="mono" style={{ color: 'var(--accent-soft)' }}>
        {run.workflow_id}
      </span>
      <span className="text-tx-3"> · </span>
      <span className="text-tx-2">{run.status}</span>
      {run.item_id ? (
        <>
          <span className="text-tx-3"> · </span>
          <span className="mono text-tx-3">{run.item_id}</span>
        </>
      ) : null}
    </span>
  );
}

function HandoverLine({ h }: { h: Handover }) {
  return (
    <span>
      <span className="mono" style={{ color: personaColor(h.from_persona) }}>
        {h.from_persona}
      </span>
      <span className="text-tx-3 mx-1">→</span>
      <span className="mono" style={{ color: personaColor(h.to_persona) }}>
        {h.to_persona}
      </span>
      {h.reason ? (
        <>
          <span className="text-tx-3 mx-1">·</span>
          <span className="text-tx-2">{h.reason}</span>
        </>
      ) : null}
    </span>
  );
}
