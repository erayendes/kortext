/**
 * FileBrowser — the 2-pane document browser shared by References / Memory /
 * Reports and the engine-scope Agents / Rules / Workflows screens.
 *
 * Left: a (optionally grouped) file list with status dots + author.
 * Right: the selected file's markdown via {@link AnnotatableDoc}, with a
 *        mode-driven header action (Revise / Clarify / read-only badge).
 *
 * Data is injected by the owning route (`items` + `loadBody`) — this component
 * is pure chrome + interaction. Mirrors the `.fbrowser` / `.fb-*` markup of
 * wireframe-v6-hifi.html.
 */
import { useEffect, useMemo, useState } from 'react';
import { Lock, PenLine, MessageCircleQuestion, X } from 'lucide-react';
import { personaColor, personaIcon } from '../../lib/persona-colors.ts';
import { AnnotatableDoc, type AnnotateMode } from './AnnotatableDoc.tsx';

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
  items: FBItem[];
  /** Resolve the markdown body for a selected file id. */
  loadBody: (id: string) => Promise<string>;
  mode: AnnotateMode;
  /** Extra buttons for the right-pane header (e.g. References "Approve"). */
  headerActions?: React.ReactNode;
  /** Fired when the reviewer submits annotations for the current file. */
  onAnnotate?: (id: string, lines: number[], note: string) => void | Promise<void>;
};

const STATUS_META: Record<FBStatus, { label: string; color: string; cls: string }> = {
  approved: { label: 'Approved', color: 'var(--green)', cls: 'approved' },
  review: { label: 'In review', color: 'var(--amber)', cls: 'review' },
  draft: { label: 'Draft', color: 'var(--fg-muted)', cls: 'draft' },
  ro: { label: 'Read-only', color: 'var(--fg-muted)', cls: 'ro' },
};

function Avatar({ handle, size }: { handle: string; size: number }) {
  const color = personaColor(handle);
  const Icon = personaIcon(handle);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
      }}
    >
      <Icon style={{ width: size * 0.52, height: size * 0.52 }} />
    </span>
  );
}

function short(handle: string): string {
  return handle.startsWith('+') ? handle.slice(1) : handle;
}

export function FileBrowser({
  title,
  items,
  loadBody,
  mode,
  headerActions,
  onAnnotate,
}: FileBrowserProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [body, setBody] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [annotating, setAnnotating] = useState(false);

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

  const toggle = mode === 'revise' ? 'Revise' : mode === 'clarify' ? 'Clarify' : null;
  const ToggleIcon = mode === 'revise' ? PenLine : MessageCircleQuestion;

  return (
    <div className="fbrowser">
      <div className="fb-body">
        {/* ---- left: file list ---- */}
        <div className="fb-list">
          <div className="fb-lhead">
            <span className="page-title">{title}</span>
            <span className="fb-grp" style={{ padding: 0 }}>
              {items.length} file{items.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="fb-items">
            {grouped.map(({ group, items: gi }) => (
              <div key={group ?? '_'}>
                {group && <div className="fb-grp">{group}</div>}
                {gi.map((it) => {
                  const st = it.status ? STATUS_META[it.status] : null;
                  return (
                    <div
                      key={it.id}
                      className={`fb-item${it.id === activeId ? ' active' : ''}`}
                      onClick={() => setActiveId(it.id)}
                    >
                      <div className="fb-nm">
                        <span className="nm">{it.name}</span>
                        {st && (
                          <span className={`stbadge sm ${st.cls}`}>
                            <span className="d" style={{ background: st.color }} />
                            {st.label}
                          </span>
                        )}
                      </div>
                      {it.author && (
                        <div className="fb-au">
                          <Avatar handle={it.author} size={16} />
                          <span>{short(it.author)}</span>
                        </div>
                      )}
                      {it.meta && !it.author && (
                        <div className="fb-au">
                          <span style={{ color: 'var(--fg-faint)' }}>{it.meta}</span>
                        </div>
                      )}
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
        </div>

        {/* ---- right: viewer ---- */}
        <div className="fb-view">
          <div className="fb-vhead">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="fb-vname">{active?.name ?? '—'}</span>
              {mode === 'revise' && active?.status ? (
                <span className={`stbadge ${STATUS_META[active.status].cls}`}>
                  <span
                    className="d"
                    style={{ background: STATUS_META[active.status].color }}
                  />
                  {STATUS_META[active.status].label}
                </span>
              ) : mode !== 'revise' ? (
                <span className="stbadge ro">
                  <Lock style={{ width: 11, height: 11 }} />
                  Read-only · engine writes
                </span>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              {toggle && active && (
                <button
                  className={`btn btn-line btn-sm${annotating ? ' is-active' : ''}`}
                  onClick={() => setAnnotating((v) => !v)}
                >
                  {annotating ? (
                    <X style={{ width: 13, height: 13 }} />
                  ) : (
                    <ToggleIcon style={{ width: 13, height: 13 }} />
                  )}
                  {annotating ? 'Cancel' : toggle}
                </button>
              )}
              {headerActions}
            </div>
          </div>

          {loading ? (
            <div className="fb-md" style={{ color: 'var(--fg-faint)' }}>
              Loading…
            </div>
          ) : (
            <AnnotatableDoc
              markdown={body}
              mode={mode}
              annotating={annotating}
              onSubmit={(lines, note) =>
                activeId ? onAnnotate?.(activeId, lines, note) : undefined
              }
              onDone={() => setAnnotating(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
