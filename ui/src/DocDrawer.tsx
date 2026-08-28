import { Fragment, useEffect, useMemo, useState } from 'react';
import { Drawer } from './Drawer';
import { parseInline, parseMarkdown, type MdToken } from './markdown';
import { api, type DocInfo, type Project } from './api';

interface Note {
  line: number | null;
  excerpt: string;
  text: string;
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
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setSelected(null);
    setNotes([]);
    setNoteText('');
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

  const tokens = useMemo(() => parseMarkdown(stripFrontmatter(content)), [content]);

  if (!doc) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;

  const addNote = () => {
    if (!noteText.trim()) return;
    const token = tokens.find((t) => t.index === selected);
    setNotes([...notes, { line: selected, excerpt: token?.text?.slice(0, 80) ?? '', text: noteText.trim() }]);
    setNoteText('');
    setSelected(null);
  };

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

  const requestRevision = () =>
    act(async () => {
      await api.createRequest(project.id, 'revise', {
        doc: doc.rel,
        notes: notes.map((n) => (n.excerpt ? `[${n.excerpt}] ${n.text}` : n.text)),
      });
      setNotes([]);
      onClose();
    });

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
          {doc.author && <span className="kx-doc-author mono">{doc.author}</span>}
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
              <DocBlock
                key={t.index}
                token={t}
                selected={selected === t.index}
                noted={notes.some((n) => n.line === t.index)}
                onSelect={() =>
                  doc.status === 'uninitialized' ? undefined : setSelected(selected === t.index ? null : t.index)
                }
              />
            ))}
          </div>
        )}
      </div>
      {!editing && doc.status !== 'uninitialized' && (
        <div className="dr-foot">
          {notes.length > 0 && (
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
          )}
          <div className="kx-note-input">
            <input
              className="kx-input"
              placeholder={
                selected !== null ? 'Note for the selected line…' : 'General note… (click a line to anchor)'
              }
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNote()}
            />
            <button className="btn btn-sm" onClick={addNote}>
              Add note
            </button>
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
  const label = doc.revisionPending
    ? 'revision'
    : doc.status === 'uninitialized'
      ? doc.blocked
        ? 'waiting'
        : 'next'
      : doc.status;
  return (
    <span className={`kx-status kx-status-${label}`}>
      {label}
      {doc.upstreamChanged && !doc.revisionPending ? ' ⚠' : ''}
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
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {token.table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
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
      {parseInline(token.text).map((s, i) => (
        <Fragment key={i}>
          {s.type === 'bold' ? <strong>{s.value}</strong> : s.type === 'code' ? <code>{s.value}</code> : s.value}
        </Fragment>
      ))}
    </div>
  );
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  return end === -1 ? md : md.slice(end + 4).replace(/^\n+/, '');
}
