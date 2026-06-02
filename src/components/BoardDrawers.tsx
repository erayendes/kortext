import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Circle, CircleCheck, X } from 'lucide-react';
import { Badge } from './Badge.tsx';
import { personaColor } from '../lib/persona-colors.ts';
import { apiPost, usePolling, type ApiPostError } from '../lib/api.ts';
import {
  acChecklist,
  availableTransitions,
  checklistFromSection,
  childrenOf,
  describeActivity,
  descriptionFromBody,
  epicProgress,
  formatDate,
  statusBadge,
  type BoardTransition,
} from '../lib/board-drawer.ts';
import type { BacklogItem } from '../lib/api-types.ts';

/**
 * Board detail drawers (Task + Epic) — the v4 wireframe's defining Board
 * interaction: clicking a card slides a 480px panel in from the right.
 *
 * Chrome (shell / header / kv / section labels / ac-rows / footer) mirrors the
 * wireframe `.drawer*` CSS one-for-one but is wired to the real BacklogItem.
 * The footer status actions need a backlog mutation endpoint that doesn't
 * exist yet, so they render disabled (honest) rather than silently inert.
 */

// ───────────────────────── shared chrome

function DrawerShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  // Mount at translateX(100%), then flip to 0 on the next frame so it slides
  // in; on close we slide back out before unmounting (matches .drawer 250ms).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const close = useCallback(() => {
    setShown(false);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <>
      <div
        role="presentation"
        onClick={close}
        className="fixed inset-0 z-50"
        style={{
          background: 'rgba(0,0,0,0.5)',
          opacity: shown ? 1 : 0,
          transition: 'opacity 200ms',
          pointerEvents: shown ? 'auto' : 'none',
        }}
      />
      <aside
        className="fixed top-0 right-0 bottom-0 z-[60] flex flex-col"
        style={{
          width: 480,
          maxWidth: '94vw',
          background: 'var(--bg-0)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
          transform: shown ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {children(close)}
      </aside>
    </>
  );
}

function DrawerHeader({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between shrink-0 border-b border-border-default"
      style={{ padding: '16px 22px' }}
    >
      <div className="flex items-center gap-2.5">{children}</div>
      <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Close">
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}

function DrawerBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: 22 }}>
      {children}
    </div>
  );
}

function DrawerFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-2 shrink-0 border-t border-border-default"
      style={{ padding: '14px 22px' }}
    >
      {children}
    </div>
  );
}

function DrawerTitle({ children }: { children: ReactNode }) {
  return (
    <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 18px', lineHeight: 1.35, color: 'var(--tx-1)' }}>
      {children}
    </h3>
  );
}

function Kv({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: '110px 1fr', gap: '10px 16px', fontSize: 13, marginBottom: 22 }}
    >
      {children}
    </div>
  );
}

function K({ children }: { children: ReactNode }) {
  return <span style={{ color: 'var(--tx-3)' }}>{children}</span>;
}

function V({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={className} style={{ color: 'var(--tx-2)', ...style }}>
      {children}
    </span>
  );
}

function SectionLabel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div
      className="font-semibold uppercase"
      style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--tx-3)', marginBottom: 8 }}
    >
      {children}
      {extra != null && (
        <span style={{ color: 'var(--tx-disabled)', fontWeight: 400, marginLeft: 6 }}>{extra}</span>
      )}
    </div>
  );
}

function AcRow({ done, children }: { done?: boolean; children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: '6px 10px',
        border: '1px solid var(--border-default)',
        borderRadius: 5,
        fontSize: 13,
        color: done ? 'var(--tx-3)' : 'var(--tx-2)',
      }}
    >
      {done ? (
        <CircleCheck style={{ width: 14, height: 14, color: 'var(--success)', flexShrink: 0 }} />
      ) : (
        <Circle style={{ width: 14, height: 14, color: 'var(--tx-disabled)', flexShrink: 0 }} />
      )}
      {children}
    </div>
  );
}

type AuditEntry = {
  id: number;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: number;
};

function activityTs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Activity({ itemId, created }: { itemId: string; created: number }) {
  // Real "who did what, when" — the item's audit trail (transitions etc.),
  // newest-first, plus the create event we always know. Polls so a transition
  // shows up here shortly after it happens.
  const { data } = usePolling<{ activity: AuditEntry[] }>(
    `/api/backlog/${itemId}/activity`,
    5000,
  );
  const entries = data?.activity ?? [];
  return (
    <div className="flex flex-col gap-1.5" style={{ fontSize: 12, color: 'var(--tx-3)' }}>
      {entries.map((e) => (
        <div key={e.id}>
          <span className="mono">{activityTs(e.created_at)}</span> · {describeActivity(e)}
        </div>
      ))}
      <div>
        <span className="mono">{activityTs(created)}</span> · created
      </div>
    </div>
  );
}

// ───────────────────────── task drawer

export function TaskDrawer({
  item,
  epicTitle,
  onChanged,
  onClose,
}: {
  item: BacklogItem;
  epicTitle: string | null;
  onChanged: (item: BacklogItem) => void;
  onClose: () => void;
}) {
  const sb = statusBadge(item.status);
  const fm = item.frontmatter as {
    priority?: string;
    points?: number;
    acceptance_criteria?: unknown;
    ac_done?: number;
  };
  const criteria = Array.isArray(fm.acceptance_criteria)
    ? (fm.acceptance_criteria as string[])
    : [];
  const acDone = typeof fm.ac_done === 'number' ? fm.ac_done : 0;
  const checklist = acChecklist(criteria, acDone);
  const desc = descriptionFromBody(item.body_md);
  const gates = checklistFromSection(item.body_md, 'Review Gates');
  const transitions = availableTransitions(item.status);

  const [busy, setBusy] = useState<BoardTransition | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTransition(action: BoardTransition) {
    setBusy(action);
    setError(null);
    try {
      // Human override — the agent pipeline normally drives status; this lets
      // the operator force a legal move. The backend re-checks legality.
      const { item: updated } = await apiPost<{ item: BacklogItem }>(
        `/api/backlog/${item.id}/transition`,
        { action, by: '+prime' },
      );
      onChanged(updated);
    } catch (e) {
      const err = e as ApiPostError | Error;
      setError(
        'message' in err && typeof err.message === 'string'
          ? err.message
          : 'error' in err && typeof err.error === 'string'
            ? err.error
            : String(err),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <DrawerShell onClose={onClose}>
      {(close) => (
        <>
          <DrawerHeader onClose={close}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--tx-3)' }}>
              {item.id}
            </span>
            <Badge tone={sb.tone}>{sb.label}</Badge>
          </DrawerHeader>

          <DrawerBody>
            <DrawerTitle>{item.title}</DrawerTitle>

            <Kv>
              {item.parent_id && (
                <>
                  <K>Epic</K>
                  <V>{`${item.parent_id}${epicTitle ? ` ${epicTitle}` : ''}`}</V>
                </>
              )}
              <K>Assignee</K>
              {item.owner ? (
                <V className="mono" style={{ color: personaColor(item.owner) }}>
                  {item.owner}
                </V>
              ) : (
                <V style={{ color: 'var(--tx-disabled)' }}>unassigned</V>
              )}
              {fm.priority && (
                <>
                  <K>Priority</K>
                  <V>{fm.priority}</V>
                </>
              )}
              {typeof fm.points === 'number' && (
                <>
                  <K>Points</K>
                  <V>{fm.points}</V>
                </>
              )}
              <K>Created</K>
              <V className="mono" style={{ fontSize: 12, color: 'var(--tx-3)' }}>
                {formatDate(item.created_at)}
              </V>
            </Kv>

            {desc && (
              <>
                <SectionLabel>Description</SectionLabel>
                <p style={{ fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.6, margin: '0 0 22px' }}>
                  {desc}
                </p>
              </>
            )}

            {checklist.length > 0 && (
              <>
                <SectionLabel extra={`${Math.min(acDone, criteria.length)}/${criteria.length}`}>
                  Acceptance criteria
                </SectionLabel>
                <div className="flex flex-col gap-1.5" style={{ marginBottom: 22 }}>
                  {checklist.map((c, i) => (
                    <AcRow key={i} done={c.done}>
                      {c.text}
                    </AcRow>
                  ))}
                </div>
              </>
            )}

            {gates.length > 0 && (
              <>
                <SectionLabel extra={`${gates.filter((g) => g.done).length}/${gates.length}`}>
                  Review gates
                </SectionLabel>
                <div className="flex flex-col gap-1.5" style={{ marginBottom: 22 }}>
                  {gates.map((g, i) => (
                    <AcRow key={i} done={g.done}>
                      {g.text}
                    </AcRow>
                  ))}
                </div>
              </>
            )}

            <SectionLabel>Activity</SectionLabel>
            <Activity itemId={item.id} created={item.created_at} />
          </DrawerBody>

          {error && (
            <div className="shrink-0 text-[12px] text-danger" style={{ padding: '0 22px 4px' }}>
              {error}
            </div>
          )}
          <DrawerFooter>
            {transitions.length === 0 && (
              <span className="text-[12px] text-tx-3">No actions — {sb.label.toLowerCase()}.</span>
            )}
            {transitions.map((t) => (
              <button
                key={t.action}
                type="button"
                className={`btn btn-xs ${t.primary ? 'btn-primary' : 'btn-outline'}`}
                disabled={busy !== null}
                onClick={() => runTransition(t.action)}
              >
                {busy === t.action ? '…' : t.label}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              disabled
              title="Comments need a backend comment store (deferred)"
            >
              Add comment
            </button>
          </DrawerFooter>
        </>
      )}
    </DrawerShell>
  );
}

// ───────────────────────── epic drawer

export function EpicDrawer({
  epic,
  items,
  onClose,
  onAddTask,
}: {
  epic: BacklogItem;
  items: BacklogItem[];
  onClose: () => void;
  onAddTask: (epicId: string) => void;
}) {
  const children = childrenOf(items, epic.id);
  const prog = epicProgress(items, epic.id);
  const desc = descriptionFromBody(epic.body_md);

  return (
    <DrawerShell onClose={onClose}>
      {(close) => (
        <>
          <DrawerHeader onClose={close}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--tx-3)' }}>
              {epic.id}
            </span>
            <Badge tone="purple">Strategic epic</Badge>
          </DrawerHeader>

          <DrawerBody>
            <DrawerTitle>{epic.title}</DrawerTitle>

            <Kv>
              <K>Owner</K>
              {epic.owner ? (
                <V className="mono" style={{ color: personaColor(epic.owner) }}>
                  {epic.owner}
                </V>
              ) : (
                <V style={{ color: 'var(--tx-disabled)' }}>unassigned</V>
              )}
              <K>Progress</K>
              <V>
                {prog.pct}% · {prog.done} of {prog.total} done
              </V>
              <K>Created</K>
              <V className="mono" style={{ fontSize: 12, color: 'var(--tx-3)' }}>
                {formatDate(epic.created_at)}
              </V>
            </Kv>

            {desc && (
              <>
                <SectionLabel>Description</SectionLabel>
                <p style={{ fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.6, margin: '0 0 22px' }}>
                  {desc}
                </p>
              </>
            )}

            <SectionLabel extra={children.length}>Child items</SectionLabel>
            <div className="flex flex-col gap-1" style={{ marginBottom: 22 }}>
              {children.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--tx-disabled)' }}>No child items yet.</p>
              )}
              {children.map((child) => {
                const cb = statusBadge(child.status);
                const isDone = child.status === 'done';
                return (
                  <AcRow key={child.id} done={isDone}>
                    <span className="mono" style={{ color: 'var(--tx-3)', fontSize: 11 }}>
                      {child.id}
                    </span>
                    <span style={isDone ? { textDecoration: 'line-through', color: 'var(--tx-3)' } : undefined}>
                      {child.title}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      <Badge tone={cb.tone}>{cb.label}</Badge>
                    </span>
                  </AcRow>
                );
              })}
            </div>

            <SectionLabel>Activity</SectionLabel>
            <Activity itemId={epic.id} created={epic.created_at} />
          </DrawerBody>

          <DrawerFooter>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => {
                onAddTask(epic.id);
                close();
              }}
            >
              Add task
            </button>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              disabled
              title="Epic editing is not wired yet (deferred)"
            >
              Edit epic
            </button>
          </DrawerFooter>
        </>
      )}
    </DrawerShell>
  );
}
