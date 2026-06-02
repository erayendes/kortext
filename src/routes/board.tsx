import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader.tsx';
import { TaskDrawer, EpicDrawer } from '../components/BoardDrawers.tsx';
import { apiPost, usePolling } from '../lib/api.ts';
import type { ApiPostError } from '../lib/api.ts';
import type { BacklogItem, PersonaSummary } from '../lib/api-types.ts';
import { personaColor } from '../lib/persona-colors.ts';

type ColumnStatus = 'to_do' | 'in_progress' | 'test' | 'review' | 'done';

const COLUMNS: { status: ColumnStatus; label: string; tone: string; addable: boolean }[] = [
  { status: 'to_do', label: 'To do', tone: 'dot-neutral', addable: true },
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

const TYPE_OPTIONS: BacklogItem['type'][] = [
  'task',
  'bug',
  'epic',
  'debt',
  'spike',
  'hotfix',
];

export function BoardRoute() {
  const { data, error, loading, refresh } = usePolling<{ items: BacklogItem[] }>(
    '/api/backlog?limit=300',
    5000,
  );
  const items = useMemo(() => data?.items ?? [], [data]);

  const epics = useMemo(() => items.filter((i) => i.type === 'epic'), [items]);
  const nonEpics = useMemo(() => items.filter((i) => i.type !== 'epic'), [items]);

  const [epicFilter, setEpicFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalParent, setModalParent] = useState<string | undefined>(undefined);
  const [openItem, setOpenItem] = useState<BacklogItem | null>(null);
  const [openEpic, setOpenEpic] = useState<BacklogItem | null>(null);

  function openNewItemModal(parentId?: string) {
    setModalParent(parentId);
    setModalOpen(true);
  }

  const agents = useMemo(() => {
    const set = new Set<string>();
    for (const it of nonEpics) if (it.owner) set.add(it.owner);
    return Array.from(set).sort();
  }, [nonEpics]);

  const visibleItems = useMemo(() => {
    return nonEpics.filter((it) => {
      if (epicFilter !== 'all' && it.parent_id !== epicFilter) return false;
      if (agentFilter !== 'all' && it.owner !== agentFilter) return false;
      // cancelled items are hidden from the board (v4 has no Cancelled column).
      if (it.status === 'cancelled') return false;
      return true;
    });
  }, [nonEpics, epicFilter, agentFilter]);

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
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => openNewItemModal()}
            >
              <Plus className="w-3 h-3" /> New task
            </button>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-x-auto px-6 py-4">
        {error && <div className="text-[13px] text-danger mb-3">{error}</div>}
        {loading && !data && <div className="text-[13px] text-tx-3">loading backlog…</div>}

        <div className="flex gap-3 h-full items-stretch pb-3">
          <EpicColumn epics={epics} stats={epicStats} onOpenEpic={setOpenEpic} />
          {COLUMNS.map((col) => (
            <StatusColumn
              key={col.status}
              label={col.label}
              tone={col.tone}
              addable={col.addable}
              items={buckets.get(col.status) ?? []}
              isDone={col.status === 'done'}
              onAdd={() => openNewItemModal()}
              onOpen={setOpenItem}
            />
          ))}
        </div>
      </div>

      {modalOpen && (
        <NewItemModal
          epics={epics}
          defaultParentId={modalParent}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            refresh();
          }}
        />
      )}

      {openItem && (
        <TaskDrawer
          item={openItem}
          epicTitle={epics.find((e) => e.id === openItem.parent_id)?.title ?? null}
          onClose={() => setOpenItem(null)}
        />
      )}

      {openEpic && (
        <EpicDrawer
          epic={openEpic}
          items={nonEpics}
          onClose={() => setOpenEpic(null)}
          onAddTask={(epicId) => {
            setOpenEpic(null);
            openNewItemModal(epicId);
          }}
        />
      )}
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
  onOpenEpic,
}: {
  epics: BacklogItem[];
  stats: Map<string, { total: number; done: number }>;
  onOpenEpic: (epic: BacklogItem) => void;
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
              role="button"
              tabIndex={0}
              onClick={() => onOpenEpic(epic)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenEpic(epic);
                }
              }}
              className="border border-border-default rounded-md p-3 bg-bg-0 cursor-pointer hover:border-border-strong transition-colors duration-200 focus:outline-none focus-visible:border-accent"
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
  onAdd,
  onOpen,
}: {
  label: string;
  tone: string;
  addable: boolean;
  items: BacklogItem[];
  isDone: boolean;
  onAdd: () => void;
  onOpen: (item: BacklogItem) => void;
}) {
  return (
    <section className="w-[286px] shrink-0 bg-bg-1 border border-border-default rounded-lg pt-2.5 px-2.5 pb-3 flex flex-col gap-2 min-h-0">
      <header className="flex items-center gap-2 px-1 pt-1 pb-2 border-b border-border-subtle">
        <span className={`dot ${tone}`} />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-tx-3">
          {label}
        </span>
        <span className="mono text-[11px] text-tx-3">{items.length}</span>
        {addable && (
          <button
            type="button"
            onClick={onAdd}
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
          <Card key={it.id} item={it} dimmed={isDone} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function Card({
  item,
  dimmed,
  onOpen,
}: {
  item: BacklogItem;
  dimmed: boolean;
  onOpen: (item: BacklogItem) => void;
}) {
  const blocked = item.status === 'blocked';
  const mark = TYPE_MARK[item.type];
  const titleStyle = dimmed ? 'line-through' : '';
  // 'AC X/Y' progress info travels in frontmatter when present.
  const fm = item.frontmatter as { ac_done?: number; ac_total?: number };
  const acDone = typeof fm.ac_done === 'number' ? fm.ac_done : null;
  const acTotal = typeof fm.ac_total === 'number' ? fm.ac_total : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
      className={[
        'border border-border-default rounded-md px-3 py-2.5 bg-bg-0 cursor-pointer transition-colors duration-200 hover:border-border-strong relative focus:outline-none focus-visible:border-accent',
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

// ───────────────────────── new-item modal (Faz 12.9)

function NewItemModal({
  epics,
  defaultParentId,
  onClose,
  onCreated,
}: {
  epics: BacklogItem[];
  defaultParentId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const personas = usePolling<{ personas: PersonaSummary[] }>('/api/personas', 60_000);
  const personaList = personas.data?.personas ?? [];

  const [type, setType] = useState<BacklogItem['type']>('task');
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState<string>(defaultParentId ?? '');
  const [owner, setOwner] = useState<string>('');
  const [acceptance, setAcceptance] = useState('');
  const [blocks, setBlocks] = useState('');
  const [blockedBy, setBlockedBy] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    // Frontmatter carries acceptance + dependencies + notes — the Markdown
    // body is template-seeded server-side so the persistent .md stays
    // human-readable. Empty strings are dropped to keep the JSON tidy.
    const frontmatter: Record<string, unknown> = {};
    const acceptanceList = acceptance
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (acceptanceList.length > 0) {
      frontmatter.acceptance_criteria = acceptanceList;
      frontmatter.ac_total = acceptanceList.length;
      frontmatter.ac_done = 0;
    }
    const blocksList = parseChips(blocks);
    if (blocksList.length > 0) frontmatter.blocks = blocksList;
    const blockedByList = parseChips(blockedBy);
    if (blockedByList.length > 0) frontmatter.blocked_by = blockedByList;
    const trimmedNotes = notes.trim();
    if (trimmedNotes.length > 0) frontmatter.notes = trimmedNotes;

    try {
      await apiPost<{ item: BacklogItem }>('/api/backlog', {
        type,
        title: trimmedTitle,
        parent_id: parentId || null,
        owner: owner || null,
        frontmatter,
      });
      onCreated();
    } catch (e) {
      const err = e as ApiPostError | Error;
      const message =
        'message' in err && typeof err.message === 'string'
          ? err.message
          : 'error' in err && typeof err.error === 'string'
            ? err.error
            : String(err);
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,8,20,0.78)' }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="border border-border-default bg-bg-0 rounded-lg w-[560px] max-w-[92vw] max-h-[88vh] flex flex-col"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-tx-1 font-medium">New backlog item</span>
            <span className="mono text-[11px] text-tx-3">+ auto id</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="text-tx-3 hover:text-tx-1 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3.5">
          <FormRow label="Type" hint="What kind of work item is this?">
            <select
              className="input mono"
              value={type}
              onChange={(e) => setType(e.target.value as BacklogItem['type'])}
              style={{ width: 200 }}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TYPE_MARK[t].label.toLowerCase()}
                </option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Title" hint="One-line summary — visible on the board card" required>
            <input
              ref={titleRef}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Email verification flow"
              maxLength={200}
            />
          </FormRow>

          <FormRow label="Epic" hint="Parent epic (optional)">
            <select
              className="input mono"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              style={{ width: 240 }}
            >
              <option value="">— none —</option>
              {epics.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.id} · {ep.title}
                </option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Owner" hint="Assigned persona (optional)">
            <select
              className="input mono"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              style={{ width: 240, color: owner ? personaColor(owner) : undefined }}
            >
              <option value="">— unassigned —</option>
              {/* +prime is the human operator (you) — assignable for human-owned work. */}
              <option value="+prime">+prime (you)</option>
              {personaList
                .filter((p) => p.handle !== '+prime' && p.handle !== 'prime')
                .map((p) => {
                  const handle = p.handle.startsWith('+') ? p.handle : `+${p.handle}`;
                  return (
                    <option key={handle} value={handle}>
                      {handle}
                    </option>
                  );
                })}
            </select>
          </FormRow>

          <FormRow label="Acceptance criteria" hint="One per line — drives the AC X/Y card progress">
            <textarea
              className="input mono"
              value={acceptance}
              onChange={(e) => setAcceptance(e.target.value)}
              rows={3}
              placeholder={'Email is verified within 5 minutes\nResend link works after 30s'}
              style={{ resize: 'vertical', minHeight: 60, width: '100%' }}
            />
          </FormRow>

          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Blocks" hint="Comma-separated item ids">
              <input
                className="input mono"
                value={blocks}
                onChange={(e) => setBlocks(e.target.value)}
                placeholder="T03, B02"
              />
            </FormRow>
            <FormRow label="Blocked by" hint="Comma-separated item ids">
              <input
                className="input mono"
                value={blockedBy}
                onChange={(e) => setBlockedBy(e.target.value)}
                placeholder="T01"
              />
            </FormRow>
          </div>

          <FormRow label="Notes" hint="Free-form context (optional)">
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ resize: 'vertical', minHeight: 48, width: '100%' }}
            />
          </FormRow>

          {submitError && (
            <div className="text-[12px] text-danger mono">{submitError}</div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-subtle">
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={submit}
            disabled={!canSubmit}
          >
            {submitting ? 'Creating…' : 'Create item'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FormRow({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.08em] text-tx-3 font-semibold">
        {label}
        {required && <span className="text-signal ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-tx-3">{hint}</span>}
    </label>
  );
}

function parseChips(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
