import { useEffect, useState } from 'react';
import { usePendingQuestions } from '../lib/pending-questions.tsx';
import type { PendingQuestion } from '../lib/api-types.ts';
import { Bell, X } from 'lucide-react';

type Toast = {
  id: number;
  question: PendingQuestion;
  /** ms timestamp when this toast should auto-dismiss. */
  expiresAt: number;
};

const TOAST_TTL = 8000;

/**
 * Bottom-right stack of toasts. Triggered when usePendingQuestions reports
 * `newSinceLastPoll` IDs — once per fresh question, never on the initial
 * page load (the first poll seeds the seen-set without firing toasts).
 */
export function Toasts() {
  const { questions, newSinceLastPoll } = usePendingQuestions();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [firstPollSeen, setFirstPollSeen] = useState(false);

  useEffect(() => {
    if (!firstPollSeen) {
      setFirstPollSeen(true);
      return;
    }
    if (newSinceLastPoll.length === 0) return;
    const now = Date.now();
    const additions: Toast[] = [];
    for (const id of newSinceLastPoll) {
      const q = questions.find((x) => x.id === id);
      if (!q) continue;
      additions.push({ id, question: q, expiresAt: now + TOAST_TTL });
    }
    if (additions.length > 0) {
      setToasts((prev) => [...prev, ...additions]);
    }
  }, [newSinceLastPoll, questions, firstPollSeen]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => t.expiresAt > now));
    }, 500);
    return () => clearInterval(id);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-lg border border-border-accent bg-bg-1 shadow-lg px-4 py-3 animate-toast-in"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Bell size={14} className="text-signal mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[12px] uppercase tracking-[0.10em] text-tx-3 mb-0.5">
                  New approval
                </div>
                <div className="text-[13px] text-tx-1 leading-snug">{t.question.question}</div>
                {t.question.run_id && (
                  <div className="mono text-[11px] text-tx-3 mt-1">
                    run #{t.question.run_id}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-tx-3 hover:text-tx-1 transition-colors duration-200 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
