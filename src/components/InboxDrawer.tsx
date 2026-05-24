import { useState } from 'react';
import { Check, Inbox, X } from 'lucide-react';
import { useShell } from '../lib/shell-store.tsx';
import { usePendingQuestions } from '../lib/pending-questions.tsx';
import { apiPost } from '../lib/api.ts';
import type { PendingQuestion } from '../lib/api-types.ts';

/**
 * Right-side drawer surfaced by the header bell. Lists every open
 * pending_question and lets the operator answer Approve / Reject / Revise.
 * Calls POST /api/questions/:id/answer; on success the polling source
 * (PendingQuestionsProvider) drops the answered row on the next tick.
 *
 * v4 wireframe reference: section[data-route="..."] aside.drawer-wide (line 1614+).
 */
export function InboxDrawer() {
  const { inboxOpen, closeInbox } = useShell();
  const { questions, error, refresh } = usePendingQuestions();
  const open = questions.filter((q) => q.status === 'open');

  if (!inboxOpen) return null;

  return (
    <>
      {/* Click-outside scrim */}
      <div
        role="presentation"
        onClick={closeInbox}
        className="fixed inset-0 z-30"
        style={{ background: 'rgba(0,0,0,0.35)' }}
      />
      <aside
        className="fixed top-0 right-0 z-40 h-screen flex flex-col"
        style={{
          width: '420px',
          background: 'var(--bg-0)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
        }}
      >
        <header
          className="flex items-center gap-2.5 px-4 py-3 border-b"
          style={{ borderBottomColor: 'var(--border-default)' }}
        >
          <Inbox size={16} style={{ color: 'var(--accent)' }} />
          <span className="text-[14px] font-semibold text-tx-1">Inbox</span>
          {open.length > 0 ? (
            <span
              className="text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
              style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.12)' }}
            >
              {open.length} pending
            </span>
          ) : (
            <span
              className="text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
              style={{ color: 'var(--tx-3)', background: 'rgba(255,255,255,0.06)' }}
            >
              all clear
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={closeInbox}
            className="btn btn-ghost btn-xs"
            aria-label="Close inbox"
          >
            <X className="w-3 h-3" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5">
          {error && <p className="text-[12px] text-danger px-1">{error}</p>}
          {open.length === 0 && !error && (
            <div className="border border-dashed border-border-default rounded-md px-4 py-6 text-center">
              <p className="text-[13px] text-tx-2">No pending approvals</p>
              <p className="mt-1 text-[12px] text-tx-3">
                When a workflow gate needs your call, it shows up here.
              </p>
            </div>
          )}
          {open.map((q) => (
            <QuestionCard key={q.id} question={q} onAnswered={refresh} />
          ))}
        </div>
      </aside>
    </>
  );
}

// ───────────────────────── card

function QuestionCard({
  question,
  onAnswered,
}: {
  question: PendingQuestion;
  onAnswered: () => void;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | 'revise' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const kind = kindOf(question);
  const elapsed = formatElapsed(question.created_at);

  const send = async (verb: 'approve' | 'reject' | 'revise') => {
    setBusy(verb);
    setErr(null);
    try {
      // POST /api/questions/:id/answer expects {answer, answered_by}. The
      // backend doesn't enforce a vocabulary — we send the verb verbatim so
      // it's auditable, and the orchestrator can match on these strings.
      const answer =
        verb === 'approve'
          ? question.choices[0] ?? 'approved'
          : verb === 'reject'
          ? question.choices.find((c) => /reject/i.test(c)) ?? 'rejected'
          : 'revise';
      await apiPost(`/api/questions/${question.id}/answer`, {
        answer,
        answered_by: '+prime',
      });
      onAnswered();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <article
      className="border border-border-default rounded-md bg-bg-1 p-3"
      style={{ borderLeft: `2px solid ${kind.color}` }}
    >
      <header className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded leading-tight"
          style={{ color: kind.color, background: kind.bg }}
        >
          {kind.label}
        </span>
        <span className="mono text-[10px] text-tx-3">#{question.id}</span>
        <span className="flex-1" />
        <span className="text-[10px] text-tx-3">{elapsed}</span>
      </header>
      <p className="text-[13px] text-tx-1 leading-snug mb-1">{question.question}</p>
      {question.run_id !== null && (
        <p className="text-[11px] text-tx-3 mb-2">
          run <span className="mono">#{question.run_id}</span>
          {question.step_id !== null && (
            <>
              {' '}
              · step <span className="mono">#{question.step_id}</span>
            </>
          )}
        </p>
      )}
      {err && <p className="text-[11px] text-danger mb-2">{err}</p>}
      <div className="flex items-center gap-1.5 mt-2">
        <button
          type="button"
          onClick={() => send('approve')}
          disabled={busy !== null}
          className="btn btn-xs"
          style={{
            background: 'var(--success)',
            borderColor: 'var(--success)',
            color: '#0A0814',
          }}
        >
          <Check className="w-3 h-3" />
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => send('revise')}
          disabled={busy !== null}
          className="btn btn-outline btn-xs"
        >
          {busy === 'revise' ? 'Sending…' : 'Revise'}
        </button>
        <button
          type="button"
          onClick={() => send('reject')}
          disabled={busy !== null}
          className="btn btn-ghost btn-xs"
          style={{ color: 'var(--danger)' }}
        >
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </article>
  );
}

// ───────────────────────── derivation helpers

type Kind = { label: string; color: string; bg: string };

function kindOf(q: PendingQuestion): Kind {
  const text = q.question.toLowerCase();
  if (/blueprint/i.test(text)) {
    return { label: 'Blueprint', color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' };
  }
  if (/deploy|release/i.test(text)) {
    return { label: 'Deploy', color: 'var(--signal-soft)', bg: 'rgba(244,114,182,0.12)' };
  }
  if (/architecture|adr|design|decision/i.test(text)) {
    return { label: 'ADR', color: 'var(--accent-soft)', bg: 'rgba(168,85,247,0.12)' };
  }
  return { label: 'Gate', color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' };
}

function formatElapsed(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
