import { usePendingQuestions } from '../lib/pending-questions.tsx';
import { formatElapsed } from '../lib/api.ts';
import { Inbox } from 'lucide-react';

/**
 * Inline approval queue card. Reads from the shared PendingQuestionsProvider —
 * one poll feeds both this card, the header bell, and the toast emitter.
 */
export function PendingQuestionsCard() {
  const { questions, error } = usePendingQuestions();

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-1">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.10em] text-tx-2">
          <Inbox size={13} className="text-accent" />
          Approvals
        </div>
        <span className="mono text-[11px] text-tx-3">{questions.length} open</span>
      </div>
      {error && <div className="px-4 py-3 text-[12px] text-danger">{error}</div>}
      {!error && questions.length === 0 && (
        <div className="px-4 py-6 text-[13px] text-tx-3">
          No approvals waiting. Critical gates land here.
        </div>
      )}
      {!error && questions.length > 0 && (
        <ul className="divide-y divide-border-subtle">
          {questions.map((q) => (
            <li key={q.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] text-tx-1">{q.question}</div>
                <span className="mono text-[11px] text-tx-3 whitespace-nowrap">
                  {formatElapsed(q.created_at)}
                </span>
              </div>
              {q.choices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {q.choices.map((c) => (
                    <code
                      key={c}
                      className="mono text-[11px] bg-bg-2 border border-border-subtle px-1.5 py-0.5 rounded text-tx-2"
                    >
                      {c}
                    </code>
                  ))}
                </div>
              )}
              <div className="mt-2 text-[11px] text-tx-3">
                {q.run_id && (
                  <span className="mono">
                    run #{q.run_id}
                    <span className="text-tx-disabled mx-1">·</span>
                  </span>
                )}
                <span>respond with </span>
                <code className="mono text-tx-2">kortext approve {q.run_id}</code>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
