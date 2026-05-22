import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { usePendingQuestions } from '../lib/pending-questions.tsx';
import { formatElapsed } from '../lib/api.ts';

export function BellMenu() {
  const { questions, error } = usePendingQuestions();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const count = questions.length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative h-8 w-8 rounded text-tx-3 hover:text-tx-1 hover:bg-bg-2 transition-colors duration-200 flex items-center justify-center"
        title={count > 0 ? `${count} pending approval${count === 1 ? '' : 's'}` : 'No pending approvals'}
      >
        <Bell size={15} />
        {count > 0 && (
          <span className="dot dot-signal dot-pulse absolute top-1.5 right-1.5" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-[360px] rounded-lg border border-border-default bg-bg-1 shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
            <div className="text-[12px] uppercase tracking-[0.10em] text-tx-2">
              Pending approvals
            </div>
            <span className="mono text-[11px] text-tx-3">{count} open</span>
          </div>
          {error && <div className="px-3 py-3 text-[12px] text-danger">{error}</div>}
          {!error && count === 0 && (
            <div className="px-4 py-6 text-[13px] text-tx-3">All clear.</div>
          )}
          {!error && count > 0 && (
            <ul className="max-h-[360px] overflow-y-auto divide-y divide-border-subtle">
              {questions.map((q) => (
                <li key={q.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13px] text-tx-1 leading-snug">{q.question}</div>
                    <span className="mono text-[11px] text-tx-3 whitespace-nowrap">
                      {formatElapsed(q.created_at)}
                    </span>
                  </div>
                  {q.run_id && (
                    <div className="mt-1 text-[11px] text-tx-3 mono">
                      run #{q.run_id}
                      {q.choices.length > 0 && (
                        <>
                          <span className="text-tx-disabled mx-1">·</span>
                          {q.choices.join(' / ')}
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
