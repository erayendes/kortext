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

// A, B, ... Z, AA — spreadsheet columns, so a long review never runs out of marks.
function letter(n: number): string {
  return n < 26 ? String.fromCharCode(65 + n) : letter(Math.floor(n / 26) - 1) + letter(n % 26);
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
  const [preview, setPreview] = useState(false); // DESIGN.md drawn, not read
  const [proposed, setProposed] = useState(false); // the editor holds a draft the engine wrote
  const [rawEdit, setRawEdit] = useState(false); // …and you asked to type in it rather than read it
  const [err, setErr] = useState<string | null>(null);
  // What the document said before it was last written, when the chain is intact.
  const [previous, setPrevious] = useState<string | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(false);

  // Track the visible document across async handlers; the drawer instance survives document changes.
  const showing = useRef<string | null>(null);
  useEffect(() => {
    showing.current = doc?.rel ?? null;
  });

  useEffect(() => {
    setEditing(false);
    setPreview(false);
    setProposed(false);
    setRawEdit(false);
    setSelected(null);
    setNotes([]);
    setExplains([]);
    setErr(null);
    // Clear prior content before loading so stale text cannot be saved into the new document.
    setContent('');
    setVersion('');
    setDraft('');
    setPrevious(null);
    setOnlyChanges(false);
    if (doc) {
      // Ignore results after effect cleanup; captured doc values alone cannot detect a later selection.
      let cancelled = false;
      api
        .docContent(project.id, doc.rel)
        .then((r) => {
          if (cancelled) return;
          setContent(r.content);
          setVersion(r.version);
          setDraft(r.content);
          // Only diff against a recorded write. Approving, ticking a demand and
          // appending a recheck's line all edit the file without recording, so a
          // stale head would make the previous row the wrong baseline.
          void api
            .docHistory(project.id, doc.rel)
            .then(async (h) => {
              const [head, prior] = h.versions;
              if (cancelled || !head || !prior || head.sha !== r.version) return;
              const text = await api.docVersionText(project.id, prior.id);
              if (!cancelled) setPrevious(text.content);
            })
            .catch(() => {});
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
    // Hide empty question sections.
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

  // The answer names its own author. Asking the global engine setting instead
  // signed codex's answers as claude whenever the project ran on the other one.
  // The project's own engine is the right guess while the answer is still coming.
  const [answerBy, setAnswerBy] = useState(project.engine ?? 'agent');

  // Distinguish questions for this document from revision requests sent to another document.
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
      // Highlight only open requests; keep settled requests visible as history.
      if (section === 'demand' && /^(?:\[ \]\s*)?`[A-Za-z][\w./-]*\.md`/.test(t.text.trim())) {
        demands.add(t.index);
      }
    }
    return [asks, demands] as const;
  }, [tokens]);

  // Use question numbers in note labels instead of truncated excerpts.
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

  /**
   * What this write changed, compared block by block rather than line by line.
   *
   * The engine hard-wraps prose, so a rewrite re-wraps it; comparing raw lines
   * paints a whole paragraph green for one changed word. Tokens survive that,
   * and the maps are keyed by `token.index` — the same identity the notes, the
   * question numbers and the scroll anchors use — so nothing that points at a
   * line has to know a diff exists.
   */
  const [changed, replaced] = useMemo(() => {
    const none: [Set<number>, Map<number, MdToken[]>] = [new Set(), new Map()];
    if (previous === null) return none;
    const before = mergeWrappedLines(parseMarkdown(stripFrontmatter(previous)));
    const after = mergeWrappedLines(parseMarkdown(stripFrontmatter(content)));
    const marks = new Set<number>();
    const gone = new Map<number, MdToken[]>();
    let pending: MdToken[] = [];
    for (const d of lcsDiff(before, after, (t) => `${t.kind}\u0000${t.text}`)) {
      if (d.sign === '-') {
        if (d.item.kind !== 'blank') pending.push(d.item);
        continue;
      }
      if (d.sign === '+' && d.item.kind !== 'blank') marks.add(d.item.index);
      // Removed blocks belong to whatever survived them.
      if (pending.length > 0 && d.item.kind !== 'blank') {
        gone.set(d.item.index, pending);
        pending = [];
      }
    }
    return [marks, gone] as [Set<number>, Map<number, MdToken[]>];
  }, [previous, content]);

  const changedCount = tokens.filter((t) => changed.has(t.index) || replaced.has(t.index)).length;

  // A note marks its line, and the mark is what the footer row shows: a question
  // keeps the number it already carries, any other line takes the next letter.
  const lineLabel = useMemo(() => {
    const m = new Map<number, string>();
    let n = 0;
    for (const note of notes) {
      if (note.line === null || m.has(note.line)) continue;
      const q = qNo.get(note.line);
      m.set(note.line, q ? `#${q}` : `#${letter(n++)}`);
    }
    return m;
  }, [notes, qNo]);

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

  // Keep multi-turn Q&A in drawer state only.
  const ask = (line: number, question: string) => {
    const token = tokens.find((t) => t.index === line);
    const history = explains
      .filter((x) => x.line === line && x.answer !== null)
      .map((x) => ({ q: x.question, a: x.answer as string }));
    const entry: Explain = { line, question, answer: null };
    setExplains((xs) => [...xs, entry]);
    api
      .explainDoc(project.id, doc.rel, token?.text ?? '', question, history)
      .then((r) => {
        setAnswerBy(r.answeredBy);
        setExplains((xs) => xs.map((x) => (x === entry ? { ...x, answer: r.answer } : x)));
      })
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
      // Saving a proposal also settles the requests it addresses.
      const saved = await api.saveDoc(project.id, doc.rel, draft, version, proposed);
      setContent(saved.content);
      setVersion(saved.version);
      setDraft(saved.content);
      setEditing(false);
      setProposed(false);
      setRawEdit(false);
    });

  // Load the proposed revision into the editor; do not save it automatically.
  const proposeFix = () =>
    act(async () => {
      const rel = doc.rel;
      const { proposal } = await api.proposeRevision(project.id, rel);
      // Ignore a proposal if the user has switched documents before it completes.
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
          {!editing && doc.status === 'draft' && (
            // Require open questions to be resolved before approval.
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
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setPreview(false);
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
          {/* Tokens read better drawn than tabulated, and the page is rendered
              from this same file so it is never out of date. The iframe keeps
              the project's palette and the panel's from leaking into each other. */}
          {!editing && doc.rel === 'DESIGN.md' && doc.status !== 'uninitialized' && (
            <button className="btn btn-secondary" onClick={() => setPreview(!preview)}>
              {preview ? 'Document' : 'Preview'}
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
      <div className={preview ? 'dr-body dr-body-preview' : 'dr-body'}>
        {preview && (
          // The preview document has independent theme controls.
          <iframe
            className="kx-doc-preview"
            title={`${doc.name} — design tokens`}
            src={`/api/projects/${project.id}/docs/design-preview`}
          />
        )}
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
            bulk={doc.hasProducingStep ? doc.rel : undefined}
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
              locked: r.targetWriting,
            }))}
            onDone={onChanged}
          />
        )}
        {doc.conflicts.length > 0 && !editing && (
          <ConflictBar project={project} doc={doc} onDone={onChanged} />
        )}
        {doc.warnings.length > 0 && !editing && (
          <WarningBar project={project} doc={doc} onDone={onChanged} />
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
            {changedCount > 0 && (
              <div className="kx-diff-bar">
                <span>
                  {changedCount} of {tokens.filter((t) => t.kind !== 'blank').length} blocks changed
                  since it was last written
                </span>
                <button className="btn btn-secondary" onClick={() => setOnlyChanges(!onlyChanges)}>
                  {onlyChanges ? 'Show the whole document' : 'Show only what changed'}
                </button>
              </div>
            )}
            {tokens
              .filter((t) => !onlyChanges || changed.has(t.index) || replaced.has(t.index))
              .map((t) => (
                <div key={t.index} id={`kx-line-${t.index}`}>
                  <DocBlock
                    token={t}
                    changed={changed.has(t.index)}
                    openQuestion={openQ.has(t.index)}
                    questionNo={qNo.get(t.index)}
                    noteLabel={lineLabel.get(t.index)}
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
                  {replaced.has(t.index) && <RemovedToggle tokens={replaced.get(t.index)!} />}
                </div>
              ))}
          </div>
        )}
      </div>
      {/* The footer asks about lines of the document; the preview has none. */}
      {!editing && !preview && doc.status !== 'uninitialized' && (
        <div className="dr-foot">
          {notes.length > 0 ? (
            <div className="kx-notes">
              {notes.map((n, i) => (
                <div key={i} className="kx-note">
                  {n.line !== null && lineLabel.has(n.line) ? (
                    <button
                      className="kx-note-exc mono"
                      title="Go to the line"
                      onClick={() => {
                        setSelected(null);
                        // Instant, not smooth: the drawer is a transformed
                        // ancestor, and Chrome's smooth path silently does
                        // nothing inside one.
                        document
                          .getElementById(`kx-line-${n.line}`)
                          ?.scrollIntoView({ block: 'center' });
                      }}
                    >
                      {lineLabel.get(n.line)}
                    </button>
                  ) : (
                    n.excerpt && <span className="kx-note-exc mono">{n.excerpt}</span>
                  )}
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

/** The state word, as the server decided it. Presentation only. */
export function statusOf(doc: DocInfo): { key: string; label: string } {
  if (doc.state === 'writing') return { key: 'writing', label: 'writing…' };
  if (doc.state === 'n/a') return { key: 'not-applicable', label: 'n/a' };
  return { key: doc.state, label: doc.state };
}

export function StatusBadge({ doc }: { doc: DocInfo }) {
  const { key, label } = statusOf(doc);
  return <span className={`kx-status kx-status-${key}`}>{label}</span>;
}

// Which kind of waiting, writing or pausing — the word in brackets before the state.
const DETAIL_TITLE: Record<string, string> = {
  approve: 'Written and waiting for your approval',
  review: 'Another document has asked this one to change',
  answer: 'Answer the open questions before approving',
  queue: 'Not written yet',
  update: 'Waiting to be read again against an input that moved',
  draft: 'Being written for the first time',
  failed: 'The run failed — retry it',
};

/** What is owed on this document, next to the state it is in. */
export function DocBadges({ doc }: { doc: DocInfo }) {
  return (
    <>
      {doc.detail && (
        <span
          className={`kx-badge kx-badge-${doc.detail}`}
          title={
            doc.detail === 'review'
              ? [
                  ...doc.revisionRequests.map((r) => `${r.from}: ${r.reason}`),
                  ...doc.conflicts.map((c) => `conflict with ${c.from}: ${c.reason}`),
                  ...doc.warnings.map((w) => `${w.subject}: ${w.reason}`),
                ].join('\n')
              : (DETAIL_TITLE[doc.detail] ?? '')
          }
        >
          ({doc.detail})
        </span>
      )}
      {doc.dependentOn.length > 0 && (
        <span
          className="kx-badge kx-badge-dependent"
          title={`Waiting on ${doc.dependentOn.join(', ')} to settle`}
        >
          dependent
        </span>
      )}
    </>
  );
}

// Use the same actions for incoming and outgoing revision requests.
function RequestBar({
  project,
  head,
  items,
  extra,
  bulk,
  onDone,
}: {
  project: Project;
  head: string;
  items: Array<{
    label: string;
    from: string;
    target: string;
    reason: string;
    canApply: boolean;
    /** The target is mid-rewrite; deciding now would only be refused. */
    locked?: boolean;
  }>;
  extra?: React.ReactNode;
  /** The document these all land on — set to settle them in one decision. */
  bulk?: string;
  onDone: () => void;
}) {
  // Prime ticks what they accept; the rest are dismissed by the same press, and
  // the button says so before it is pressed.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [settled, setSettled] = useState<Set<string>>(new Set());
  const [noting, setNoting] = useState<number | null>(null);
  const [note, setNote] = useState('');
  // Direct Q&A to the author of the requesting document.
  const [asking, setAsking] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<Array<{ i: number; q: string; a: string | null }>>([]);

  const ask = (i: number) => {
    const q = question.trim();
    if (!q) return;
    const it = items[i];
    const history = chat.filter((c) => c.i === i && c.a).map((c) => ({ q: c.q, a: c.a as string }));
    // Key replies by request identity so identical questions on different requests stay separate.
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

  // One press, one rewrite: a document is written once, so applying the ticked
  // ones separately would start a run and have the rest refused.
  const settleAll = async () => {
    if (!bulk) return;
    const open = items.filter((it) => !settled.has(keyOf(it)));
    setBusy(true);
    setErr(null);
    try {
      await api.settleRequests(project.id, {
        rel: bulk,
        apply: open
          .filter((it) => ticked.has(keyOf(it)))
          .map((it) => ({ from: it.from, reason: it.reason })),
        dismiss: open
          .filter((it) => !ticked.has(keyOf(it)))
          .map((it) => ({ from: it.from, reason: it.reason })),
      });
      setSettled((s) => new Set([...s, ...open.map(keyOf)]));
      setTicked(new Set());
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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

  // Hide settled entries immediately, before the next poll.
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
              {bulk && (
                <input
                  type="checkbox"
                  className="kx-req-check"
                  checked={ticked.has(keyOf(it))}
                  disabled={busy}
                  aria-label={`Apply the change ${it.label} asked for`}
                  onChange={(e) =>
                    setTicked((t) => {
                      const next = new Set(t);
                      if (e.target.checked) next.add(keyOf(it));
                      else next.delete(keyOf(it));
                      return next;
                    })
                  }
                />
              )}
              <span className="mono">{it.label.replace(/\.md$/, '')}</span> — {it.reason}
              <div className="kx-changebar-actions">
                {!bulk && it.canApply && (
                  <button
                    className="btn btn-primary"
                    disabled={busy || it.locked}
                    title={it.locked ? `${it.target} is being rewritten — wait for it to land` : ''}
                    onClick={() => decide(i, 'apply')}
                  >
                    Apply
                  </button>
                )}
                {!bulk && (
                  <button
                    className="btn btn-link-primary"
                    disabled={busy || it.locked}
                    title={it.locked ? `${it.target} is being rewritten — wait for it to land` : ''}
                    onClick={() => decide(i, 'dismiss')}
                  >
                    Dismiss
                  </button>
                )}
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
      {bulk && (
        <div className="kx-changebar-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => settleAll()}
            title="Ticked ones are applied in one rewrite; the rest are dismissed, and each dismissal leaves a conflict on this document"
          >
            Apply {live.filter(({ it }) => ticked.has(keyOf(it))).length} · dismiss{' '}
            {live.filter(({ it }) => !ticked.has(keyOf(it))).length}
          </button>
          {extra}
        </div>
      )}
    </div>
  );
}

/**
 * What a dismissed demand left behind. The demand said this document
 * contradicts another; dismissing it settled the asking, not the contradiction.
 * It stays here because the next agent to rewrite this document reads here.
 */
function ConflictBar({
  project,
  doc,
  onDone,
}: {
  project: Project;
  doc: DocInfo;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [saying, setSaying] = useState<string | null>(null);
  const [said, setSaid] = useState('');

  const clear = (from: string, reason: string) => {
    setBusy(true);
    api
      .clearConflict(project.id, { rel: doc.rel, from, reason, said })
      .then(() => {
        setCleared((c) => new Set(c).add(`${from}: ${reason}`));
        setSaying(null);
        setSaid('');
        onDone();
      })
      .finally(() => setBusy(false));
  };

  const open = doc.conflicts.filter((c) => !cleared.has(`${c.from}: ${c.reason}`));
  if (open.length === 0) return null;
  return (
    <div className="kx-doc-conflictbar">
      <div className="kx-changebar-head">
        This document was asked to change and the ask was dismissed. What it was asked about still
        disagrees with the document that asked.
      </div>
      <ul className="kx-changebar-list">
        {open.map((c) => {
          const key = `${c.from}: ${c.reason}`;
          return (
            <li key={key}>
              <span className="mono">{c.from.replace(/\.md$/, '')}</span> — {c.reason}
              <div className="kx-changebar-actions">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => (saying === key ? clear(c.from, c.reason) : setSaying(key))}
                >
                  {saying === key ? 'Clear it' : 'Settle'}
                </button>
                {saying === key && (
                  <button className="btn btn-link-primary" onClick={() => setSaying(null)}>
                    Cancel
                  </button>
                )}
              </div>
              {saying === key && (
                <div className="kx-thread-input">
                  <textarea
                    className="kx-input kx-thread-text"
                    rows={2}
                    autoFocus
                    placeholder="Why is this settled? (optional — it is written into the document)"
                    value={said}
                    onChange={(e) => setSaid(e.target.value)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A finding about something no document owns. It cannot be applied — no agent
 * writes `.gitignore` — so prime marks it done or lets it go, and either way the
 * document records which.
 */
function WarningBar({
  project,
  doc,
  onDone,
}: {
  project: Project;
  doc: DocInfo;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState<Set<string>>(new Set());

  const decide = (subject: string, reason: string, decision: 'done' | 'dismiss') => {
    setBusy(true);
    api
      .clearWarning(project.id, { rel: doc.rel, subject, reason, decision })
      .then(() => {
        setSettled((s) => new Set(s).add(`${subject}: ${reason}`));
        onDone();
      })
      .finally(() => setBusy(false));
  };

  const open = doc.warnings.filter((w) => !settled.has(`${w.subject}: ${w.reason}`));
  if (open.length === 0) return null;
  return (
    <div className="kx-doc-warnbar">
      <div className="kx-changebar-head">
        This document found something outside the document set. Nothing here can be written for you
        — do it yourself, then say so.
      </div>
      <ul className="kx-changebar-list">
        {open.map((w) => (
          <li key={`${w.subject}: ${w.reason}`}>
            <span className="mono">{w.subject}</span> — {w.reason}
            <div className="kx-changebar-actions">
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => decide(w.subject, w.reason, 'done')}
              >
                Done
              </button>
              <button
                className="btn btn-link-primary"
                disabled={busy}
                onClick={() => decide(w.subject, w.reason, 'dismiss')}
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The text this block replaced, folded away. A sibling of the block rather than
 * a child: the block's wrapper is itself a click target, and a button nested in
 * it would open the line's thread on the way past.
 */
function RemovedToggle({ tokens }: { tokens: MdToken[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="kx-removed">
      <button
        className="kx-removed-toggle mono"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        title={open ? 'Hide what this replaced' : 'Show what this replaced'}
      >
        [{open ? '−' : '+'}]
      </button>
      {open && (
        <div className="kx-removed-body">
          {tokens.map((t, i) => (
            <div key={i}>{t.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

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

// Inline alert icons inherit the alert color.
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
  noteLabel,
  changed,
  onSelect,
}: {
  token: MdToken;
  selected: boolean;
  noted: boolean;
  openQuestion?: boolean;
  changeRequest?: boolean;
  questionNo?: number;
  noteLabel?: string;
  changed?: boolean;
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
  const cls = `kx-block kx-${token.kind}${selected ? ' selected' : ''}${noted ? ' noted' : ''}${openQuestion ? ' open-q' : ''}${changeRequest ? ' req-q' : ''}${questionNo || noteLabel ? ' kx-numbered' : ''}${changed ? ' kx-changed' : ''}`;
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
  // Render checklist markers as read-only checkbox states.
  const task = token.kind === 'bullet' ? token.text.match(/^\[([ xX])\]\s*(.*)$/s) : null;
  return (
    <div
      className={`${cls}${task ? ' kx-task' : ''}`}
      style={token.depth ? { marginLeft: token.depth * 18 } : undefined}
      {...activation}
    >
      {questionNo ? (
        <span className="kx-qno mono">#{questionNo}</span>
      ) : noteLabel ? (
        <span className="kx-qno mono">{noteLabel}</span>
      ) : null}
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

// Lazy-load Mermaid for diagrams; fall back to source code when rendering fails.
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
        // Treat agent-written diagram text as untrusted. Require strict sanitization
        // before inserting the generated SVG into the DOM.
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

// Use line-based LCS to mark changes in the complete proposed document.
/** Longest common subsequence over anything with a comparable key. */
function lcsDiff<T>(x: T[], y: T[], key: (t: T) => string): { sign: ' ' | '-' | '+'; item: T }[] {
  const kx = x.map(key);
  const ky = y.map(key);
  const n = x.length;
  const m = y.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        kx[i] === ky[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: { sign: ' ' | '-' | '+'; item: T }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (kx[i] === ky[j]) {
      out.push({ sign: ' ', item: x[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ sign: '-', item: x[i]! });
      i++;
    } else {
      out.push({ sign: '+', item: y[j]! });
      j++;
    }
  }
  while (i < n) out.push({ sign: '-', item: x[i++]! });
  while (j < m) out.push({ sign: '+', item: y[j++]! });
  return out;
}

function lineDiff(a: string, b: string): { sign: ' ' | '-' | '+'; text: string }[] {
  return lcsDiff(a.split('\n'), b.split('\n'), (t) => t).map((d) => ({
    sign: d.sign,
    text: d.item,
  }));
}

// Show the full proposal with diff markers; switch to a textarea for manual edits.
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

// Parse inline Markdown in answers; pre-wrap preserves their line breaks.
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

// Show inline Q&A and revision notes below the selected block.
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
  // Scroll newly opened threads into view, including those near the drawer bottom.
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
    // Merge indented continuation lines into the preceding list item.
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
      // A new list marker starts a separate item rather than continuing the previous one.
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
