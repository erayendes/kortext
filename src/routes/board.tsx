import { useMemo, useState } from 'react';
import { Filter, Plus } from 'lucide-react';
import { PageHeader } from '../components/PageHeader.tsx';
import { usePolling } from '../lib/api.ts';
import type { BacklogItem } from '../lib/api-types.ts';
import { personaColor } from '../lib/persona-colors.ts';

type ColumnStatus = 'to_do' | 'in_progress' | 'test' | 'review' | 'done';

const COLUMNS: { status: ColumnStatus; label: string; tone: string; addable: boolean }[] = [
  { status: 'to_do', label: 'To do', tone: 'dot-muted', addable: true },
  { status: 'in_progress', label: 'In progress', tone: 'dot-signal dot-pulse', addable: true },
  { status: 'test', label: 'Test', tone: 'dot-info', addable: true },
  { status: 'review', label: 'Review', tone: 'dot-warning', addable: true },
  { status: 'done', label: 'Done', tone: 'dot-success', addable: false },
];

const TYPE_MARK: Record<BacklogItem['type'], { color: string; bg: string; label: string }> = {
  task: { color: 'var(--info)', bg: 'rgba(59,130,246,0.10)', label: 'Task' },
  bug: { color: 'var(--danger)', bg: 'rgba(239,68,68,0.10)', label: 'Bug' },
  debt: { color: 'var(--warning)', bg: 'rgba(245,158,11,0.10)', label: 'Debt' },
  spike: { color: 'var(--accent-soft)', bg: 'rgba(192,132,252,0.10)', label: 'Spike' },
  hotfix: { color: 'var(--signal-soft)', bg: 'rgba(244,114,182,0.10)', label: 'Hotfix' },
  epic: { color: 'var(--accent-soft)', bg: 'rgba(168,85,247,0.15)', label: 'Epic' },
};

export function BoardRoute() {
  const { data, error, loading } = usePolling<{ items: BacklogItem[] }>(
    '/api/backlog?limit=300',
    5000,
  );
  const items = useMemo(() => data?.items ?? [], [data]);

  const epics = useMemo(() => items.filter((i) => i.type === 'epic'), [items]);
  const nonEpics = useMemo(() => items.filter((i) => i.type !== 'epic'), [items]);

  const [epicFilter, setEpicFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const agents = useMemo(() => {
    const set = new Set<string>();
    for (const it of nonEpics) if (it.owner) set.add(it.owner);
    return Array.from(set).sort();
  }, [nonEpics]);

  const visibleItems = useMemo(() => {
    return nonEpics.filter((it) => {
      if (epicFilter !== 'all' && it.parent_id !== epicFilter) return false;
      if (agentFilter !== 'all' && it.owner !== agentFilter) return false;
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      // cancelled items are hidden from the board (v4 has no Cancelled column).
      if (it.status === 'cancelled') return false;
      return true;
    });
  }, [nonEpics, epicFilter, agentFilter, statusFilter]);

  const buckets = useMemo(() => {
    const m = new Map<ColumnStatus, BacklogItem[]>();
    for (const col of COLUMNS) m.set(col.status, []);
    for (const it of visibleItems) {
      // 'blocked' renders as a variant inside In progress (v4 pattern);
      // 'cancelled' was already filtered out above.
      if (it.status === 'cancelled') continue;
      const bucket: ColumnStatus = it.status === 'blocked' ? 'in_progress' : it.status;
      m.get(bucket)?.push(it);
    }
    return m;
  }, [visibleItems]);

  const epicStats = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const it of nonEpics) {
      if (!it.parent_id) continue;
      const s = m.get(it.parent_id) ?? { total: 0, done: 0 };
      s.total++;
      if (it.status === 'done') s.done++;
      m.set(it.parent_id, s);
    }
    return m;
  }, [nonEpics]);

  const totalTasks = nonEpics.length;
  const subtitle = `${totalTasks} item${totalTasks === 1 ? '' : 's'} across ${epics.length} epic${epics.length === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Board"
        subtitle={subtitle}
        actions={
          <>
            <FilterSelect
              value={epicFilter}
              onChange={setEpicFilter}
              options={[
                { value: 'all', label: 'Epic: All' },
                ...epics.map((e) => ({ value: e.id, label: e.id })),
              ]}
            />
            <FilterSelect
              value={agentFilter}
              onChange={setAgentFilter}
              options={[
                { value: 'all', label: 'Agent: All' },
                ...agents.map((a) => ({ value: a, label: a })),
              ]}
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'Status: All' },
                ...COLUMNS.map((c) => ({ value: c.status, label: c.label })),
                { value: 'blocked', label: 'Blocked' },
              ]}
            />
            <button className="btn btn-outline btn-xs">
              <Filter className="w-3 h-3" /> Filter
            </button>
            <button className="btn btn-primary btn-xs">
              <Plus className="w-3 h-3" /> New task
            </button>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-x-auto px-6 py-4">
        {error && <div className="text-[13px] text-danger mb-3">{error}</div>}
        {loading && !data && <div className="text-[13px] text-tx-3">loading backlog…</div>}

        <div className="flex gap-3 h-full items-stretch pb-3">
          <EpicColumn epics={epics} stats={epicStats} />
          {COLUMNS.map((col) => (
            <StatusColumn
              key={col.status}
              label={col.label}
              tone={col.tone}
              addable={col.addable}
              items={buckets.get(col.status) ?? []}
              isDone={col.status === 'done'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="input"
      style={{ padding: '5px 10px', width: 'auto', fontSize: 12 }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function EpicColumn({
  epics,
  stats,
}: {
  epics: BacklogItem[];
  stats: Map<string, { total: number; done: number }>;
}) {
  return (
    <section className="w-[240px] shrink-0 border border-border-default rounded-lg p-2.5 flex flex-col gap-2 min-h-0">
      <header className="flex items-center gap-2 px-1 pt-1 pb-2 border-b border-border-subtle">
        <span className="dot dot-accent" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-tx-3">
          Epic
        </span>
        <span className="mono text-[11px] text-tx-3">{epics.length}</span>
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto pr-0.5">
        {epics.length === 0 && (
          <p className="text-[11px] text-tx-disabled px-2 py-3">no epics</p>
        )}
        {epics.map((epic) => {
          const s = stats.get(epic.id) ?? { total: 0, done: 0 };
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <article
              key={epic.id}
              className="border border-border-default rounded-md p-3 bg-bg-0 cursor-pointer hover:border-border-strong transition-colors duration-200"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="mono text-[10px] text-tx-3">{epic.id}</span>
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-px rounded"
                  style={{
                    color: 'var(--accent-soft)',
                    background: 'rgba(168,85,247,0.15)',
                  }}
                >
                  Strategic
                </span>
              </div>
              <div className="text-[13px] text-tx-1 leading-snug mb-2">{epic.title}</div>
              <div className="h-[3px] bg-bg-2 rounded-sm overflow-hidden mb-2">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-tx-3">
                <span>
                  {s.total} task{s.total === 1 ? '' : 's'} · {s.done} done
                </span>
                <span>{epic.owner ?? 'unassigned'}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusColumn({
  label,
  tone,
  addable,
  items,
  isDone,
}: {
  label: string;
  tone: string;
  addable: boolean;
  items: BacklogItem[];
  isDone: boolean;
}) {
  return (
    <section className="w-[286px] shrink-0 bg-bg-1 border border-border-default rounded-lg p-2.5 flex flex-col gap-2 min-h-0">
      <header className="flex items-center gap-2 px-1 pt-1 pb-2 border-b border-border-subtle">
        <span className={`dot ${tone}`} />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-tx-3">
          {label}
        </span>
        <span className="mono text-[11px] text-tx-3">{items.length}</span>
        {addable && (
          <button
            type="button"
            className="text-tx-3 hover:text-tx-1 p-0.5 transition-colors"
            aria-label={`Add to ${label}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto pr-0.5">
        {items.length === 0 && (
          <p className="text-[11px] text-tx-disabled px-2 py-3">empty</p>
        )}
        {items.map((it) => (
          <Card key={it.id} item={it} dimmed={isDone} />
        ))}
      </div>
    </section>
  );
}

function Card({ item, dimmed }: { item: BacklogItem; dimmed: boolean }) {
  const blocked = item.status === 'blocked';
  const mark = TYPE_MARK[item.type];
  const titleStyle = dimmed ? 'line-through' : '';
  // 'AC X/Y' progress info travels in frontmatter when present.
  const fm = item.frontmatter as { ac_done?: number; ac_total?: number };
  const acDone = typeof fm.ac_done === 'number' ? fm.ac_done : null;
  const acTotal = typeof fm.ac_total === 'number' ? fm.ac_total : null;

  return (
    <article
      className={[
        'border border-border-default rounded-md px-3 py-2.5 bg-bg-0 cursor-pointer transition-colors duration-200 hover:border-border-strong relative',
        blocked ? 'border-l-2 border-l-danger' : '',
        dimmed ? 'opacity-55' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="mono text-[10px] text-tx-3">{item.id}</span>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-px rounded leading-tight"
          style={{ color: mark.color, background: mark.bg }}
        >
          {mark.label}
        </span>
        {item.parent_id && (
          <span className="ml-auto mono text-[10px] text-tx-3">{item.parent_id}</span>
        )}
        {blocked && !item.parent_id && (
          <span className="ml-auto text-[10px] text-danger">blocked</span>
        )}
      </div>

      <div className={`text-[13px] text-tx-1 leading-snug mb-2 ${titleStyle}`}>
        {item.title}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        {item.owner ? (
          <code
            className="mono"
            style={{ color: personaColor(item.owner) }}
          >
            {item.owner}
          </code>
        ) : (
          <span className="text-tx-disabled">unassigned</span>
        )}
        <CardTail item={item} blocked={blocked} acDone={acDone} acTotal={acTotal} dimmed={dimmed} />
      </div>
    </article>
  );
}

function CardTail({
  item,
  blocked,
  acDone,
  acTotal,
  dimmed,
}: {
  item: BacklogItem;
  blocked: boolean;
  acDone: number | null;
  acTotal: number | null;
  dimmed: boolean;
}) {
  if (dimmed) {
    return <span className="text-success">✓ all AC</span>;
  }
  if (blocked) {
    const fm = item.frontmatter as { blocked_reason?: string };
    return (
      <span className="text-danger">
        {fm.blocked_reason ? `blocked: ${fm.blocked_reason}` : 'blocked'}
      </span>
    );
  }
  if (acDone !== null && acTotal !== null) {
    return (
      <span className="text-tx-3">
        AC {acDone}/{acTotal}
      </span>
    );
  }
  if (item.status === 'to_do') {
    const fm = item.frontmatter as { waiting?: boolean };
    if (fm.waiting) return <span className="text-warning">waiting</span>;
  }
  return null;
}
