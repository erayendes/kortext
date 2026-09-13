import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from './Drawer';
import { highlight } from './highlight';
import { parseInline, parseMarkdown, type AlertKind, type MdToken } from './markdown';
import { api, type DocInfo, type DocVersion, type Project } from './api';

// The two headings the drawer looks for, each accepting the name it used to
// carry: documents written before the rename are still on disk.
const QUESTIONS = /^(open )?questions( for prime)?$/i;
const CHANGE_REQUESTS = /^(change|revision) requests$/i;
const DECISIONS = /^decisions$/i;
const FINDINGS = /^(findings|warnings)$/i;

interface Note {
  line: number | null;
  excerpt: string;
  text: string;
}

/** What became of a change request, read from its box and the line under it. */
interface Outcome {
  /** `outgoing` is what this document asks of another; the rest are what others asked of it. */
  state: 'outgoing' | 'waiting' | 'accepted' | 'denied';
  /** The outcome line as written — who did it, when, and why. */
  said: string;
}

interface Decision {
  /** An incoming request is accepted or denied; an outgoing one is sent or discarded. */
  kind: 'incoming' | 'outgoing';
  /** The other document — who asked, or who is asked. */
  other: string;
  reason: string;
  what: 'accept' | 'deny';
  note: string;
}

const keyOf = (r: { from: string; reason: string }) => `in:${r.from}: ${r.reason}`;
const keyOut = (r: { target: string; reason: string }) => `out:${r.target}: ${r.reason}`;

/** SQLite's UTC `YYYY-MM-DD HH:MM:SS`, shown as a local `dd.MM.yyyy HH:mm:ss`. */
function stamp(createdAt: string): string {
  const d = new Date(createdAt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return createdAt;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/**
 * What the footer collected, kept in the browser so closing the drawer does not
 * throw it away. Tied to the document's version: notes point at line indices,
 * and a rewrite moves every line, so a draft saved against older text is
 * dropped rather than landing on the wrong lines.
 */
const draftKey = (projectId: number, rel: string) => `kx-actions:${projectId}:${rel}`;
function loadDraft(
  projectId: number,
  rel: string,
  version: string,
): { notes: Note[]; decided: Record<string, Decision> } | null {
  try {
    const raw = localStorage.getItem(draftKey(projectId, rel));
    if (!raw) return null;
    const saved = JSON.parse(raw) as {
      version: string;
      notes: Note[];
      decided: Record<string, Decision>;
    };
    return saved.version === version ? { notes: saved.notes, decided: saved.decided } : null;
  } catch {
    return null;
  }
}
function saveDraft(
  projectId: number,
  rel: string,
  version: string,
  notes: Note[],
  decided: Record<string, Decision>,
): void {
  try {
    if (notes.length === 0 && Object.keys(decided).length === 0) {
      localStorage.removeItem(draftKey(projectId, rel));
    } else {
      localStorage.setItem(draftKey(projectId, rel), JSON.stringify({ version, notes, decided }));
    }
  } catch {
    /* storage may be unavailable; the drawer still works for the session */
  }
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
  docs,
  failedError,
  onRetry,
  onClose,
  onChanged,
}: {
  project: Project;
  doc: DocInfo | null;
  /** The whole shelf — the readers of this document are found in it. */
  docs: DocInfo[];
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
  // Decisions on the change requests, keyed by `from: reason`, with the note
  // that rides along. They live beside the notes because they are sent with
  // them, in the one rewrite the footer button starts.
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const [explains, setExplains] = useState<Explain[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false); // DESIGN.md drawn, not read
  const [proposed, setProposed] = useState(false); // the editor holds a draft the engine wrote
  const [rawEdit, setRawEdit] = useState(false); // …and you asked to type in it rather than read it
  const [err, setErr] = useState<string | null>(null);
  // What the document said before it was last written, when the chain is intact.
  const [previous, setPrevious] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  /** Which recorded version the body is compared against; null = no diff. */
  const [against, setAgainst] = useState<number | null>(null);

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
    setDecided({});
    setExplains([]);
    setErr(null);
    // Clear prior content before loading so stale text cannot be saved into the new document.
    setContent('');
    setVersion('');
    setDraft('');
    setPrevious(null);
    setVersions([]);
    setAgainst(null);
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
          const kept = loadDraft(project.id, doc.rel, r.version);
          if (kept) {
            setNotes(kept.notes);
            setDecided(kept.decided);
          }
          void api
            .docHistory(project.id, doc.rel)
            .then((h) => {
              if (cancelled) return;
              setVersions(h.versions);
              const head = h.versions[0];
              if (!head) return;
              // The file on disk is the recorded head: walk back to the last
              // version whose BODY differs. Approving records a version that
              // changes only `status:`, and diffing against that one would say
              // nothing changed when a whole rewrite did.
              //
              // The file has moved past the head — kortext ticked a request or
              // appended a recheck's line without recording — then the head is
              // the last known text, and what moved since is exactly the diff.
              setAgainst(
                head.sha === r.version
                  ? (h.versions.slice(1).find((v) => v.bodySha !== head.bodySha)?.id ?? null)
                  : head.id,
              );
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

  // Keep what the footer collected, so closing the drawer does not lose it.
  useEffect(() => {
    if (doc && version) saveDraft(project.id, doc.rel, version, notes, decided);
  }, [notes, decided, doc, version, project.id]);

  // The chosen baseline, fetched on its own so the picker costs one request
  // rather than a reload of the document.
  useEffect(() => {
    if (against === null) {
      setPrevious(null);
      return;
    }
    let cancelled = false;
    api
      .docVersionText(project.id, against)
      .then((t) => {
        if (!cancelled) setPrevious(t.content);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [against, project.id]);

  // Engine-written files hard-wrap prose at ~80 chars; the tokenizer is
  // line-oriented, so consecutive para/quote lines are merged back into one
  // flowing block (the thread anchors at paragraph granularity).
  const tokens = useMemo(() => {
    const all = mergeWrappedLines(parseMarkdown(stripFrontmatter(content)));
    // Hide empty question sections.
    const dropEmpty = (tokens: typeof all, heading: RegExp) => {
      const start = tokens.findIndex(
        (t) =>
          (t.kind === 'h1' || t.kind === 'h2' || t.kind === 'h3') && heading.test(t.text.trim()),
      );
      if (start === -1) return tokens;
      const after = tokens.slice(start + 1);
      const end = after.findIndex((t) => t.kind === 'h1' || t.kind === 'h2' || t.kind === 'h3');
      const body = end === -1 ? after : after.slice(0, end);
      const used = body.some((t) => t.kind !== 'blank' && !/^\[.*\]$/.test(t.text.trim()));
      return used ? tokens : [...tokens.slice(0, start), ...(end === -1 ? [] : after.slice(end))];
    };
    return dropEmpty(dropEmpty(all, QUESTIONS), CHANGE_REQUESTS);
  }, [content]);

  // The answer names its own author. Asking the global engine setting instead
  // signed codex's answers as claude whenever the project ran on the other one.
  // The project's own engine is the right guess while the answer is still coming.
  const [answerBy, setAnswerBy] = useState(project.engine ?? 'agent');

  // Distinguish questions for this document from change requests sent to another document.
  const [openQ, changeReq, outcomes, trailers, ledger, records] = useMemo(() => {
    const asks = new Set<number>();
    const demands = new Set<number>();
    // The ledger: a decision is one thing — the request, and the reason under
    // it — so the reason line is folded into the request's block rather than
    // shown, or selected, on its own.
    const ledger = new Map<number, string>();
    // Decisions and Findings are records kortext and prime append; that they
    // grew is known, and painting them as changes only distracts from the text.
    const records = new Set<number>();
    // A change request in the body is read as a status, not a checkbox: the
    // box looked like something to do, and the outcome line under it said in a
    // sentence what one word says. The word replaces both; the sentence stays
    // in the file and in the tooltip.
    const outcomes = new Map<number, Outcome>();
    const trailers = new Set<number>();
    let section: 'ask' | 'demand' | 'decision' | 'finding' | null = null;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind === 'h1' || t.kind === 'h2' || t.kind === 'h3') {
        section = QUESTIONS.test(t.text.trim())
          ? 'ask'
          : CHANGE_REQUESTS.test(t.text.trim())
            ? 'demand'
            : DECISIONS.test(t.text.trim())
              ? 'decision'
              : FINDINGS.test(t.text.trim())
                ? 'finding'
                : null;
      }
      if (section === 'ask') asks.add(t.index);
      if (section === 'decision' || section === 'finding') records.add(t.index);
      if (section === 'decision' && t.kind === 'bullet' && (t.depth ?? 0) === 0) {
        const next = tokens[i + 1];
        const why = next && next.kind === 'bullet' && (next.depth ?? 0) > 0 ? next : null;
        ledger.set(t.index, why?.text.trim() ?? '');
        if (why) trailers.add(why.index);
      }
      if (section !== 'demand' || t.kind !== 'bullet') continue;
      // One heading, two directions. A line `from` another document is what it
      // asked of this one — waiting, accepted or denied here. A bare line is
      // what this document asks of another; it goes there on approval. With a
      // box or without: an older agent wrote the line bare, all the same.
      const task = t.text.match(/^(?:\[([ xX])\]\s*)?(from\s+)?`([A-Za-z][\w./-]*\.md)`/);
      if (!task) continue;
      const box = task[1] ?? ' ';
      const incoming = !!task[2];
      // Highlight only open requests; keep settled requests visible as history.
      if (box === ' ') demands.add(t.index);
      const next = tokens[i + 1];
      const trailer =
        next && next.kind === 'bullet' && (next.depth ?? 0) > (t.depth ?? 0) ? next : null;
      if (trailer) trailers.add(trailer.index);
      const said = trailer?.text.trim() ?? '';
      const state =
        box === ' '
          ? incoming
            ? 'waiting'
            : 'outgoing'
          : /^(denied|dismissed)/i.test(said)
            ? 'denied'
            : 'accepted';
      outcomes.set(t.index, {
        state,
        said: state === 'outgoing' ? `Goes to ${task[3]} when you approve this document` : said,
      });
    }
    return [asks, demands, outcomes, trailers, ledger, records] as const;
  }, [tokens]);

  // The questions themselves, in the order the body numbers them. The panel
  // lists them; the body still shows them where they were written. Only a draft
  // asks them — the server files an approved document as settled, and a list
  // asking for answers there would contradict the shelf it sits on.
  const questions = useMemo(
    () =>
      (doc?.status === 'draft' ? tokens : [])
        .filter((t) => t.kind === 'bullet' && openQ.has(t.index) && t.text.trim())
        .map((t, i) => ({
          index: t.index,
          no: i + 1,
          text: t.text.trim().replace(/^[-*+]\s*/, ''),
        })),
    [tokens, openQ, doc?.status],
  );

  // What the body shows. Whatever the Action Needed list above already asks —
  // a draft's questions, and every waiting request — is not repeated
  // underneath. The tokens keep their indices; only the view narrows.
  const shown = useMemo(() => {
    const kept = tokens.filter(
      (t) =>
        !trailers.has(t.index) &&
        !(doc?.status === 'draft' && openQ.has(t.index)) &&
        !(
          doc?.status !== 'uninitialized' &&
          ['waiting', 'outgoing'].includes(outcomes.get(t.index)?.state ?? '')
        ),
    );
    // A heading left with nothing under it — every request asked above — goes too.
    const isHead = (t: MdToken) => t.kind === 'h1' || t.kind === 'h2' || t.kind === 'h3';
    return kept.filter((t, i) => {
      if (!isHead(t) || !CHANGE_REQUESTS.test(t.text.trim())) return true;
      const next = kept.slice(i + 1).find((u) => u.kind !== 'blank');
      return !!next && !isHead(next);
    });
  }, [tokens, openQ, trailers, outcomes, doc?.status]);

  // Anything owed on this document goes into one list under one button.
  const actionNeeded =
    doc !== null &&
    doc.status !== 'uninitialized' &&
    (doc.revisionRequests.length > 0 || doc.outgoing.length > 0 || questions.length > 0);

  // Use question numbers in note labels instead of truncated excerpts.
  const qNo = useMemo(() => new Map(questions.map((q) => [q.index, q.no])), [questions]);

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
    // A hunk is a run of removed and added blocks with nothing kept between
    // them. Inside it the i-th removed block is read as what the i-th added
    // block replaced — a rewritten paragraph pairs with its own old text, not
    // with the first new block in sight. Leftover old blocks go to the last new
    // one; a hunk with nothing added hands its old blocks to the next kept block.
    let removed: MdToken[] = [];
    let added: MdToken[] = [];
    const settle = (fallback?: MdToken) => {
      if (added.length > 0) {
        added.forEach((a, i) => {
          const old = i < added.length - 1 ? removed.slice(i, i + 1) : removed.slice(i);
          if (old.length > 0) gone.set(a.index, old);
        });
      } else if (removed.length > 0 && fallback) {
        gone.set(fallback.index, removed);
      }
      removed = [];
      added = [];
    };
    for (const d of lcsDiff(before, after, (t) => `${t.kind}\u0000${t.text}`)) {
      if (d.item.kind === 'blank') continue;
      if (d.sign === '-') {
        removed.push(d.item);
        continue;
      }
      if (d.sign === '+') {
        marks.add(d.item.index);
        added.push(d.item);
        continue;
      }
      settle(d.item);
    }
    settle();
    return [marks, gone] as [Set<number>, Map<number, MdToken[]>];
  }, [previous, content]);

  // A run of new blocks is one addition, and says so once: the mark sits on the
  // first block of the run. A block that replaced something keeps its own mark,
  // because it is the only place the old text can be opened from.
  const leads = useMemo(() => {
    const out = new Set<number>();
    let inRun = false;
    shown.forEach((t, i) => {
      if (t.kind === 'blank') return;
      const isNew = changed.has(t.index) && !replaced.has(t.index);
      if (replaced.has(t.index) || (isNew && !inRun)) out.add(i);
      inRun = isNew;
    });
    return out;
  }, [shown, changed, replaced]);

  // A note marks its line, and the mark is what the footer row shows: a question
  // keeps the number it already carries, any other line takes the next letter.
  // A question keeps the number the list gave it; a noted line is numbered in
  // the order it was first noted. The tray says which is which.
  const lineLabel = useMemo(() => {
    const m = new Map<number, string>();
    let n = 0;
    for (const note of notes) {
      if (note.line === null || m.has(note.line)) continue;
      const q = qNo.get(note.line);
      m.set(note.line, `#${q ?? ++n}`);
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

  // Everything the footer collected goes in one press: the answers and notes,
  // the accepted requests and the denied ones. One press, because they all
  // rewrite this document and a document is rewritten once.
  const decisions = Object.values(decided);
  const accepting = decisions.filter((d) => d.kind === 'incoming' && d.what === 'accept');
  const denying = decisions.filter((d) => d.kind === 'incoming' && d.what === 'deny');
  const sending = decisions.filter((d) => d.kind === 'outgoing' && d.what === 'accept');
  const discarding = decisions.filter((d) => d.kind === 'outgoing' && d.what === 'deny');
  const written = doc?.hasProducingStep ?? false;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // An answer to a listed question and a note on a line are counted apart —
  // they read differently, and prime should see which is which before pressing.
  const answered = notes.filter((n) => n.line !== null && qNo.has(n.line)).length;
  const remarks = notes.length - answered;
  const summary = [
    answered > 0 && written ? plural(answered, 'question answered', 'questions answered') : null,
    remarks > 0 && written ? plural(remarks, 'note added', 'notes added') : null,
    accepting.length > 0 && written
      ? plural(accepting.length, 'request accepted', 'requests accepted')
      : null,
    denying.length > 0 ? plural(denying.length, 'request denied', 'requests denied') : null,
    sending.length > 0 ? plural(sending.length, 'request sent', 'requests sent') : null,
    discarding.length > 0
      ? plural(discarding.length, 'request discarded', 'requests discarded')
      : null,
  ].filter(Boolean);
  const applyAll = () =>
    act(async () => {
      await api.settleRequests(project.id, {
        rel: doc.rel,
        apply: written
          ? accepting.map(({ other, reason, note }) => ({ from: other, reason, note }))
          : [],
        deny: denying.map(({ other, reason, note }) => ({ from: other, reason, note })),
        answers: written ? notes.map((n) => (n.excerpt ? `[${n.excerpt}] ${n.text}` : n.text)) : [],
        send: sending.map(({ other, reason }) => ({ target: other, reason })),
        discard: discarding.map(({ other, reason }) => ({ target: other, reason })),
      });
      setNotes([]);
      setDecided({});
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

  // Instant, not smooth: the drawer is a transformed ancestor, and Chrome's
  // smooth path silently does nothing inside one.
  const goTo = (id: string) => {
    setSelected(null);
    document.getElementById(id)?.scrollIntoView({ block: 'center' });
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
            {/* Which earlier version the body is read against. A date is all it
                needs to say; choosing one paints the diff, there is no second
                step. */}
            {against !== null && (
              <select
                className="kx-diff-pick mono"
                value={against}
                aria-label="Show what changed since"
                title="Show what changed since this version"
                onChange={(e) => setAgainst(Number(e.target.value))}
              >
                {versions
                  .filter((v) => v.sha !== version)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {stamp(v.created_at)}
                    </option>
                  ))}
              </select>
            )}
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
              disabled={busy || doc.openQuestions || doc.outgoing.length > 0}
              title={
                doc.openQuestions
                  ? 'Answer the open questions in this document first'
                  : doc.outgoing.length > 0
                    ? 'Send or discard the outgoing requests first'
                    : ''
              }
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
        {!editing && <RelatedDocuments doc={doc} docs={docs} />}
        {doc.dependentOn.length > 0 && !editing && (
          <div className="kx-doc-dependbar">
            <span className="mono">
              {doc.dependentOn.map((d) => d.replace(/\.md$/, '')).join(', ')}
            </span>{' '}
            — an input of this document is moving. Nothing is wrong yet; when it settles, this one
            is read against it again and you are told if it has to change.
          </div>
        )}
        {actionNeeded && !editing && (
          <ActionNeeded
            project={project}
            doc={doc}
            questions={questions}
            explains={explains}
            answerBy={answerBy}
            onAsk={ask}
            // A question has one answer. A second Add note replaces the first
            // rather than sending the agent two answers to reconcile.
            onNote={(line, text) => {
              setNotes((ns) => ns.filter((n) => n.line !== line));
              addLineNote(line, text);
            }}
            answered={new Set(notes.map((n) => n.line).filter((l): l is number => l !== null))}
            decided={decided}
            onDecide={(r, what, note) =>
              setDecided((d) => ({
                ...d,
                [keyOf(r)]: { kind: 'incoming', other: r.from, reason: r.reason, what, note },
              }))
            }
            onDecideOut={(r, what, note) =>
              setDecided((d) => ({
                ...d,
                [keyOut(r)]: { kind: 'outgoing', other: r.target, reason: r.reason, what, note },
              }))
            }
          />
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
            {shown.map((t, i) => (
              <div key={t.index} id={`kx-line-${t.index}`}>
                <DocBlock
                  token={t}
                  changed={changed.has(t.index) && !records.has(t.index) && leads.has(i)}
                  openQuestion={openQ.has(t.index)}
                  questionNo={qNo.get(t.index)}
                  noteLabel={lineLabel.get(t.index)}
                  changeRequest={changeReq.has(t.index)}
                  outcome={outcomes.get(t.index)}
                  decision={ledger.get(t.index)}
                  replaced={records.has(t.index) ? undefined : replaced.get(t.index)}
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
      {/* The footer collects what the drawer decided — notes on lines, answers to
          questions, decisions on change requests — and sends it in one press. */}
      {!editing && !preview && doc.status !== 'uninitialized' && (
        <div className="dr-foot">
          {notes.length > 0 || decisions.length > 0 ? (
            <div className="kx-notes">
              <div className="kx-notes-title">Actions</div>
              {/* Each row names what it is and where it came from, and clicking
                  it goes there — the question or request in the list above, or
                  the line in the document. */}
              {notes.map((n, i) => {
                const isQuestion = n.line !== null && qNo.has(n.line);
                const target =
                  n.line === null ? null : isQuestion ? `kx-q-${n.line}` : `kx-line-${n.line}`;
                return (
                  <div
                    key={i}
                    className="kx-note"
                    role={target ? 'button' : undefined}
                    tabIndex={target ? 0 : undefined}
                    onClick={() => target && goTo(target)}
                    onKeyDown={(e) => {
                      if (target && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        goTo(target);
                      }
                    }}
                  >
                    <span className="kx-note-exc mono">
                      {isQuestion ? 'question' : 'note'}{' '}
                      {n.line !== null ? lineLabel.get(n.line) : n.excerpt}
                    </span>
                    <span className="kx-note-body">{n.text}</span>
                    <button
                      className="btn btn-x"
                      title="Take it back"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotes(notes.filter((_, j) => j !== i));
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {doc.outgoing.map((r, i) => {
                const d = decided[keyOut(r)];
                if (!d) return null;
                const target = `kx-out-${i}`;
                return (
                  <div
                    key={target}
                    className="kx-note"
                    role="button"
                    tabIndex={0}
                    onClick={() => goTo(target)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goTo(target);
                      }
                    }}
                  >
                    <span className="kx-note-exc mono">outgoing #{i + 1}</span>
                    <span className="kx-note-body">
                      to <span className="mono">{r.target.replace(/\.md$/, '')}</span>{' '}
                      <span className={`kx-decision kx-decision-${d.what}`}>
                        {d.what === 'accept' ? 'sent' : 'discarded'}
                      </span>
                    </span>
                    <button
                      className="btn btn-x"
                      title="Take the decision back"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDecided((all) => {
                          const next = { ...all };
                          delete next[keyOut(r)];
                          return next;
                        });
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {doc.revisionRequests.map((r, i) => {
                const d = decided[keyOf(r)];
                if (!d) return null;
                const target = `kx-req-${i}`;
                return (
                  <div
                    key={target}
                    className="kx-note"
                    role="button"
                    tabIndex={0}
                    onClick={() => goTo(target)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goTo(target);
                      }
                    }}
                  >
                    <span className="kx-note-exc mono">request #{i + 1}</span>
                    <span className="kx-note-body">
                      <span className="mono">{r.from.replace(/\.md$/, '')}</span>{' '}
                      <span className={`kx-decision kx-decision-${d.what}`}>
                        {d.what === 'accept' ? 'accepted' : 'denied'}
                      </span>
                      {d.note && ` — ${d.note}`}
                    </span>
                    <button
                      className="btn btn-x"
                      title="Take the decision back"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDecided((all) => {
                          const next = { ...all };
                          delete next[keyOf(r)];
                          return next;
                        });
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <span className="kx-cmd-hint">
              {actionNeeded
                ? 'Pick a row above, or click a line of the document — what you decide collects here.'
                : 'Click a line: chat with its author right below (Ask) or collect a revision note (Add note).'}
            </span>
          )}
          <div className="kx-note-input">
            {actionNeeded ? (
              <>
                <span className="kx-changebar-summary">
                  {summary.length > 0 ? `${summary.join(' — ')}.` : 'Nothing selected yet.'}
                </span>
                {!written && (
                  <button className="btn btn-secondary" disabled={busy} onClick={proposeFix}>
                    {busy ? 'Drafting…' : 'Draft the change'}
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  disabled={busy || summary.length === 0}
                  onClick={applyAll}
                  title={
                    written
                      ? 'One rewrite carries the answers and the accepted changes together'
                      : 'Denials are recorded as conflicts; nothing is rewritten'
                  }
                >
                  Apply
                </button>
              </>
            ) : !written ? (
              <span className="kx-cmd-hint">
                No agent writes this document — use Edit to change it yourself.
              </span>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy || notes.length === 0}
                onClick={requestRevision}
              >
                Request revision{notes.length > 0 ? ` (${notes.length})` : ''}
              </button>
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
  approve: 'Nothing open — approve it',
  review: 'Action Needed items stand on this document',
  queue: 'Not written yet',
  recheck: 'Waiting to be read again against an input that moved',
  draft: 'The first draft',
  revision: 'A rewrite of what already stands',
};

/** What is owed on this document, next to the state it is in. A moving input is
    not a debt, so it is not a badge: `recheck` says it in its tooltip, and the
    drawer's band names the input. */
export function DocBadges({ doc }: { doc: DocInfo }) {
  return (
    <>
      {doc.detail && (
        <span
          className={`kx-badge kx-badge-${doc.detail}`}
          title={
            doc.detail === 'review'
              ? [
                  ...(doc.openQuestions ? ['questions are waiting for you'] : []),
                  ...doc.revisionRequests.map((r) => `${r.from}: ${r.reason}`),
                ].join('\n')
              : doc.detail === 'recheck' && doc.dependentOn.length > 0
                ? `Waiting on ${doc.dependentOn.join(', ')} to settle, then read again`
                : (DETAIL_TITLE[doc.detail] ?? '')
          }
        >
          {doc.detail}
        </span>
      )}
    </>
  );
}

/**
 * Who reads this document — the inverse of the workflow's `inputs` relation, so
 * no new data. It is the answer to "what happens if I change this": when this
 * one settles, every document here is read against it again. A reader nobody
 * has written yet is greyed; it will read this when its turn comes.
 */
function RelatedDocuments({ doc, docs }: { doc: DocInfo; docs: DocInfo[] }) {
  const readers = docs.filter((d) => d.inputs.includes(doc.rel));
  if (readers.length === 0) return null;
  return (
    <div className="kx-doc-readbar">
      <span className="kx-readbar-head">Related documents</span>
      <span>
        {readers.map((r, i) => (
          <Fragment key={r.rel}>
            {i > 0 && ', '}
            <span
              className={r.status === 'uninitialized' ? 'kx-reader-unwritten mono' : 'mono'}
              title={r.status === 'uninitialized' ? 'not written yet' : `${r.name} reads this one`}
            >
              {r.name}
            </span>
          </Fragment>
        ))}{' '}
        — {readers.length > 1 ? 'these read' : 'this reads'} this document. When it changes,{' '}
        {readers.length > 1 ? 'they are' : 'it is'} read against it again.
      </span>
    </div>
  );
}

/**
 * Everything owed on this document, in one list.
 *
 * Two groups, because they read differently — questions the agent left for
 * prime, and change requests arriving from other documents. The list only
 * selects: click a row and its moves open under it, Ask · Add note for a
 * question, Ask · Accept · Deny for a request. What prime decides collects in
 * the footer, beside the notes on lines, and goes out in one press from there.
 * One press, because both groups rewrite THIS document and a document is
 * rewritten once.
 */
function ActionNeeded({
  project,
  doc,
  questions,
  explains,
  answerBy,
  onAsk,
  onNote,
  onDecide,
  onDecideOut,
  answered,
  decided,
}: {
  project: Project;
  doc: DocInfo;
  /** The bullets under the questions heading, numbered as the body numbers them. */
  questions: Array<{ index: number; no: number; text: string }>;
  explains: Explain[];
  answerBy: string;
  onAsk: (line: number, question: string) => void;
  onNote: (line: number, text: string) => void;
  onDecide: (r: { from: string; reason: string }, what: 'accept' | 'deny', note: string) => void;
  /** Send or discard what this document asks of another. */
  onDecideOut: (
    r: { target: string; reason: string },
    what: 'accept' | 'deny',
    note: string,
  ) => void;
  /** Lines that already carry an answer — their box is ticked. */
  answered: Set<number>;
  /** Requests already decided — their box is ticked. */
  decided: Record<string, Decision>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [chat, setChat] = useState<Array<{ key: string; q: string; a: string | null }>>([]);

  // Ask the document that made the request, in its own voice.
  const askFrom = (r: { from: string; reason: string }, q: string) => {
    const key = keyOf(r);
    const history = chat.filter((c) => c.key === key && c.a).map((c) => ({ q: c.q, a: c.a! }));
    const entry = { key, q, a: null as string | null };
    setChat((cs) => [...cs, entry]);
    const fill = (a: string) => setChat((cs) => cs.map((c) => (c === entry ? { ...c, a } : c)));
    api
      .explainDoc(project.id, r.from, `[asks ${doc.rel}] ${r.reason}`, q, history)
      .then((res) => fill(res.answer))
      .catch((e) => fill(`— ${(e as Error).message}`));
  };

  // Ask this document's own author why it asks another to change.
  const askOwn = (r: { target: string; reason: string }, q: string) => {
    const key = keyOut(r);
    const history = chat.filter((c) => c.key === key && c.a).map((c) => ({ q: c.q, a: c.a! }));
    const entry = { key, q, a: null as string | null };
    setChat((cs) => [...cs, entry]);
    const fill = (a: string) => setChat((cs) => cs.map((c) => (c === entry ? { ...c, a } : c)));
    api
      .explainDoc(project.id, doc.rel, `[asks ${r.target}] ${r.reason}`, q, history)
      .then((res) => fill(res.answer))
      .catch((e) => fill(`— ${(e as Error).message}`));
  };

  // A row is selected by clicking it, and the input opens underneath.
  const select = (key: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    'aria-pressed': open === key,
    onClick: () => {
      if ((window.getSelection()?.toString() ?? '').trim()) return;
      setOpen(open === key ? null : key);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(open === key ? null : key);
      }
    },
  });

  const requests = doc.revisionRequests;
  const outgoing = doc.outgoing;
  if (requests.length === 0 && outgoing.length === 0 && questions.length === 0) return null;
  return (
    <div className="kx-doc-changebar">
      <div className="kx-changebar-title">Action Needed</div>
      <div className="kx-changebar-head">
        Pick a row. What you answer or decide collects at the bottom, and goes into one rewrite when
        you press Apply.
      </div>

      {questions.length > 0 && (
        <>
          <div className="kx-changebar-group">Questions</div>
          <ul className="kx-changebar-list">
            {questions.map((q) => {
              const thread = explains.filter((x) => x.line === q.index);
              const key = `q${q.index}`;
              return (
                <li key={key} id={`kx-q-${q.index}`} className={open === key ? 'kx-req-open' : ''}>
                  <input
                    type="checkbox"
                    className="kx-req-check"
                    checked={answered.has(q.index)}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={() => setOpen(open === key ? null : key)}
                  />
                  <span className="kx-req-text" {...select(key)}>
                    <span className="mono">#{q.no}</span> — {q.text}
                  </span>
                  {(thread.length > 0 || open === key) && (
                    <LineThread
                      thread={thread}
                      active={open === key}
                      answerBy={answerBy}
                      onAsk={(text) => onAsk(q.index, text)}
                      onNote={(text) => {
                        onNote(q.index, text);
                        setOpen(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {requests.length > 0 && (
        <>
          <div className="kx-changebar-group">Incoming Requests</div>
          <ul className="kx-changebar-list">
            {requests.map((r, i) => {
              const key = keyOf(r);
              const talk = chat.filter((c) => c.key === key);
              return (
                <li key={key} id={`kx-req-${i}`} className={open === key ? 'kx-req-open' : ''}>
                  <input
                    type="checkbox"
                    className="kx-req-check"
                    checked={key in decided}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={() => setOpen(open === key ? null : key)}
                  />
                  <span className="kx-req-text" {...select(key)}>
                    <span className="mono">{r.from.replace(/\.md$/, '')}</span> — {r.reason}
                  </span>
                  {(talk.length > 0 || open === key) && (
                    <LineThread
                      thread={talk.map((c) => ({ line: null, question: c.q, answer: c.a }))}
                      active={open === key}
                      answerBy={r.from.replace(/\.md$/, '')}
                      onAsk={(q) => askFrom(r, q)}
                      onNote={() => {}}
                      onDecide={(what, note) => {
                        onDecide(r, what, note);
                        setOpen(null);
                      }}
                      cannotAccept={
                        doc.hasProducingStep
                          ? undefined
                          : 'No agent writes this document — press Draft the change below'
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <div className="kx-changebar-group">Outgoing Requests</div>
          <ul className="kx-changebar-list">
            {outgoing.map((r, i) => {
              const key = keyOut(r);
              const talk = chat.filter((c) => c.key === key);
              return (
                <li key={key} id={`kx-out-${i}`} className={open === key ? 'kx-req-open' : ''}>
                  <input
                    type="checkbox"
                    className="kx-req-check"
                    checked={key in decided}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={() => setOpen(open === key ? null : key)}
                  />
                  <span className="kx-req-text" {...select(key)}>
                    <span className="mono">to {r.target.replace(/\.md$/, '')}</span> — {r.reason}
                  </span>
                  {(talk.length > 0 || open === key) && (
                    <LineThread
                      thread={talk.map((c) => ({ line: null, question: c.q, answer: c.a }))}
                      active={open === key}
                      answerBy={doc.name}
                      onAsk={(q) => askOwn(r, q)}
                      onNote={() => {}}
                      onDecide={(what, note) => {
                        onDecideOut(r, what, note);
                        setOpen(null);
                      }}
                      verbs={['Send', 'Discard']}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
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
  outcome,
  replaced,
  decision,
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
  /** A change request's status word, in place of its box. */
  outcome?: Outcome;
  /** What this block replaced, when it changed since the last write. */
  replaced?: MdToken[];
  /** A line of the Decisions ledger; the string is the reason, folded in. */
  decision?: string;
  questionNo?: number;
  noteLabel?: string;
  changed?: boolean;
  onSelect: () => void;
}) {
  const [showOld, setShowOld] = useState(false);
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
  const cls = `kx-block kx-${token.kind}${selected ? ' selected' : ''}${noted ? ' noted' : ''}${openQuestion ? ' open-q' : ''}${changeRequest ? ' req-q' : ''}${questionNo || noteLabel ? ' kx-numbered' : ''}${changed ? ' kx-changed' : ''}${decision !== undefined ? ' kx-decision-request' : ''}`;
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
  // The number is a label beside the text, so it takes the meta size and family.
  const ordered = token.kind === 'ordered' ? token.text.match(/^(\d+[.)])\s*(.*)$/s) : null;
  return (
    <div
      className={`${cls}${task || outcome ? ' kx-task' : ''}`}
      style={token.depth ? { marginLeft: token.depth * 18 } : undefined}
      {...activation}
    >
      {questionNo ? (
        <span className="kx-qno mono">#{questionNo}</span>
      ) : noteLabel ? (
        <span className="kx-qno mono">{noteLabel}</span>
      ) : null}
      {outcome ? (
        <>
          <span
            className={`kx-outcome kx-outcome-${outcome.state} mono`}
            title={outcome.said || 'Not decided yet — it is decided in the document it names'}
          >
            {outcome.state}
          </span>
          <span className="kx-task-text">
            <Inline text={task ? (task[2] ?? '') : token.text} />
          </span>
        </>
      ) : task ? (
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
      ) : ordered ? (
        <>
          <span className="kx-ol-n mono">{ordered[1]}</span>
          <span>
            <Inline text={ordered[2] ?? ''} />
          </span>
        </>
      ) : (
        <Inline text={token.text} />
      )}
      {/* A changed block wears a [+] at the end of its sentence rather than a
          colour. Press it and what the text replaced unfolds beneath, faded; [−]
          folds it back. A block that replaced nothing is simply new, and a quiet
          word says so — once per run of new blocks, not on every line. */}
      {changed &&
        (replaced ? (
          <button
            className="kx-removed-toggle mono"
            onClick={(e) => {
              e.stopPropagation();
              setShowOld(!showOld);
            }}
            title={showOld ? 'Hide what this replaced' : 'Show what this replaced'}
          >
            [{showOld ? '−' : '+'}]
          </button>
        ) : (
          <span className="kx-new-mark mono" title="New since the last write">
            new
          </span>
        ))}
      {decision !== undefined && decision !== '' && (
        <div className="kx-decision-why">
          <span className="kx-decision-why-label">Reason:</span> {decision}
        </div>
      )}
      {showOld && replaced && (
        <div className="kx-removed-body">
          {replaced.map((t, i) => (
            <div key={i}>{t.text}</div>
          ))}
        </div>
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
  onDecide,
  cannotAccept,
  verbs = ['Accept', 'Deny'],
}: {
  thread: Explain[];
  active: boolean;
  answerBy: string;
  onAsk: (q: string) => void;
  onNote: (text: string) => void;
  /**
   * A change request is decided, not annotated: with this set the buttons are
   * Ask · Accept · Deny, and whatever is in the box rides along as the note.
   */
  onDecide?: (what: 'accept' | 'deny', note: string) => void;
  /** No agent writes this document, so nothing can be accepted on its behalf. */
  cannotAccept?: string;
  /** The two decision words — Accept · Deny by default, Send · Discard for an outgoing request. */
  verbs?: [string, string];
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
            {onDecide ? (
              <>
                <button
                  className="btn btn-primary"
                  disabled={!!cannotAccept}
                  title={cannotAccept ?? ''}
                  onClick={() => {
                    onDecide('accept', text.trim());
                    setText('');
                  }}
                >
                  {verbs[0]}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    onDecide('deny', text.trim());
                    setText('');
                  }}
                >
                  {verbs[1]}
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                disabled={!text.trim()}
                onClick={() => send('note')}
              >
                Add note
              </button>
            )}
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
