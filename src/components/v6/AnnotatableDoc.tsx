/**
 * AnnotatableDoc — renders markdown as the reader doc body and drives the
 * handoff "Explain" interaction (`.exp-*`). In annotate mode every line is a
 * clickable `.doc-line`; click ONE line and an inline thread opens right under
 * it with its own composer — ask about that line, read the answer, and keep the
 * conversation going. Each line is its own independent thread.
 *
 *  - `clarify` (Memory / Foundation / References): with an `onAsk` handler the
 *    thread is a real chat — the question gets an agent answer inline, follow-ups
 *    continue on that line, and `onPropose`/`onApply` let the agent revise the
 *    document (preview → confirm).
 *  - `ro`      (engine-owned docs): read-only, no annotation affordance.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, FilePenLine, Loader2, Quote, Send, Sparkles, X } from 'lucide-react';
import { parseInline, parseMarkdown, type MdToken } from './markdown.ts';

export type AnnotateMode = 'clarify' | 'ro';

export type ChatMsg = { role: 'prime' | 'agent'; text: string };

/** Ask the owning agent about the selected line; resolves to the answer text. */
export type AskFn = (q: {
  lines: number[];
  quote: string;
  question: string;
  history: ChatMsg[];
}) => Promise<string>;

/** Ask the agent for a COMPLETE revised document based on the conversation. */
export type ProposeFn = (q: {
  line: number;
  quote: string;
  instruction: string;
  history: ChatMsg[];
}) => Promise<string>;

export type AnnotatableDocProps = {
  markdown: string;
  mode: AnnotateMode;
  /** Annotation on/off — controlled by FileBrowser's header toggle. */
  annotating?: boolean;
  /** Chat handler (clarify mode): returns a real answer; enables follow-ups. */
  onAsk?: AskFn;
  /** Propose a full revised document from the conversation (preview, no write). */
  onPropose?: ProposeFn;
  /** Apply a confirmed revision (writes the doc); parent reloads on success. */
  onApply?: (body: string) => Promise<void>;
};

type Thread = {
  id: number;
  line: number;
  quote: string;
  messages: ChatMsg[];
  busy: boolean;
  error?: string;
  /** Proposed full-document revision awaiting +prime's confirm. */
  proposal?: string | null;
  proposing?: boolean;
  applying?: boolean;
  proposeError?: string;
};

const HINT = "Click a line you don't understand, then ask the owning agent about it.";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((s, i) => {
        if (s.type === 'bold') return <b key={i}>{s.value}</b>;
        if (s.type === 'code') return <code key={i}>{s.value}</code>;
        return <Fragment key={i}>{s.value}</Fragment>;
      })}
    </>
  );
}

export function AnnotatableDoc({
  markdown,
  mode,
  annotating = false,
  onAsk,
  onPropose,
  onApply,
}: AnnotatableDocProps) {
  const tokens = parseMarkdown(markdown);
  const [threads, setThreads] = useState<Thread[]>([]);
  const nextId = useRef(1);

  // Reset threads when the document changes or Explain is toggled off.
  useEffect(() => {
    setThreads([]);
    nextId.current = 1;
  }, [markdown, annotating]);

  const canAnnotate = mode !== 'ro' && annotating;

  // line index → text (for the thread quote) + which lines carry a thread
  const lineText = new Map<number, string>();
  for (const t of tokens) if (t.selectable) lineText.set(t.index, t.text || '');
  const threadAtLine = new Map<number, Thread>();
  for (const th of threads) threadAtLine.set(th.line, th);

  function openLine(idx: number) {
    if (!canAnnotate || threadAtLine.has(idx)) return;
    setThreads((prev) => [
      ...prev,
      { id: nextId.current++, line: idx, quote: lineText.get(idx) || '', messages: [], busy: false },
    ]);
  }

  function closeThread(id: number) {
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }

  /** One turn on a thread: append the question, then await + append the answer. */
  async function ask(thread: Thread, question: string) {
    if (thread.busy || !onAsk) return;
    const history = thread.messages;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === thread.id
          ? { ...t, messages: [...t.messages, { role: 'prime', text: question }], busy: true, error: undefined }
          : t,
      ),
    );
    try {
      const answer = await onAsk!({ lines: [thread.line], quote: thread.quote, question, history });
      setThreads((prev) =>
        prev.map((t) =>
          t.id === thread.id ? { ...t, messages: [...t.messages, { role: 'agent', text: answer }], busy: false } : t,
        ),
      );
    } catch {
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, busy: false, error: 'Cevap alınamadı, tekrar dene.' } : t)),
      );
    }
  }

  /** Ask the agent for a full revised document from this thread's conversation. */
  async function propose(thread: Thread) {
    if (!onPropose || thread.proposing) return;
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, proposing: true, proposeError: undefined } : t)));
    try {
      const proposal = await onPropose({
        line: thread.line,
        quote: thread.quote,
        instruction: 'Bu satırla ilgili yukarıdaki sohbete göre dokümanı güncelle.',
        history: thread.messages,
      });
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, proposing: false, proposal } : t)));
    } catch {
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, proposing: false, proposeError: 'Öneri alınamadı.' } : t)),
      );
    }
  }

  /** Write the confirmed proposal; the parent reload resets threads on success. */
  async function applyProposal(thread: Thread) {
    if (!onApply || !thread.proposal || thread.applying) return;
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, applying: true, proposeError: undefined } : t)));
    try {
      await onApply(thread.proposal);
    } catch {
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, applying: false, proposeError: 'Uygulanamadı.' } : t)),
      );
    }
  }

  function discardProposal(thread: Thread) {
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, proposal: null, proposeError: undefined } : t)));
  }

  function lineClass(t: MdToken): string {
    const base = TOKEN_CLASS[t.kind];
    if (!t.selectable) return base;
    const parts = [base, 'doc-line'];
    if (threadAtLine.has(t.index)) parts.push('exp-noted');
    return parts.join(' ');
  }

  function renderLine(t: MdToken) {
    if (t.kind === 'blank') return <div key={t.index} style={{ height: 10 }} />;
    const onClick = () => openLine(t.index);
    const cls = lineClass(t);

    let el: ReactNode;
    if (t.kind === 'table' && t.table) {
      el = (
        <div className={cls} onClick={onClick}>
          <table className="md-table">
            <thead>
              <tr>
                {t.table.header.map((h, i) => (
                  <th key={i}>
                    <Inline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.table.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>
                      <Inline text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (t.kind === 'h1') {
      el = (
        <h1 className={cls} onClick={onClick}>
          <Inline text={t.text} />
        </h1>
      );
    } else if (t.kind === 'h2' || t.kind === 'h3') {
      el = (
        <div className={cls} onClick={onClick}>
          <Inline text={t.text} />
        </div>
      );
    } else if (t.kind === 'quote') {
      el = (
        <blockquote className={cls} onClick={onClick}>
          <Inline text={t.text} />
        </blockquote>
      );
    } else if (t.kind === 'bullet') {
      el = (
        <div className={cls} onClick={onClick}>
          <span className="bull">•</span>
          <span>
            <Inline text={t.text} />
          </span>
        </div>
      );
    } else {
      el = (
        <p className={cls} onClick={onClick}>
          <Inline text={t.text} />
        </p>
      );
    }

    const thread = threadAtLine.get(t.index);
    return (
      <Fragment key={t.index}>
        {el}
        {thread && (
          <ThreadView
            thread={thread}
            canPropose={!!onPropose && !!onApply}
            onSend={(q) => void ask(thread, q)}
            onClose={() => closeThread(thread.id)}
            onPropose={() => void propose(thread)}
            onApply={() => void applyProposal(thread)}
            onDiscard={() => discardProposal(thread)}
          />
        )}
      </Fragment>
    );
  }

  return (
    <div className={`doc-body kx-scroll${canAnnotate ? ' explain-on' : ''}`}>
      {canAnnotate && (
        <div className="exp-hint">
          <Sparkles className="ic" />
          <span>
            <b>Ask AI</b> · {HINT}
          </span>
        </div>
      )}

      {tokens.map(renderLine)}
    </div>
  );
}

/** One inline chat thread under its line — ask, follow up, and propose edits. */
function ThreadView({
  thread,
  canPropose,
  onSend,
  onClose,
  onPropose,
  onApply,
  onDiscard,
}: {
  thread: Thread;
  canPropose: boolean;
  onSend: (question: string) => void;
  onClose: () => void;
  onPropose: () => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const [draft, setDraft] = useState('');
  // Only offer "propose update" once the conversation has at least one answer.
  const hasAnswer = thread.messages.some((m) => m.role === 'agent');

  function send() {
    const q = draft.trim();
    if (!q || thread.busy) return;
    setDraft('');
    onSend(q);
  }

  const placeholder = thread.messages.length ? 'Devam et — başka bir şey sor…' : 'Bu satırı sor…';

  return (
    <div className="exp-thread">
      <button className="exp-close" onClick={onClose} aria-label="Kapat">
        <X style={{ width: 13, height: 13 }} />
      </button>

      <div className="exp-quote">
        <Quote className="ic" />
        <span>{thread.quote.slice(0, 140)}</span>
      </div>

      {thread.messages.map((m, i) => (
        <div key={i} className={`exp-msg ${m.role === 'prime' ? 'q' : 'a'}`}>
          <span className="exp-who">{m.role === 'prime' ? 'YOU ASKED' : 'AGENT'}</span>
          <span className="exp-tx">{m.text}</span>
        </div>
      ))}

      {thread.busy && (
        <div className="exp-msg a">
          <span className="exp-who">AGENT</span>
          <span className="exp-tx exp-thinking">thinking…</span>
        </div>
      )}
      {thread.error && (
        <div className="exp-msg a">
          <span className="exp-tx" style={{ color: 'var(--red)' }}>
            {thread.error}
          </span>
        </div>
      )}

      {/* Update flow: propose → preview → confirm. Nothing is written until Apply. */}
      {canPropose && hasAnswer && thread.proposal == null && (
        <button className="exp-propose" disabled={thread.proposing} onClick={onPropose}>
          {thread.proposing ? <Loader2 className="ic spin" /> : <FilePenLine className="ic" />}
          {thread.proposing ? 'Öneri hazırlanıyor…' : 'Bu sohbete göre güncelleme öner'}
        </button>
      )}
      {thread.proposal != null && (
        <div className="exp-proposal">
          <div className="exp-proposal-h">
            <FilePenLine className="ic" />
            Önerilen güncelleme — uygulamadan önce gözden geçir
          </div>
          <pre className="exp-proposal-body kx-scroll">{thread.proposal}</pre>
          <div className="exp-proposal-actions">
            <button className="btn btn-sm btn-secondary" disabled={thread.applying} onClick={onDiscard}>
              Vazgeç
            </button>
            <button className="btn btn-sm btn-primary" disabled={thread.applying} onClick={onApply}>
              {thread.applying ? <Loader2 className="ic spin" /> : <Check style={{ width: 13, height: 13 }} />}
              {thread.applying ? 'Uygulanıyor…' : 'Uygula'}
            </button>
          </div>
        </div>
      )}
      {thread.proposeError && (
        <div className="exp-msg a">
          <span className="exp-tx" style={{ color: 'var(--red)' }}>
            {thread.proposeError}
          </span>
        </div>
      )}

      <div className="exp-followup">
        <input
          value={draft}
          disabled={thread.busy}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
        />
        <button
          className="btn btn-icon btn-sm btn-primary"
          disabled={thread.busy || !draft.trim()}
          onClick={send}
          aria-label="Send"
        >
          <Send style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}

const TOKEN_CLASS: Record<MdToken['kind'], string> = {
  h1: 'doc-h1',
  h2: 'doc-h',
  h3: 'doc-h',
  quote: 'doc-quote',
  bullet: 'doc-bullet',
  para: 'doc-p',
  table: '',
  blank: '',
};
