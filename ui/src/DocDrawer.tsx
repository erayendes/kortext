import { Fragment, useEffect, useMemo, useState } from 'react';
import { Drawer } from './Drawer';
import { parseInline, parseMarkdown, type MdToken } from './markdown';
import { api, type DocInfo, type Project } from './api';

interface Note {
  line: number | null;
  excerpt: string;
  text: string;
}

// Ephemeral by design: answers live only in panel state, never in the file.
interface Explain {
  line: number | null;
  question: string;
  answer: string | null; // null = loading
}

export function DocDrawer({
  project,
  doc,
  onClose,
  onChanged,
}: {
  project: Project;
  doc: DocInfo | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [explains, setExplains] = useState<Explain[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setSelected(null);
    setNotes([]);
    setExplains([]);
    setErr(null);
    if (doc) {
      api
        .docContent(project.id, doc.rel)
        .then((r) => {
          setContent(r.content);
          setDraft(r.content);
        })
        .catch((e) => setErr(e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.rel, project.id]);

  // Engine-written files hard-wrap prose at ~80 chars; the tokenizer is
  // line-oriented, so consecutive para/quote lines are merged back into one
  // flowing block (the thread anchors at paragraph granularity).
  const tokens = useMemo(
    () => mergeWrappedLines(parseMarkdown(stripFrontmatter(content))),
    [content],
  );

  if (!doc) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Revision = the producing step re-runs with the notes; the doc comes back
  // as a fresh draft. The chain resumes on its own afterwards.
  const requestRevision = () =>
    act(async () => {
      await api.reviseDoc(
        project.id,
        doc.rel,
        notes.map((n) => (n.excerpt ? `[${n.excerpt}] ${n.text}` : n.text)),
      );
      setNotes([]);
      onClose();
    });

  // Inline conversation under the selected line — multi-turn, in character,
  // gone when the drawer closes.
  const ask = (line: number, question: string) => {
    const token = tokens.find((t) => t.index === line);
    const history = explains
      .filter((x) => x.line === line && x.answer !== null)
      .map((x) => ({ q: x.question, a: x.answer as string }));
    const entry: Explain = { line, question, answer: null };
    setExplains((xs) => [...xs, entry]);
    api
      .explainDoc(project.id, doc.rel, token?.text ?? '', question, history)
      .then((r) =>
        setExplains((xs) => xs.map((x) => (x === entry ? { ...x, answer: r.answer } : x))),
      )
      .catch((e) =>
        setExplains((xs) => xs.map((x) => (x === entry ? { ...x, answer: `Error: ${e.message}` } : x))),
      );
  };

  const addLineNote = (line: number, text: string) => {
    const token = tokens.find((t) => t.index === line);
    setNotes((ns) => [...ns, { line, excerpt: token?.text?.slice(0, 80) ?? '', text }]);
  };

  const approve = () =>
    act(async () => {
      await api.approveDoc(project.id, doc.rel);
      onClose();
    });

  const saveEdit = () =>
    act(async () => {
      await api.saveDoc(project.id, doc.rel, draft);
      setContent(draft);
      setEditing(false);
    });

  return (
    <Drawer open={!!doc} onClose={onClose} width={720}>
      <div className="dr-head">
        <div className="dr-title">
          <span className="kx-doc-name">{doc.name}</span>
          <StatusBadge doc={doc} />
          {doc.author && <span className="kx-doc-author mono">{doc.author.replace(/^\+/, '')}</span>}
        </div>
        <div className="dr-actions">
          {!editing && doc.status !== 'uninitialized' && (
            <button className="btn btn-sm" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {editing && (
            <>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={saveEdit}>
                Save
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={() => { setEditing(false); setDraft(content); }}>
                Discard
              </button>
            </>
          )}
          {!editing && doc.status === 'draft' && (
            <button className="btn btn-sm btn-success" disabled={busy} onClick={approve}>
              Approve
            </button>
          )}
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {err && <div className="kx-error">{err}</div>}
      <div className="dr-body">
        {editing ? (
          <textarea className="kx-editor mono" value={draft} onChange={(e) => setDraft(e.target.value)} />
        ) : (
          <div className="kx-doc">
            {tokens.map((t) => (
              <div key={t.index}>
                <DocBlock
                  token={t}
                  selected={selected === t.index}
                  noted={notes.some((n) => n.line === t.index)}
                  onSelect={() =>
                    doc.status === 'uninitialized' ? undefined : setSelected(selected === t.index ? null : t.index)
                  }
                />
                {(selected === t.index || explains.some((x) => x.line === t.index)) &&
                  doc.status !== 'uninitialized' && (
                    <LineThread
                      thread={explains.filter((x) => x.line === t.index)}
                      active={selected === t.index}
                      onAsk={(q) => ask(t.index, q)}
                      onNote={(text) => {
                        addLineNote(t.index, text);
                        setSelected(null);
                      }}
                    />
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
      {!editing && doc.status !== 'uninitialized' && (
        <div className="dr-foot">
          {notes.length > 0 ? (
            <div className="kx-notes">
              {notes.map((n, i) => (
                <div key={i} className="kx-note">
                  {n.excerpt && <span className="kx-note-exc mono">{n.excerpt}</span>}
                  <span>{n.text}</span>
                  <button className="kx-note-x" onClick={() => setNotes(notes.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="kx-cmd-hint">
              Click a line: chat with its author right below (Ask) or leave a revision note (Note).
            </span>
          )}
          <div className="kx-note-input">
            <button
              className="btn btn-sm btn-primary"
              disabled={busy || notes.length === 0}
              onClick={requestRevision}
            >
              Request revision{notes.length > 0 ? ` (${notes.length})` : ''}
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function StatusBadge({ doc }: { doc: DocInfo }) {
  const label = doc.status === 'uninitialized' ? (doc.blocked ? 'waiting' : 'next') : doc.status;
  return (
    <span className={`kx-status kx-status-${label}`}>
      {label}
      {doc.upstreamChanged ? ' ⚠' : ''}
    </span>
  );
}

function DocBlock({
  token,
  selected,
  noted,
  onSelect,
}: {
  token: MdToken;
  selected: boolean;
  noted: boolean;
  onSelect: () => void;
}) {
  if (token.kind === 'blank') return <div className="kx-blank" />;
  const cls = `kx-block kx-${token.kind}${selected ? ' selected' : ''}${noted ? ' noted' : ''}`;
  if (token.kind === 'table' && token.table) {
    return (
      <div className={cls} onClick={onSelect}>
        <table>
          <thead>
            <tr>
              {token.table.header.map((h, i) => (
                <th key={i}>
                  <Inline text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {token.table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>
                    <Inline text={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (token.kind === 'code') {
    return (
      <pre className={cls} onClick={onSelect}>
        {token.text}
      </pre>
    );
  }
  return (
    <div className={cls} onClick={onSelect}>
      <Inline text={token.text} />
    </div>
  );
}

// Backticks inside a bold span aren't caught by parseInline (its regex is
// flat), so bold values get one more code-splitting pass here.
function CodeBits({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/);
  return <>{parts.map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))}</>;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((s, i) => (
        <Fragment key={i}>
          {s.type === 'bold' ? (
            <strong>
              <CodeBits text={s.value} />
            </strong>
          ) : s.type === 'code' ? (
            <code>{s.value}</code>
          ) : (
            s.value
          )}
        </Fragment>
      ))}
    </>
  );
}

// The v3 AnnotatableDoc experience: an inline thread right under the selected
// line — converse with the author (Ask, multi-turn) or drop a revision note.
function LineThread({
  thread,
  active,
  onAsk,
  onNote,
}: {
  thread: Explain[];
  active: boolean;
  onAsk: (q: string) => void;
  onNote: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const waiting = thread.some((x) => x.answer === null);
  const send = (kind: 'ask' | 'note') => {
    const t = text.trim();
    if (!t) return;
    setText('');
    if (kind === 'ask') onAsk(t);
    else onNote(t);
  };
  return (
    <div className="kx-thread">
      {thread.map((x, i) => (
        <div key={i} className="kx-explain">
          <span className="kx-explain-q">{x.question}</span>
          <span className={`kx-explain-a${x.answer === null ? ' kx-running' : ''}`}>
            {x.answer === null ? 'writing an answer…' : x.answer}
          </span>
        </div>
      ))}
      {(active || waiting) && (
        <div className="kx-thread-input">
          <input
            className="kx-input"
            autoFocus={active}
            placeholder={thread.length > 0 ? 'Follow-up question… (Enter = Ask)' : 'Ask about this line, or write a note…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send('ask')}
          />
          <button className="btn btn-sm btn-secondary" disabled={waiting && !text.trim()} onClick={() => send('ask')}>
            Ask
          </button>
          <button className="btn btn-sm" onClick={() => send('note')}>
            Not
          </button>
        </div>
      )}
    </div>
  );
}

function mergeWrappedLines(tokens: MdToken[]): MdToken[] {
  const out: MdToken[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    if (
      prev &&
      (t.kind === 'para' || t.kind === 'quote') &&
      prev.kind === t.kind &&
      prev.text !== '' &&
      t.text !== ''
    ) {
      prev.text = `${prev.text} ${t.text}`;
      continue;
    }
    out.push({ ...t });
  }
  return out;
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  return end === -1 ? md : md.slice(end + 4).replace(/^\n+/, '');
}
