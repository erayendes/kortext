import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from './Drawer';
import { highlight } from './highlight';
import { parseInline, parseMarkdown, type AlertKind, type MdToken } from './markdown';
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
  failedError,
  onRetry,
  onClose,
  onChanged,
}: {
  project: Project;
  doc: DocInfo | null;
  failedError?: string | null;
  onRetry?: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [content, setContent] = useState('');
  const [version, setVersion] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [explains, setExplains] = useState<Explain[]>([]);
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState(false); // the editor holds a draft the engine wrote
  const [rawEdit, setRawEdit] = useState(false); // …and you asked to type in it rather than read it
  const [err, setErr] = useState<string | null>(null);

  // Every async handler below outlives the document it was started on — the
  // propose call runs an agent CLI, so minutes, not milliseconds — and the
  // drawer is one instance re-rendered rather than remounted, so its setters
  // stay live across the switch. This names whatever is on screen now, so a
  // late answer can tell whether it is still wanted.
  const showing = useRef<string | null>(null);
  useEffect(() => {
    showing.current = doc?.rel ?? null;
  });

  useEffect(() => {
    setEditing(false);
    setProposed(false);
    setRawEdit(false);
    setSelected(null);
    setNotes([]);
    setExplains([]);
    setErr(null);
    // The previous document's text goes with it. Keeping it meant a slow or
    // failed load rendered one document's body under another's name — and the
    // editor still held it, so Save wrote it into the file now open.
    setContent('');
    setVersion('');
    setDraft('');
    if (doc) {
      // The guard has to live outside the closure. Comparing `doc.rel` to a
      // const taken from the same `doc` compares a value to itself: the drawer
      // is one instance re-rendered, not remounted, so a load that resolves
      // after the reader moved on still held the setters and wrote its text
      // under the next document's name — and Save then sent that text to the
      // file now open. The cleanup runs before the next effect starts.
      let cancelled = false;
      api
        .docContent(project.id, doc.rel)
        .then((r) => {
          if (cancelled) return;
          setContent(r.content);
          setVersion(r.version);
          setDraft(r.content);
        })
        .catch((e) => {
          if (!cancelled) setErr(e.message);
        });
      return () => {
        cancelled = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.rel, project.id]);

  // Engine-written files hard-wrap prose at ~80 chars; the tokenizer is
  // line-oriented, so consecutive para/quote lines are merged back into one
  // flowing block (the thread anchors at paragraph granularity).
  const tokens = useMemo(() => {
    const all = mergeWrappedLines(parseMarkdown(stripFrontmatter(content)));
    // An Open Questions heading with nothing under it is structure, not
    // content — showing it makes every document look like it wants something.
    const dropEmpty = (tokens: typeof all, heading: RegExp) => {
      const start = tokens.findIndex(
        (t) => (t.kind === 'h1' || t.kind === 'h2' || t.kind === 'h3') && heading.test(t.text),
      );
      if (start === -1) return tokens;
      const after = tokens.slice(start + 1);
      const end = after.findIndex((t) => t.kind === 'h1' || t.kind === 'h2' || t.kind === 'h3');
      const body = end === -1 ? after : after.slice(0, end);
      const used = body.some((t) => t.kind !== 'blank' && !/^\[.*\]$/.test(t.text.trim()));
      return used ? tokens : [...tokens.slice(0, start), ...(end === -1 ? [] : after.slice(end))];
    };
    return dropEmpty(dropEmpty(all, /open questions/i), /revision requests/i);
  }, [content]);

  // Which blocks sit under the Open Questions heading — they are the ones the
  // reader has to act on, so they get their own ground rather than blending in.
  // Who answers on this machine — the thread says so rather than leaving the
  // reply unattributed.
  const [answerBy, setAnswerBy] = useState('agent');
  useEffect(() => {
    api
      .engines()
      .then((r) => setAnswerBy(r.selected ?? r.engines.find((e) => e.available)?.id ?? 'agent'))
      .catch(() => {});
  }, []);

  // Two different debts, two different colours. A question is work for the
  // reader of THIS document; a revision request is a demand on another one.
  // Painting both amber made them look like the same job.
  const [openQ, changeReq] = useMemo(() => {
    const asks = new Set<number>();
    const demands = new Set<number>();
    let section: 'ask' | 'demand' | null = null;
    for (const t of tokens) {
      if (t.kind === 'h1' || t.kind === 'h2' || t.kind === 'h3') {
        section = /open questions/i.test(t.text)
          ? 'ask'
          : /revision requests/i.test(t.text)
            ? 'demand'
            : null;
      }
      if (section === 'ask') asks.add(t.index);
      // A demand that has been settled is history, not debt: the sentence stays
      // in the document but stops being painted, so only what still stands is red.
      // Red marks a demand that still stands: a ticked box is history, and the
      // line under it is the record of what closed it.
      if (section === 'demand' && /^(?:\[ \]\s*)?`[A-Za-z][\w./-]*\.md`/.test(t.text.trim())) {
        demands.add(t.index);
      }
    }
    return [asks, demands] as const;
  }, [tokens]);

  // Her açık soru bir numara taşır: not çipi "#2: cevabım" diye okunur, alıntının
  // ilk 80 karakteri diye değil.
  const qNo = useMemo(() => {
    const n = new Map<number, number>();
    let inAsk = false;
    let i = 0;
    for (const t of tokens) {
      if (t.kind === 'h1' || t.kind === 'h2' || t.kind === 'h3')
        inAsk = /open questions/i.test(t.text);
      if (inAsk && t.kind === 'bullet' && t.text.trim()) n.set(t.index, ++i);
    }
    return n;
  }, [tokens]);

  if (!doc)
    return (
      <Drawer open={false} onClose={onClose}>
        {null}
      </Drawer>
    );

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
        setExplains((xs) =>
          xs.map((x) => (x === entry ? { ...x, answer: `Error: ${e.message}` } : x)),
        ),
      );
  };

  const addLineNote = (line: number, text: string) => {
    const token = tokens.find((t) => t.index === line);
    const no = qNo.get(line);
    setNotes((ns) => [
      ...ns,
      { line, excerpt: no ? `#${no}` : (token?.text?.slice(0, 60) ?? ''), text },
    ]);
  };

  const approve = () =>
    act(async () => {
      await api.approveDoc(project.id, doc.rel, version);
      onClose();
    });

  const saveEdit = () =>
    act(async () => {
      // A saved proposal answers the demands that produced it — otherwise the
      // document keeps asking for a change it already carries.
      const saved = await api.saveDoc(project.id, doc.rel, draft, version, proposed);
      setContent(saved.content);
      setVersion(saved.version);
      setDraft(saved.content);
      setEditing(false);
      setProposed(false);
      setRawEdit(false);
    });

  // The engine drafts the change another document asked for. It lands in the
  // editor, unsaved: this document is the human's, so the last keystroke is too.
  const proposeFix = () =>
    act(async () => {
      const rel = doc.rel;
      const { proposal } = await api.proposeRevision(project.id, rel);
      // The reader moved on while the CLI was drafting. Landing this now would
      // put one document's proposal in another's editor, and Save sends the
      // editor to the file that is open — with `proposed` set, which settles
      // that file's demands against text written for somewhere else.
      if (showing.current !== rel) return;
      setDraft(proposal);
      setProposed(true);
      setEditing(true);
    });

  return (
    <Drawer open={!!doc} onClose={onClose} width={720}>
      <div className="dr-head">
        <div className="dr-ident">
          <div className="dr-title">
            <span className="kx-doc-name">{doc.name}.md</span>
            <StatusBadge doc={doc} />
          </div>
          {doc.author && (
            <span className="kx-doc-author mono">{doc.author.replace(/^\+/, '')}</span>
          )}
        </div>
        <div className="dr-actions">
          {/* Approve · Edit · Close — karar, düzenleme, çıkış. */}
          {!editing && doc.status === 'draft' && (
            // A document that still asks something is not finished, and
            // approving it would bury the question under a green badge. Answer
            // it in the section — or delete the ones you are content to leave.
            <button
              className="btn btn-success"
              disabled={busy || doc.openQuestions}
              title={doc.openQuestions ? 'Answer the open questions in this document first' : ''}
              onClick={approve}
            >
              Approve
            </button>
          )}
          {!editing && doc.status !== 'uninitialized' && (
            <button className="btn btn-secondary" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {editing && (
            <>
              <button className="btn btn-primary" disabled={busy} onClick={saveEdit}>
                Save
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setDraft(content);
                  setProposed(false);
                  setRawEdit(false);
                }}
              >
                Discard
              </button>
            </>
          )}
          <button className="btn btn-link-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="dr-body">
        {err && <div className="kx-error">{err}</div>}
        {failedError && !editing && (
          <div className="kx-doc-changebar">
            <div className="kx-changebar-head">The last attempt to write this document failed.</div>
            <div className="kx-cmd-hint">{failedError}</div>
            {onRetry && (
              <div className="kx-changebar-actions">
                <button className="btn btn-primary" onClick={onRetry}>
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
        {doc.dependentOn.length > 0 && !editing && (
          <div className="kx-doc-dependbar">
            <span className="mono">
              {doc.dependentOn.map((d) => d.replace(/\.md$/, '')).join(', ')}
            </span>{' '}
            — an input of this document is moving. Nothing is wrong yet; when it settles, this one
            is read against it again and you are told if it has to change.
          </div>
        )}
        {doc.revisionRequests.length > 0 && !editing && (
          <RequestBar
            project={project}
            head={
              doc.hasProducingStep
                ? 'Another document has asked this one to change. Until it is settled, the analysis is not finished.'
                : 'Another document has asked this one to change. This one is yours — draft the change with the agent or edit it yourself, then approve it again.'
            }
            extra={
              doc.hasProducingStep ? null : (
                <button className="btn btn-primary" disabled={busy} onClick={proposeFix}>
                  {busy ? 'Drafting…' : 'Draft the change'}
                </button>
              )
            }
            items={doc.revisionRequests.map((r) => ({
              label: r.from,
              from: r.from,
              target: doc.rel,
              reason: r.reason,
              canApply: doc.hasProducingStep,
            }))}
            onDone={onChanged}
          />
        )}
        {doc.sentRequests.length > 0 && !editing && (
          <RequestBar
            project={project}
            head="This document has asked others to change. Settle each one here — the target keeps its “changes asked” mark until you do."
            items={doc.sentRequests.map((r) => ({
              label: r.target,
              from: doc.rel,
              target: r.target,
              reason: r.reason,
              canApply: r.targetHasStep,
            }))}
            onDone={onChanged}
          />
        )}
        {doc.openQuestions && !editing && (
          <div className="kx-doc-askbar">
            {notes.length > 0 ? (
              <>
                {notes.length} answer{notes.length > 1 ? 's' : ''} ready — press{' '}
                <strong>Request revision</strong> to send {notes.length > 1 ? 'them' : 'it'} back to{' '}
                {(doc.author ?? 'the author').replace(/^\+/, '')}, who folds the answers in and
                drops the questions they settle. Nothing is written until you do.
              </>
            ) : (
              <>
                This document is waiting on you. Click a question, type the answer, Add note — then
                Request revision. Or edit the document yourself and remove the questions you are
                content to leave open.
              </>
            )}
          </div>
        )}
        {editing ? (
          <>
            {proposed && (
              <div className="kx-changebar-head">
                Drafted by the agent from the request above. Nothing is saved until you press Save —
                read it, change what you want, then Save and approve.
              </div>
            )}
            {proposed && !rawEdit ? (
              <ProposalDiff before={content} after={draft} onEdit={() => setRawEdit(true)} />
            ) : (
              <textarea
                className="kx-editor mono"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </>
        ) : (
          <div className="kx-doc">
            {tokens.map((t) => (
              <div key={t.index}>
                <DocBlock
                  token={t}
                  openQuestion={openQ.has(t.index)}
                  questionNo={qNo.get(t.index)}
                  changeRequest={changeReq.has(t.index)}
                  selected={selected === t.index}
                  noted={notes.some((n) => n.line === t.index)}
                  onSelect={() => {
                    // Let the user select text: a click that ends a selection
                    // must not toggle the thread.
                    if ((window.getSelection()?.toString() ?? '').trim()) return;
                    if (doc.status === 'uninitialized') return;
                    setSelected(selected === t.index ? null : t.index);
                  }}
                />
                {(selected === t.index || explains.some((x) => x.line === t.index)) &&
                  doc.status !== 'uninitialized' && (
                    <LineThread
                      thread={explains.filter((x) => x.line === t.index)}
                      active={selected === t.index}
                      answerBy={answerBy}
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
                  <span className="kx-note-body">{n.text}</span>
                  <button
                    className="btn btn-x"
                    onClick={() => setNotes(notes.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="kx-cmd-hint">
              Click a line: chat with its author right below (Ask) or collect a revision note (Add
              note).
            </span>
          )}
          <div className="kx-note-input">
            {doc.hasProducingStep ? (
              <button
                className="btn btn-primary"
                disabled={busy || notes.length === 0}
                onClick={requestRevision}
              >
                Request revision{notes.length > 0 ? ` (${notes.length})` : ''}
              </button>
            ) : (
              <span className="kx-cmd-hint">
                No agent writes this document — use Edit to change it yourself.
              </span>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

// One vocabulary for every doc state: waiting · writing… · paused · pending ·
// approved · failed · n/a · log. `pending` is a document waiting on a human;
// `waiting` is one whose inputs are not settled, so nothing can run yet.
const STATUS_LABEL: Record<string, string> = {
  draft: 'pending',
  'not-applicable': 'n/a',
  approved: 'approved',
};

/**
 * Where the document itself stands — one of six, always exactly one. What is
 * owed on top of it (a failed attempt, a demand, a moving input) is a badge,
 * because those ride alongside a state rather than replacing it.
 */
export function statusOf(
  doc: DocInfo,
  opts: { running?: boolean; stopped?: boolean } = {},
): { key: string; label: string } {
  if (opts.running) return { key: 'writing', label: 'writing…' };
  if (opts.stopped) return { key: 'paused', label: 'paused' };
  // Unwritten docs all read 'waiting' — the group heading already says Next,
  // so a separate 'next' pill only added noise.
  if (doc.status === 'uninitialized') return { key: 'waiting', label: 'waiting' };
  return { key: doc.status, label: STATUS_LABEL[doc.status] ?? doc.status };
}

export function StatusBadge({
  doc,
  running,
  stopped,
}: {
  doc: DocInfo;
  running?: boolean;
  stopped?: boolean;
}) {
  const { key, label } = statusOf(doc, { running, stopped });
  return <span className={`kx-status kx-status-${key}`}>{label}</span>;
}

/** What is owed on this document, next to the state it is in. */
export function DocBadges({
  doc,
  failed,
  rechecking,
}: {
  doc: DocInfo;
  failed?: boolean;
  rechecking?: boolean;
}) {
  return (
    <>
      {failed && <span className="kx-badge kx-badge-failed">failed</span>}
      {doc.revisionRequests.length > 0 && (
        <span
          className="kx-badge kx-badge-change"
          title={doc.revisionRequests.map((r) => `${r.from}: ${r.reason}`).join('\n')}
        >
          change request
        </span>
      )}
      {(doc.dependentOn.length > 0 || rechecking) && (
        <span
          className="kx-badge kx-badge-dependent"
          title={
            rechecking
              ? 'Being read again against the input that changed'
              : `Waiting on ${doc.dependentOn.join(', ')} to settle`
          }
        >
          dependent
        </span>
      )}
    </>
  );
}

// One demand, listed from either end: the document it was made of, and the
// document that made it. Same three answers in both places.
function RequestBar({
  project,
  head,
  items,
  extra,
  onDone,
}: {
  project: Project;
  head: string;
  items: Array<{ label: string; from: string; target: string; reason: string; canApply: boolean }>;
  extra?: React.ReactNode;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [settled, setSettled] = useState<Set<string>>(new Set());
  const [noting, setNoting] = useState<number | null>(null);
  const [note, setNote] = useState('');
  // Asking about a demand is the same inline conversation as asking about a
  // line: the author of the document that made it answers, nothing is kept.
  const [asking, setAsking] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<Array<{ i: number; q: string; a: string | null }>>([]);

  const ask = (i: number) => {
    const q = question.trim();
    if (!q) return;
    const it = items[i];
    const history = chat.filter((c) => c.i === i && c.a).map((c) => ({ q: c.q, a: c.a as string }));
    // The entry itself, not its wording: the same question asked on two demands
    // would otherwise be answered once, into both threads.
    const entry = { i, q, a: null as string | null };
    setChat((cs) => [...cs, entry]);
    setQuestion('');
    const fill = (a: string) => setChat((cs) => cs.map((c) => (c === entry ? { ...c, a } : c)));
    api
      .explainDoc(project.id, it.from, `[asks ${it.target}] ${it.reason}`, q, history)
      .then((r) => fill(r.answer))
      .catch((e) => fill(`— ${(e as Error).message}`));
  };

  const keyOf = (it: { from: string; target: string; reason: string }) =>
    `${it.from}→${it.target}: ${it.reason}`;

  const decide = async (i: number, decision: 'apply' | 'dismiss', instruction?: string) => {
    const it = items[i];
    setBusy(true);
    setErr(null);
    try {
      await api.decideRequest(project.id, {
        from: it.from,
        target: it.target,
        reason: it.reason,
        decision,
        instruction,
      });
      // The list only clears on the next refresh, so remember what was answered:
      // otherwise the buttons come back for a second press the server refuses.
      setSettled((s) => new Set(s).add(keyOf(it)));
      setNoting(null);
      setNote('');
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A demand you have answered leaves at once — it lingered with a "settled"
  // hint until the next refresh, which reads as "still waiting on you".
  const live = items.map((it, i) => ({ it, i })).filter(({ it }) => !settled.has(keyOf(it)));
  if (live.length === 0 && !err) return null;

  return (
    <div className="kx-doc-changebar">
      <div className="kx-changebar-head">{head}</div>
      {err && <div className="kx-error">{err}</div>}
      <ul className="kx-changebar-list">
        {live.map(({ it, i }) => {
          const talk = chat.filter((c) => c.i === i);
          return (
            <li key={i}>
              <span className="mono">{it.label.replace(/\.md$/, '')}</span> — {it.reason}
              <div className="kx-changebar-actions">
                {it.canApply && (
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => decide(i, 'apply')}
                  >
                    Apply
                  </button>
                )}
                <button
                  className="btn btn-link-primary"
                  disabled={busy}
                  onClick={() => decide(i, 'dismiss')}
                >
                  Dismiss
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => setNoting(noting === i ? null : i)}
                >
                  Add note
                </button>
                {!it.canApply && (
                  <span className="kx-cmd-hint">
                    No agent writes that one — open it to draft the change.
                  </span>
                )}
                {extra}
                <button
                  className="btn btn-link-primary"
                  disabled={busy}
                  onClick={() => setAsking(asking === i ? null : i)}
                >
                  Ask
                </button>
              </div>
              {(talk.length > 0 || asking === i || noting === i) && (
                <div className="kx-thread">
                  {talk.map((c, k) => (
                    <div key={k} className="kx-explain">
                      <span className="kx-explain-who mono">prime</span>
                      <span className="kx-explain-q">{c.q}</span>
                      <span className="kx-explain-who mono">{it.from.replace(/\.md$/, '')}</span>
                      <span className={`kx-explain-a${c.a === null ? ' kx-running' : ''}`}>
                        {c.a === null ? 'writing an answer…' : <AnswerText text={c.a} />}
                      </span>
                    </div>
                  ))}
                  {(asking === i || noting === i) && (
                    <div className="kx-thread-input">
                      <textarea
                        className="kx-input kx-thread-text"
                        autoFocus
                        rows={1}
                        placeholder={
                          asking === i
                            ? 'Ask about this demand…  (Enter sends, Shift+Enter for a new line)'
                            : 'How it should be done instead — this rides along with the request…  (Enter sends, Shift+Enter for a new line)'
                        }
                        value={asking === i ? question : note}
                        onChange={(e) =>
                          asking === i ? setQuestion(e.target.value) : setNote(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (asking === i) ask(i);
                            else if (note.trim()) void decide(i, 'apply', note.trim());
                          }
                          if (e.key === 'Escape') {
                            setAsking(null);
                            setNoting(null);
                          }
                        }}
                      />
                      <div className="kx-thread-actions">
                        {asking === i ? (
                          <button
                            className="btn btn-primary"
                            disabled={!question.trim()}
                            onClick={() => ask(i)}
                          >
                            Ask
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary"
                            disabled={busy || !note.trim()}
                            onClick={() => decide(i, 'apply', note.trim())}
                          >
                            Apply with this note
                          </button>
                        )}
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setAsking(null);
                            setNoting(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The block is there to be used somewhere else — a command, a schema, a path.
// Selecting it by hand out of a scrolling panel is the one thing GitHub spares
// the reader, so the button says it copied and goes back to itself.
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      className="kx-copy"
      title={done ? 'Copied' : 'Copy'}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard
          .writeText(text)
          .then(() => setDone(true))
          .catch(() => {});
      }}
    >
      {done ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M13.5 4.5l-7 7-4-4 1.1-1.1L6.5 9.3l5.9-5.9 1.1 1.1z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M5.5 1.5h7a1 1 0 011 1v7h-1.5V3H5.5V1.5zM3 4.5h6.5a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-7a1 1 0 011-1zm.5 1.5v6h5.5V6H3.5z"
            fill="currentColor"
          />
        </svg>
      )}
      <span className="kx-copy-label">{done ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

const ALERT_LABEL: Record<AlertKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

// One 16px glyph each, drawn rather than pulled from an icon package — five
// paths are cheaper than a dependency, and they inherit the alert's colour.
function AlertIcon({ kind }: { kind: AlertKind }) {
  const d = {
    note: 'M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 7.25h1.5v4h-1.5v-4zM8 4.5a.9.9 0 110 1.8.9.9 0 010-1.8z',
    tip: 'M8 1.5c-2.35 0-4 1.75-4 3.9 0 1.5.8 2.5 1.5 3.3.4.45.6.8.6 1.3v.5h3.8v-.5c0-.5.2-.85.6-1.3.7-.8 1.5-1.8 1.5-3.3 0-2.15-1.65-3.9-4-3.9zM6.1 12h3.8v1.1H6.1V12zm.6 2.1h2.6l-.6.9H7.3l-.6-.9z',
    important:
      'M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 4.5h1.5v4.5h-1.5V4.5zM8 10.2a.9.9 0 110 1.8.9.9 0 010-1.8z',
    warning:
      'M8 1.6a.9.9 0 01.78.45l6 10.35A.9.9 0 0114 13.8H2a.9.9 0 01-.78-1.4l6-10.35A.9.9 0 018 1.6zm-.75 4.15v4h1.5v-4h-1.5zM8 10.9a.9.9 0 100 1.8.9.9 0 000-1.8z',
    caution:
      'M5.2 1.5h5.6L14.5 5.2v5.6L10.8 14.5H5.2L1.5 10.8V5.2L5.2 1.5zM7.25 4.5v4.5h1.5V4.5h-1.5zM8 10.2a.9.9 0 110 1.8.9.9 0 010-1.8z',
  }[kind];
  return (
    <svg className="kx-alert-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function DocBlock({
  token,
  selected,
  noted,
  openQuestion,
  changeRequest,
  questionNo,
  onSelect,
}: {
  token: MdToken;
  selected: boolean;
  noted: boolean;
  openQuestion?: boolean;
  changeRequest?: boolean;
  questionNo?: number;
  onSelect: () => void;
}) {
  const activation = {
    role: 'button',
    tabIndex: 0,
    'aria-pressed': selected,
    onClick: onSelect,
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onSelect();
      }
    },
  };
  if (token.kind === 'blank') return <div className="kx-blank" />;
  const cls = `kx-block kx-${token.kind}${selected ? ' selected' : ''}${noted ? ' noted' : ''}${openQuestion ? ' open-q' : ''}${changeRequest ? ' req-q' : ''}${questionNo ? ' kx-numbered' : ''}`;
  if (token.kind === 'table' && token.table) {
    return (
      <div className={cls} {...activation}>
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
  if (token.kind === 'alert' && token.alert) {
    return (
      <div className={`${cls} kx-alert kx-alert-${token.alert}`} {...activation}>
        <div className="kx-alert-head">
          <AlertIcon kind={token.alert} />
          {ALERT_LABEL[token.alert]}
        </div>
        <div className="kx-alert-body">
          <AnswerText text={token.text} />
        </div>
      </div>
    );
  }
  if (token.kind === 'code') {
    if (token.lang === 'mermaid') {
      return (
        <div className={`${cls} kx-mermaid`} {...activation}>
          <Mermaid code={token.text} />
        </div>
      );
    }
    return (
      <div className={`${cls} kx-codewrap`} {...activation}>
        <CopyButton text={token.text} />
        <pre>
          {highlight(token.text, token.lang).map((t, i) =>
            t.kind ? (
              <span key={i} className={`hl-${t.kind}`}>
                {t.text}
              </span>
            ) : (
              <Fragment key={i}>{t.text}</Fragment>
            ),
          )}
        </pre>
      </div>
    );
  }
  // `- [ ] …` / `- [x] …` is a checklist item, and the brackets were reaching the
  // reader as punctuation. The box is drawn, and it is the state: a settled
  // revision request and a met acceptance criterion both read at a glance.
  const task = token.kind === 'bullet' ? token.text.match(/^\[([ xX])\]\s*(.*)$/s) : null;
  return (
    <div
      className={`${cls}${task ? ' kx-task' : ''}`}
      style={token.depth ? { marginLeft: token.depth * 18 } : undefined}
      {...activation}
    >
      {questionNo && <span className="kx-qno mono">#{questionNo}</span>}
      {task ? (
        <>
          <input
            type="checkbox"
            className="kx-task-box"
            checked={task[1] !== ' '}
            readOnly
            tabIndex={-1}
          />
          <span className="kx-task-text">
            <Inline text={task[2] ?? ''} />
          </span>
        </>
      ) : (
        <Inline text={token.text} />
      )}
    </div>
  );
}

// Mermaid fences render as diagrams — the source never shows. The library is
// lazy-loaded so docs without diagrams pay nothing; a diagram that fails to
// parse falls back to the raw source block.
let mermaidId = 0;
function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSvg(null);
    setFailed(false);
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        // The fence comes from a document the agent wrote while reading the
        // user's repository, and the rendered SVG goes in through
        // dangerouslySetInnerHTML below. 'strict' is mermaid's default today —
        // pinned here so a library upgrade cannot quietly hand that markup
        // through unsanitised.
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
        const { svg } = await mermaid.render(`kx-mmd-${mermaidId++}`, code);
        if (alive) setSvg(svg);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  if (failed) return <pre className="kx-code mono">{code}</pre>;
  if (!svg) return <span className="kx-cmd-hint">rendering diagram…</span>;
  return <div className="kx-mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// The agent hands back the WHOLE document, so "what actually changed" was left
// to the reader's eye. These drafts touch a line or two; a line LCS finds them.
function lineDiff(a: string, b: string): { sign: ' ' | '-' | '+'; text: string }[] {
  const x = a.split('\n');
  const y = b.split('\n');
  const n = x.length;
  const m = y.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: { sign: ' ' | '-' | '+'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ sign: ' ', text: x[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ sign: '-', text: x[i]! });
      i++;
    } else {
      out.push({ sign: '+', text: y[j]! });
      j++;
    }
  }
  while (i < n) out.push({ sign: '-', text: x[i++]! });
  while (j < m) out.push({ sign: '+', text: y[j++]! });
  return out;
}

// The draft IS the editor — reading it in one box and its changes in another
// meant holding two documents in your head. So the editor shows the whole file
// with the changed lines marked, and hands over to the plain textarea the
// moment you want to type.
function ProposalDiff({
  before,
  after,
  onEdit,
}: {
  before: string;
  after: string;
  onEdit: () => void;
}) {
  const lines = useMemo(() => lineDiff(before, after), [before, after]);
  const changed = lines.filter((l) => l.sign !== ' ' && l.text.trim() !== '').length;
  return (
    <>
      <div className="kx-diff-bar">
        <span className="kx-cmd-hint">
          {changed === 0
            ? 'The draft matches the document — nothing changed.'
            : `${changed} line${changed === 1 ? '' : 's'} changed`}
        </span>
        <button className="btn btn-secondary" onClick={onEdit}>
          Edit text
        </button>
      </div>
      <div className="kx-diff mono" onDoubleClick={onEdit}>
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              l.sign === '+' ? 'kx-diff-add' : l.sign === '-' ? 'kx-diff-del' : 'kx-diff-same'
            }
          >
            <span className="kx-diff-sign">{l.sign === ' ' ? '' : l.sign}</span>
            {l.text}
          </div>
        ))}
      </div>
    </>
  );
}

// Backticks inside a bold span aren't caught by parseInline (its regex is
// flat), so bold values get one more code-splitting pass here.
function CodeBits({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/);
  return <>{parts.map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))}</>;
}

// An agent answer is markdown: bullets and **bold** were reaching the reader as
// literal asterisks. `.kx-explain-a` keeps `pre-wrap`, so line breaks survive —
// each line only needs its inline spans resolved.
function AnswerText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          <Inline text={line} />
        </Fragment>
      ))}
    </>
  );
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
          ) : s.type === 'italic' ? (
            <em>
              <CodeBits text={s.value} />
            </em>
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
  answerBy,
  onAsk,
  onNote,
}: {
  thread: Explain[];
  active: boolean;
  answerBy: string;
  onAsk: (q: string) => void;
  onNote: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const waiting = thread.some((x) => x.answer === null);
  // A thread opened on a line near the bottom of the drawer unfolded below the
  // fold — the reader saw a panel that had visibly done something, off-screen.
  useEffect(() => {
    if (active) box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);
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
          <span className="kx-explain-who mono">prime</span>
          <span className="kx-explain-q">{x.question}</span>
          <span className="kx-explain-who mono">{answerBy}</span>
          <span className={`kx-explain-a${x.answer === null ? ' kx-running' : ''}`}>
            {x.answer === null ? 'writing an answer…' : <AnswerText text={x.answer} />}
          </span>
        </div>
      ))}
      {(active || waiting) && (
        <div className="kx-thread-input" ref={box}>
          <textarea
            className="kx-input kx-thread-text"
            autoFocus={active}
            rows={1}
            placeholder={
              thread.length > 0
                ? 'Follow-up question, or a note…  (Enter sends, Shift+Enter for a new line)'
                : 'Ask about this line, or write a note…  (Enter sends, Shift+Enter for a new line)'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Shift+Enter is how you write a second line; Enter alone sends.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send('ask');
              }
            }}
          />
          <div className="kx-thread-actions">
            {/* Sormak önce gelen adım, not bırakmak asıl iş — ve son buton sağda durur. */}
            <button
              className="btn btn-link-primary"
              disabled={!text.trim()}
              onClick={() => send('ask')}
            >
              Ask
            </button>
            <button
              className="btn btn-primary"
              disabled={!text.trim()}
              onClick={() => send('note')}
            >
              Add note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function mergeWrappedLines(tokens: MdToken[]): MdToken[] {
  const out: MdToken[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    // A list item wrapped at 80 chars continued on an indented line, and the
    // continuation broke out of the list to sit at the left margin. The indent
    // is what says "still the item above" — an unindented line is a new block.
    if (
      prev &&
      (prev.kind === 'bullet' || prev.kind === 'ordered') &&
      t.kind === 'para' &&
      /^\s/.test(t.text) &&
      t.text.trim() !== ''
    ) {
      prev.text = `${prev.text} ${t.text.trim()}`;
      continue;
    }
    if (
      prev &&
      (t.kind === 'para' || t.kind === 'quote') &&
      prev.kind === t.kind &&
      prev.text !== '' &&
      t.text !== '' &&
      // A line that opens with a list marker is a new item, not a wrap of the
      // one above — merging those is what produced the asterisk walls.
      !/^\s*([-*+]|\d+[.)]) /.test(t.text)
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
