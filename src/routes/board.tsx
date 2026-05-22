import { useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.tsx';
import { usePolling } from '../lib/api.ts';
import type { BacklogItem } from '../lib/api-types.ts';

type Status = BacklogItem['status'];

const COLUMNS: { status: Status; label: string; tone: string }[] = [
  { status: 'to_do', label: 'To do', tone: 'dot-muted' },
  { status: 'in_progress', label: 'In progress', tone: 'dot-signal dot-pulse' },
  { status: 'blocked', label: 'Blocked', tone: 'dot-danger' },
  { status: 'review', label: 'Review', tone: 'dot-warning' },
  { status: 'done', label: 'Done', tone: 'dot-success' },
  { status: 'cancelled', label: 'Cancelled', tone: 'dot-muted' },
];

const TYPE_BADGE: Record<BacklogItem['type'], string> = {
  epic: 'text-accent-soft border-accent/30',
  task: 'text-tx-2 border-border-default',
  bug: 'text-danger border-danger/30',
  debt: 'text-warning border-warning/30',
  spike: 'text-info border-info/30',
  hotfix: 'text-signal-soft border-signal/30',
};

export function BoardRoute() {
  const { data, error, loading } = usePolling<{ items: BacklogItem[] }>(
    '/api/backlog?limit=300',
    5000,
  );
  const items = useMemo(() => data?.items ?? [], [data]);

  // Bucket items by status. Skip epics from board columns — they are
  // a parent grouping, not a workflow state.
  const buckets = useMemo(() => {
    const m = new Map<Status, BacklogItem[]>();
    for (const col of COLUMNS) m.set(col.status, []);
    for (const item of items) {
      if (item.type === 'epic') continue;
      m.get(item.status)?.push(item);
    }
    return m;
  }, [items]);

  const epics = useMemo(() => items.filter((i) => i.type === 'epic'), [items]);
  const totalTasks = items.length - epics.length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Board"
        subtitle={`${totalTasks} item${totalTasks === 1 ? '' : 's'} across ${epics.length} epic${epics.length === 1 ? '' : 's'}.`}
      />
      <div className="px-6 py-5 flex-1 overflow-x-auto">
        {error && <div className="text-[13px] text-danger mb-3">{error}</div>}
        {loading && !data && <div className="text-[13px] text-tx-3">loading backlog…</div>}
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(220px, 1fr))` }}>
          {COLUMNS.map((col) => {
            const colItems = buckets.get(col.status) ?? [];
            return (
              <section
                key={col.status}
                className="rounded-lg border border-border-subtle bg-bg-1 flex flex-col min-h-[200px]"
              >
                <header className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className={`dot ${col.tone}`} />
                    <span className="text-[12px] uppercase tracking-[0.10em] text-tx-2">{col.label}</span>
                  </div>
                  <span className="mono text-[11px] text-tx-3">{colItems.length}</span>
                </header>
                <ul className="p-2 flex flex-col gap-2">
                  {colItems.length === 0 && (
                    <li className="text-[11px] text-tx-disabled px-2 py-3">empty</li>
                  )}
                  {colItems.map((item) => (
                    <BoardCard key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BoardCard({ item }: { item: BacklogItem }) {
  return (
    <li className="rounded border border-border-subtle bg-bg-2 px-3 py-2 hover:border-border-default transition-colors duration-200">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="mono text-[11px] text-tx-3">{item.id}</span>
        <span
          className={`mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded ${TYPE_BADGE[item.type]}`}
        >
          {item.type}
        </span>
      </div>
      <div className="text-[13px] text-tx-1 leading-snug">{item.title}</div>
      {(item.owner || item.parent_id) && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-tx-3">
          {item.owner && <code className="mono">{item.owner}</code>}
          {item.parent_id && (
            <>
              {item.owner && <span className="text-tx-disabled">·</span>}
              <span className="mono">{item.parent_id}</span>
            </>
          )}
        </div>
      )}
    </li>
  );
}
