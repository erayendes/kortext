/**
 * FileBrowser — the 2-pane document reader shared by References / Memory /
 * Foundation / Reports and the engine-scope Agents / Rules / Workflows screens.
 *
 * Structure mirrors design_handoff_kortext `V.docReader`: a `.reader` card with
 * a left `.reader-list` (file rows: kind icon + name + lifecycle `.st-pill`) and
 * a right `.reader-doc` (panel-head with the filename + action, then the
 * markdown body via {@link AnnotatableDoc}).
 *
 * Data is injected by the owning route (`items` + `loadBody`); this component is
 * pure chrome + interaction.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, FileText, BotMessageSquare, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnnotatableDoc, type AnnotateMode, type AskFn } from './AnnotatableDoc.tsx';

export type FBStatus = 'approved' | 'review' | 'draft' | 'ro';

export type FBItem = {
  id: string;
  name: string;
  group?: string;
  author?: string | null;
  status?: FBStatus;
  meta?: string;
};

export type FileBrowserProps = {
  title: string;
  /** Sub-title under the page title (e.g. "12 files · agent-owned"). */
  sub?: string;
  /** Icon shown beside each list row (kind glyph). Defaults to a file glyph. */
  listIcon?: LucideIcon;
  items: FBItem[];
  /** Resolve the markdown body for a selected file id. */
  loadBody: (id: string) => Promise<string>;
  mode: AnnotateMode;
  /** Extra buttons for the right-pane panel-head (e.g. References "Approve"). */
  headerActions?: ReactNode;
  /** Per-file control for the right-pane panel-head, bound to the active file
   *  (e.g. Agents → the persona's model picker). Gets the active file id. */
  detailExtra?: (activeId: string) => ReactNode;
  /** Hide the list row's status pill / meta (e.g. Agents — name only). */
  hideListMeta?: boolean;
  /** Custom list-row glyph per item (e.g. Agents — coloured persona initials). */
  renderIcon?: (item: FBItem) => ReactNode;
  /** Chat handler (clarify mode) — turns each annotation thread into a chat with
   *  real agent answers. Receives the active file id plus the question payload. */
  onAsk?: (id: string, q: { lines: number[]; quote: string; question: string; history: { role: 'prime' | 'agent'; text: string }[] }) => Promise<string>;
  /** Propose a full revised document from a conversation (preview, no write). */
  onPropose?: (id: string, q: { line: number; quote: string; instruction: string; history: { role: 'prime' | 'agent'; text: string }[] }) => Promise<string>;
  /** Persist a confirmed revision for the given file. */
  onApply?: (id: string, body: string) => Promise<void>;
};

/** FBStatus → handoff lifecycle `.st-pill` (label + status-flavour class). */
const STATUS_PILL: Record<FBStatus, { label: string; cls: string }> = {
  approved: { label: 'approved', cls: 's-green' },
  review: { label: 'pending', cls: 's-blue' },
  draft: { label: 'drafting', cls: 's-amber' },
  ro: { label: 'read-only', cls: 's-neutral' },
};

export function FileBrowser({
  title,
  sub,
  listIcon,
  items,
  loadBody,
  mode,
  headerActions,
  detailExtra,
  hideListMeta,
  renderIcon,
  onAsk,
  onPropose,
  onApply,
}: FileBrowserProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [body, setBody] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const ListIcon = listIcon ?? FileText;

  // Keep selection valid as items load/refresh.
  useEffect(() => {
    if (!items.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !items.some((i) => i.id === activeId)) {
      setActiveId(items[0]!.id);
    }
  }, [items, activeId]);

  // Load the selected file's body; reset annotation on file switch.
  useEffect(() => {
    if (!activeId) {
      setBody('');
      return;
    }
    let alive = true;
    setLoading(true);
    setAnnotating(false);
    loadBody(activeId)
      .then((md) => {
        if (alive) setBody(md);
      })
      .catch(() => {
        if (alive) setBody('');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeId, loadBody]);

  const active = items.find((i) => i.id === activeId) ?? null;

  // Group the list when any item carries a `group`.
  const grouped = useMemo(() => {
    const hasGroups = items.some((i) => i.group);
    if (!hasGroups) return [{ group: null as string | null, items }];
    const map = new Map<string, FBItem[]>();
    for (const it of items) {
      const key = it.group ?? 'Other';
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return [...map.entries()].map(([group, gi]) => ({ group, items: gi }));
  }, [items]);

  const toggle = mode === 'clarify' ? 'Ask AI' : null;
  const ToggleIcon = BotMessageSquare;

  return (
    <div className="full">
      <header className="pg-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="pg-title">{title}</h1>
          {sub && <p className="pg-sub">{sub}</p>}
        </div>
      </header>

      <div className="reader card">
        {/* ---- left: file list ---- */}
        <div className="reader-list kx-scroll">
          {grouped.map(({ group, items: gi }) => (
            <div className="reader-grp" key={group ?? '_'}>
              <div className="reader-list-head eyebrow">
                {group ?? `${items.length} file${items.length === 1 ? '' : 's'}`}
              </div>
              {gi.map((it) => {
                const st = it.status ? STATUS_PILL[it.status] : null;
                return (
                  <div
                    key={it.id}
                    className={`doc-item ref-item${it.id === activeId ? ' active' : ''}`}
                    onClick={() => setActiveId(it.id)}
                  >
                    <span className="doc-st st-mono">
                      {renderIcon ? renderIcon(it) : <ListIcon className="ic" />}
                    </span>
                    <span className="doc-item-name mono truncate">{it.name}</span>
                    {hideListMeta ? null : st ? (
                      <span className={`st-pill ${st.cls}`}>{st.label}</span>
                    ) : it.meta ? (
                      <span className="mono faint" style={{ marginLeft: 'auto', fontSize: 11 }}>
                        {it.meta}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          {!items.length && (
            <div style={{ padding: '14px 12px', color: 'var(--fg-faint)', fontSize: 12.5 }}>
              No files
            </div>
          )}
        </div>

        {/* ---- right: viewer ---- */}
        <div className="reader-doc">
          <div className="panel-head">
            <div className="flex items-center gap" style={{ minWidth: 0 }}>
              <span className="mono" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                {active?.name ?? '—'}
              </span>
              {active?.meta && <span className="upd mono faint">{active.meta}</span>}
            </div>
            <div className="flex items-center gap">
              {active && detailExtra ? detailExtra(active.id) : null}
              {toggle &&
                active &&
                (annotating ? (
                  // Both exit Explain — there is no separate global save (each
                  // thread applies its own change). Cancel = abort, Done = finish.
                  <>
                    <button className="btn btn-sm btn-secondary" onClick={() => setAnnotating(false)}>
                      <X style={{ width: 13, height: 13 }} />
                      Cancel
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => setAnnotating(false)}>
                      <Check style={{ width: 13, height: 13 }} />
                      Done
                    </button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-secondary" onClick={() => setAnnotating(true)}>
                    <ToggleIcon style={{ width: 13, height: 13 }} />
                    {toggle}
                  </button>
                ))}
              {headerActions}
            </div>
          </div>

          {loading ? (
            <div className="doc-body" style={{ color: 'var(--fg-faint)' }}>
              Loading…
            </div>
          ) : (
            <AnnotatableDoc
              markdown={body}
              mode={mode}
              annotating={annotating}
              onAsk={
                onAsk && activeId
                  ? ((q) => onAsk(activeId, q)) as AskFn
                  : undefined
              }
              onPropose={
                onPropose && activeId ? (q) => onPropose(activeId, q) : undefined
              }
              onApply={
                onApply && activeId
                  ? async (newBody) => {
                      await onApply(activeId, newBody);
                      // Reflect the write immediately, then drop out of Explain.
                      setBody(newBody);
                      setAnnotating(false);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
