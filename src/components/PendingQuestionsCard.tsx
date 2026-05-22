import { useState } from 'react';
import { usePendingQuestions } from '../lib/pending-questions.tsx';
import { formatElapsed } from '../lib/api.ts';
import { Check, Inbox, X } from 'lucide-react';
import type { PendingQuestion } from '../lib/api-types.ts';

type FilterKey = 'all' | 'blueprint' | 'gate' | 'deploy';

const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'All',
  blueprint: 'Blueprint',
  gate: 'Gates',
  deploy: 'Deploy',
};

function detectKind(q: PendingQuestion): Exclude<FilterKey, 'all'> {
  const haystack = `${q.question}`.toLowerCase();
  if (haystack.includes('blueprint')) return 'blueprint';
  if (haystack.includes('deploy') || haystack.includes('release')) return 'deploy';
  return 'gate';
}

/**
 * Approvals drawer-card. Reads from the shared PendingQuestionsProvider —
 * one poll feeds both this card, the header bell, and the toast emitter.
 */
export function PendingQuestionsCard() {
  const { questions, error, refresh } = usePendingQuestions();
  const [filter, setFilter] = useState<FilterKey>('all');

  const open = questions.filter((q) => q.status === 'open');
  const visible =
    filter === 'all' ? open : open.filter((q) => detectKind(q) === filter);

  return (
    <div
      className="rounded-lg border"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-1)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.10em] text-tx-2">
          <Inbox size={13} style={{ color: 'var(--accent)' }} />
          Approvals
        </div>
        <span className="mono text-[11px] text-tx-3">
          {open.length} open
        </span>
      </div>

      {/* Filter chips */}
      <div
        className="flex items-center gap-1.5 px-4 py-2 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => {
          const count =
            k === 'all'
              ? open.length
              : open.filter((q) => detectKind(q) === k).length;
          const active = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className="px-2 py-0.5 rounded text-[11px] transition-colors"
              style={{
                background: active ? 'var(--bg-3)' : 'transparent',
                color: active ? 'var(--tx-1)' : 'var(--tx-3)',
                border: '1px solid',
                borderColor: active ? 'var(--border-default)' : 'transparent',
              }}
            >
              {FILTER_LABEL[k]}
              {count > 0 ? (
                <span className="ml-1.5 text-tx-3">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error && <div className="px-4 py-3 text-[12px] text-danger">{error}</div>}
      {!error && visible.length === 0 && (
        <div className="px-4 py-6 text-[13px] text-tx-3">
          No approvals in this filter.
        </div>
      )}
      {!error && visible.length > 0 && (
        <ul>
          {visible.map((q) => (
            <ApprovalRow key={q.id} q={q} onChanged={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApprovalRow({
  q,
  onChanged,
}: {
  q: PendingQuestion;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const respond = async (answer: string) => {
    setBusy(answer === 'reject' ? 'reject' : 'approve');
    setErr(null);
    try {
      const res = await fetch(`/api/questions/${q.id}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer, answered_by: '+prime' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const kind = detectKind(q);
  return (
    <li
      className="px-4 py-3 border-b"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="mono text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded"
              style={{
                background: kindBg(kind),
                color: kindColor(kind),
                border: `1px solid ${kindBorder(kind)}`,
              }}
            >
              {kind}
            </span>
            {q.run_id ? (
              <span className="mono text-[11px] text-tx-3">run #{q.run_id}</span>
            ) : null}
          </div>
          <div className="text-[13px] text-tx-1 leading-snug">{q.question}</div>
        </div>
        <span className="mono text-[11px] text-tx-3 whitespace-nowrap mt-0.5">
          {formatElapsed(q.created_at)}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => respond(q.choices[0] ?? 'approve')}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
          style={{
            background: 'var(--success)',
            color: '#0A0814',
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Check size={11} /> {busy === 'approve' ? '…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => respond('reject')}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
          style={{
            background: 'rgba(239,68,68,0.12)',
            color: 'var(--danger)',
            border: '1px solid rgba(239,68,68,0.30)',
            opacity: busy ? 0.5 : 1,
          }}
        >
          <X size={11} /> {busy === 'reject' ? '…' : 'Reject'}
        </button>
        {err ? (
          <span className="text-[11px] text-danger">{err}</span>
        ) : null}
      </div>
    </li>
  );
}

function kindBg(k: Exclude<FilterKey, 'all'>): string {
  if (k === 'blueprint') return 'rgba(245,158,11,0.10)';
  if (k === 'deploy') return 'rgba(236,72,153,0.10)';
  return 'rgba(168,85,247,0.10)';
}
function kindColor(k: Exclude<FilterKey, 'all'>): string {
  if (k === 'blueprint') return '#FBBF24';
  if (k === 'deploy') return '#F472B6';
  return 'var(--accent)';
}
function kindBorder(k: Exclude<FilterKey, 'all'>): string {
  if (k === 'blueprint') return 'rgba(245,158,11,0.30)';
  if (k === 'deploy') return 'rgba(236,72,153,0.30)';
  return 'rgba(168,85,247,0.30)';
}
