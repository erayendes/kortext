/**
 * AnnotatableDoc — renders markdown line-by-line and lets the reviewer select
 * lines and attach notes. Two annotation modes share one engine:
 *
 *  - `revise`  (References): notes = change requests → "Request changes".
 *  - `clarify` (Memory / Reports): notes = questions → "Ask agents".
 *  - `ro`      (engine-owned docs): read-only, no annotation affordance.
 *
 * Ported from the inline-annotation engine (`ANNO_CFG` / `annoEnter` /
 * `annoAdd` / `annoSubmit`) in wireframe-v6-hifi.html. The parent (FileBrowser)
 * owns the on/off toggle (the header button) and passes `annotating`; this
 * component owns selection + committed groups + the floating revise-bar.
 */
import { Fragment, useEffect, useState } from 'react';
import { Plus, GitPullRequest, Send } from 'lucide-react';
import { parseInline, parseMarkdown, type MdToken } from './markdown.ts';

export type AnnotateMode = 'revise' | 'clarify' | 'ro';

export type AnnotatableDocProps = {
  markdown: string;
  mode: AnnotateMode;
  /** Annotation on/off — controlled by FileBrowser's header toggle. */
  annotating?: boolean;
  /** Fired on submit with every annotated line index + the combined note text. */
  onSubmit?: (lines: number[], note: string) => void | Promise<void>;
  /** Fired after a successful submit so the parent can flip `annotating` off. */
  onDone?: () => void;
};

type Group = { n: number; note: string; lines: number[] };

/** Per-mode copy for the revise-bar. */
const MODE_COPY: Record<
  Exclude<AnnotateMode, 'ro'>,
  {
    noun: string;
    emptyPh: string;
    selPh: (n: number) => string;
    submitLabel: string;
    SubmitIcon: typeof Plus;
  }
> = {
  revise: {
    noun: 'note',
    emptyPh: 'Select lines to annotate…',
    selPh: (n) => `Describe the change for ${n} line(s)…`,
    submitLabel: 'Request changes',
    SubmitIcon: GitPullRequest,
  },
  clarify: {
    noun: 'question',
    emptyPh: 'Select lines to clarify…',
    selPh: (n) => `Ask the author about ${n} line(s)…`,
    submitLabel: 'Ask agents',
    SubmitIcon: Send,
  },
};

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
  onSubmit,
  onDone,
}: AnnotatableDocProps) {
  const tokens = parseMarkdown(markdown);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [groups, setGroups] = useState<Group[]>([]);
  const [noteInput, setNoteInput] = useState('');

  // Reset annotation state whenever the document changes or annotation is
  // turned off — matches the wireframe's `annoExit` on file switch.
  useEffect(() => {
    setSelected(new Set());
    setGroups([]);
    setNoteInput('');
  }, [markdown, annotating]);

  const canAnnotate = mode !== 'ro' && annotating;
  const copy = mode === 'ro' ? null : MODE_COPY[mode];

  // line index → committed group number (for the rgrp badge + title)
  const groupOf = new Map<number, Group>();
  for (const g of groups) for (const ln of g.lines) groupOf.set(ln, g);

  function toggleLine(idx: number) {
    if (!canAnnotate || groupOf.has(idx)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function addGroup() {
    if (!selected.size) return;
    const note = noteInput.trim() || '(no description)';
    setGroups((prev) => [
      ...prev,
      { n: prev.length + 1, note, lines: [...selected].sort((a, b) => a - b) },
    ]);
    setSelected(new Set());
    setNoteInput('');
  }

  async function submit() {
    if (!groups.length) return;
    const lines = groups.flatMap((g) => g.lines).sort((a, b) => a - b);
    const note = groups.map((g) => `${g.n}. ${g.note}`).join('\n');
    await onSubmit?.(lines, note);
    setSelected(new Set());
    setGroups([]);
    setNoteInput('');
    onDone?.();
  }

  function tokenClass(t: MdToken): string {
    const base = TOKEN_CLASS[t.kind];
    if (!t.selectable) return base;
    const parts = [base];
    if (selected.has(t.index)) parts.push('rsel');
    if (groupOf.has(t.index)) parts.push('rgrp');
    return parts.join(' ');
  }

  function renderToken(t: MdToken) {
    if (t.kind === 'blank') {
      return <div key={t.index} style={{ height: 9 }} />;
    }
    const grp = groupOf.get(t.index);
    const title = grp ? `${copy ? capitalize(copy.noun) : 'Note'} ${grp.n}: ${grp.note}` : undefined;
    const onClick = () => toggleLine(t.index);
    const badge = grp ? <span className="rgrp-tag">{grp.n}</span> : null;

    if (t.kind === 'table' && t.table) {
      return (
        <div key={t.index} className={tokenClass(t)} onClick={onClick} title={title}>
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
          {badge}
        </div>
      );
    }
    if (t.kind === 'h1')
      return (
        <h1 key={t.index} className={tokenClass(t)} onClick={onClick} title={title}>
          <Inline text={t.text} />
          {badge}
        </h1>
      );
    if (t.kind === 'h2')
      return (
        <h2 key={t.index} className={tokenClass(t)} onClick={onClick} title={title}>
          <Inline text={t.text} />
          {badge}
        </h2>
      );
    if (t.kind === 'h3')
      return (
        <h3 key={t.index} className={tokenClass(t)} onClick={onClick} title={title}>
          <Inline text={t.text} />
          {badge}
        </h3>
      );
    if (t.kind === 'quote')
      return (
        <blockquote key={t.index} className={tokenClass(t)} onClick={onClick} title={title}>
          <Inline text={t.text} />
          {badge}
        </blockquote>
      );
    if (t.kind === 'bullet')
      return (
        <div key={t.index} className={tokenClass(t)} onClick={onClick} title={title}>
          <span className="bull">•</span>
          <span>
            <Inline text={t.text} />
          </span>
          {badge}
        </div>
      );
    return (
      <div key={t.index} className={tokenClass(t)} onClick={onClick} title={title}>
        <Inline text={t.text} />
        {badge}
      </div>
    );
  }

  const selCount = selected.size;
  const groupCount = groups.length;

  return (
    <>
      <div className={`fb-md${canAnnotate ? ' revising' : ''}`}>{tokens.map(renderToken)}</div>

      {copy && (
        <div className={`revise-bar${annotating ? ' show' : ''}`}>
          <span className="rb-notes">
            {groupCount} {copy.noun}
            {groupCount === 1 ? '' : 's'}
          </span>
          <input
            className="rb-input"
            value={noteInput}
            disabled={selCount === 0}
            placeholder={selCount > 0 ? copy.selPh(selCount) : copy.emptyPh}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addGroup();
            }}
          />
          <button
            className="btn btn-line btn-sm"
            disabled={selCount === 0}
            onClick={addGroup}
          >
            <Plus style={{ width: 13, height: 13 }} />
            Add
          </button>
          <span className="rb-div" />
          <button
            className="btn btn-pri btn-sm"
            disabled={groupCount === 0}
            onClick={submit}
          >
            <copy.SubmitIcon style={{ width: 13, height: 13 }} />
            {copy.submitLabel}
          </button>
        </div>
      )}
    </>
  );
}

const TOKEN_CLASS: Record<MdToken['kind'], string> = {
  h1: 'rline',
  h2: 'rline',
  h3: 'rline',
  quote: 'rline',
  bullet: 'l bullet rline',
  para: 'l rline',
  table: 'rline',
  blank: '',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
