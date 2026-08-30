import { useEffect, useState } from 'react';
import { api, type DocInfo, type EngineInfo, type HandshakeState, type Job, type KopengPlan, type Project } from './api';
import { DocDrawer, StatusBadge } from './DocDrawer';

// ponytail: last two segments read fine in a card; the full path lives in the tooltip
function shortPath(p: string) {
  const parts = p.split('/').filter(Boolean);
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = () =>
    api
      .listProjects()
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="kx-shell">
      <header className="kx-header">
        <span className="kx-logo">Kortext</span>
        <span className="kx-tagline">project brain</span>
        <span className="kx-doc-spacer" />
        <EngineBadge />
      </header>
      {error && <div className="kx-error">{error}</div>}
      {selected ? (
        <ProjectScreen key={selected.id} project={selected} onBack={() => setSelected(null)} />
      ) : (
        <main className="kx-main">
          <div className="kx-main-head">
            <h1>Projects</h1>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Add project
            </button>
          </div>
          {projects.length === 0 && !adding && (
            <div className="kx-empty">
              No projects yet. Add one to start — a brief template (BRD) is scaffolded into the
              repo, and your own coding agent takes it from there.
            </div>
          )}
          <div className="kx-grid">
            {projects.map((p) => (
              <button key={p.id} className="kx-card" onClick={() => setSelected(p)}>
                <span className="kx-card-head">
                  {p.code && <span className="kx-card-code mono">{p.code}</span>}
                  <span className="kx-card-name">{p.name}</span>
                </span>
                <span className="kx-card-path mono" title={p.repo_path}>
                  {shortPath(p.repo_path)}
                </span>
              </button>
            ))}
          </div>
          {adding && (
            <AddProject
              onDone={(project) => {
                setAdding(false);
                refresh();
                setSelected(project);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </main>
      )}
    </div>
  );
}

function EngineBadge() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.engines().then((r) => {
      setEngines(r.engines);
      setSelected(r.selected);
    });
  }, []);

  const available = engines.filter((e) => e.available);
  if (engines.length === 0) return null;
  if (available.length === 0) {
    const hint = engines[0]?.installHint ?? '';
    return (
      <span className="kx-engine-warn">
        No agent CLI found — required to produce documents. Install one: <code className="mono">{hint}</code>
      </span>
    );
  }
  return (
    <span className="kx-engine">
      Engine:
      <select
        className="kx-engine-select mono"
        value={selected ?? available[0].id}
        onChange={(e) => api.selectEngine(e.target.value).then((r) => setSelected(r.selected))}
      >
        {available.map((e) => (
          <option key={e.id} value={e.id}>
            {e.id}
          </option>
        ))}
      </select>
    </span>
  );
}

// Transfer = split into .kopeng/ files; the plan gets a summary + approve /
// revise round — the last act of the handshake.
function TransferPanel({ project }: { project: Project }) {
  const [plan, setPlan] = useState<KopengPlan | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [reviseText, setReviseText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () =>
      Promise.all([api.kopengPlan(project.id), api.jobs(project.id)])
        .then(([p, j]) => {
          setPlan(p);
          setSplitting(j.jobs.some((jb) => jb.doc_rel === '.kopeng/' && jb.status === 'running'));
          const failed = j.jobs.find((jb) => jb.doc_rel === '.kopeng/' && jb.status === 'failed');
          setErr(failed && !p.exists ? failed.error : null);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [project.id]);

  const transfer = (notes?: string[]) =>
    api
      .transfer(project.id, notes)
      .then(() => setSplitting(true))
      .catch((e) => setErr(e.message));

  if (splitting) {
    return (
      <div className="kx-handshake-kopeng">
        <span className="kx-running">⟳ Splitting the work into tasks… (writing .kopeng/)</span>
      </div>
    );
  }

  if (plan?.exists) {
    return (
      <div className="kx-handshake-plan">
        <div className="kx-plan-row">
          <span className="kx-cmd-title">
            Plan ready: {plan.versions} version · {plan.epics} epic · {plan.tasks} task
          </span>
          <span className={`kx-status kx-status-${plan.status === 'approved' ? 'approved' : 'draft'}`}>
            {plan.status ?? 'draft'}
          </span>
          <span className="kx-doc-spacer" />
          {plan.status !== 'approved' && (
            <button className="btn btn-sm btn-success" onClick={() => api.approvePlan(project.id).then(() => setPlan({ ...plan, status: 'approved' }))}>
              Approve plan
            </button>
          )}
        </div>
        {plan.status === 'approved' ? (
          <span className="kx-cmd-hint">
            Tasks live under .kopeng/ — open your Kopeng board; your agent pulls work from there.
          </span>
        ) : (
          <div className="kx-note-input">
            <input
              className="kx-input"
              placeholder="Revision note… (re-splits the plan with your notes)"
              value={reviseText}
              onChange={(e) => setReviseText(e.target.value)}
            />
            <button
              className="btn btn-sm btn-secondary"
              disabled={!reviseText.trim()}
              onClick={() => {
                transfer([reviseText.trim()]);
                setReviseText('');
              }}
            >
              Revise plan
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="kx-handshake-kopeng">
      <button className="btn btn-primary" onClick={() => transfer()}>
        Transfer to Kopeng
      </button>
      <span className="kx-cmd-hint">
        Splits the work into tasks (Version → Epic → Task) and writes the files Kopeng
        reads under .kopeng/.
      </span>
      {err && <span className="kx-doc-fail">{err}</span>}
    </div>
  );
}

// The docs follow the brief's language — the example is English, but a brief
// written in any language yields documents in that language.
const BRIEF_EXAMPLE = `# Acme CRM

## What we're building
A simple CRM for small teams: customer cards, meeting notes, reminders.

## Who it's for
Sales teams of 5-20 people; non-technical users.

## Scope
- Customer list + detail card
- Adding meeting notes
- Reminders (email)
MVP: 8 items max.

## Out of scope
Billing, phone integration.`;

function AddProject({
  onDone,
  onCancel,
}: {
  onDone: (project: Project, hadBrief: boolean) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [brief, setBrief] = useState('');
  const [briefMode, setBriefMode] = useState<'write' | 'upload'>('write');
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const browse = async () => {
    const { path } = await api.pickDirectory();
    if (path) setRepoPath(path); // picked folder IS the project root
  };

  const uploadBrief = (file: File | undefined) => {
    if (!file) return;
    file.text().then((text) => {
      setBrief(text);
      setUploadName(file.name);
    });
  };

  const submit = async () => {
    try {
      const { project } = await api.createProject({ name, repoPath, kind, code: code || undefined, brief: brief || undefined });
      onDone(project, brief.trim().length > 0);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="kx-form">
      <div className="kx-form-row">
        <button
          className={`btn ${kind === 'new' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setKind('new')}
        >
          New project
        </button>
        <button
          className={`btn ${kind === 'existing' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setKind('existing')}
        >
          Existing project
        </button>
      </div>
      <span className="kx-cmd-hint">
        {kind === 'new'
          ? 'Greenfield product: the engine runs the new-project-analysis workflow.'
          : 'Existing codebase: the engine documents the current state via existing-project-analysis.'}
      </span>
      <div className="kx-form-row">
        <input
          className="kx-input kx-path"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="kx-input mono kx-code-input"
          placeholder="Code (ACME)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>
      <div className="kx-form-row">
        <input
          className="kx-input mono kx-path"
          placeholder="Project folder (pick with Browse)"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={browse}>
          Browse…
        </button>
      </div>
      {kind === 'existing' && (
        <span className="kx-cmd-hint">
          No brief for an existing project — analysis derives from the code itself and starts when you hit Add.
        </span>
      )}
      {kind === 'new' && (
      <div className="kx-brief">
        <div className="kx-brief-head">
          <span className="kx-cmd-title">Brief (BRD)</span>
          <nav className="kx-tabs kx-tabs-sm">
            <button
              className={`kx-tab ${briefMode === 'write' ? 'active' : ''}`}
              onClick={() => setBriefMode('write')}
            >
              Write
            </button>
            <button
              className={`kx-tab ${briefMode === 'upload' ? 'active' : ''}`}
              onClick={() => setBriefMode('upload')}
            >
              Upload
            </button>
          </nav>
        </div>
        {briefMode === 'write' && (
          <>
            <textarea
              className="kx-editor kx-brief-text"
              placeholder="Write the project brief here: what we're building, who it's for, scope, out of scope… (Leave empty to fill it in later from Documents.)"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
            <button className="btn btn-secondary btn-sm kx-self-start" onClick={() => setBrief(BRIEF_EXAMPLE)}>
              Insert example
            </button>
          </>
        )}
        {briefMode === 'upload' && (
          <label className="kx-drop">
            <input
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              onChange={(e) => uploadBrief(e.target.files?.[0])}
            />
            {uploadName ? (
              <span>
                <strong>{uploadName}</strong> loaded ({brief.length} chars) — click again to replace,
                or edit in the Write tab.
              </span>
            ) : (
              <span>Click to pick your .md / .txt brief file</span>
            )}
          </label>
        )}
        <span className="kx-cmd-hint">
          Write or upload the brief and it lands as the approved BRD — analysis starts
          immediately; leave it empty to fill in and approve from Documents.
        </span>
      </div>
      )}
      {err && <div className="kx-error">{err}</div>}
      <div className="kx-form-row">
        <button className="btn btn-primary" onClick={submit}>
          Add
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// One view: the analysis flow. When the handshake completes, the completion
// card takes over the top — kortext's job is done, the client takes it from
// there (vision §20).
function ProjectScreen({ project, onBack }: { project: Project; onBack: () => void }) {
  return (
    <main className="kx-main">
      <div className="kx-main-head">
        <button className="btn" onClick={onBack}>
          ← Projects
        </button>
        <div className="kx-main-title">
          <div className="kx-card-head">
            {project.code && <span className="kx-card-code mono">{project.code}</span>}
            <h1>{project.name}</h1>
          </div>
          <span className="kx-card-path mono" title={project.repo_path}>
            {shortPath(project.repo_path)}
          </span>
        </div>
      </div>
      <DocumentsTab project={project} />
    </main>
  );
}

function HandshakeCard({ project }: { project: Project }) {
  const [state, setState] = useState<HandshakeState | null>(null);

  useEffect(() => {
    const refresh = () => api.handshake(project.id).then(setState).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [project.id]);

  if (!state?.analysisComplete) return null;

  const instructions = [
    {
      title: 'Analyze and start building',
      command: 'Read AGENTS.md and the .kortext/ guideline docs, then start building.',
    },
    {
      title: 'Split into tasks first',
      command: 'Read AGENTS.md, break the work into tasks first and show me the list.',
    },
    {
      title: 'Start with a specific task',
      command: 'Read AGENTS.md, then start with: <describe the task here>',
    },
  ];

  return (
    <div className="kx-handshake">
      <div className="kx-handshake-head">
        <span className="kx-handshake-title">✓ Analysis complete — handshake done</span>
        <span className="kx-cmd-hint">
          Kortext's job is done; the documents are now the project's sacred guideline. From
          here on it's between you and your client.
        </span>
      </div>
      {state.kopengInstalled ? (
        <TransferPanel project={project} />
      ) : (
        <div className="kx-kopeng-promo">
          <span className="kx-kopeng-badge">Kopeng</span>
          <span className="kx-kopeng-title">
            From here the work moves task by task — watch it on a board.
          </span>
          <span className="kx-cmd-hint">
            "Transfer to Kopeng" splits the work into Version → Epic → Task in one click;
            your agent pulls tasks while you watch the kanban. Install it and the button
            appears right here:
          </span>
          <div className="kx-kopeng-install">
            <code className="kx-cmd mono">npm install -g kopeng</code>
            <CopyBtn text="npm install -g kopeng" />
          </div>
        </div>
      )}
      <div className="kx-handshake-cards">
        <span className="kx-cmd-hint">
          Click a card — the command is copied to your clipboard; paste it into your client (CLI or app).
        </span>
        {instructions.map((c) => (
          <CommandCard key={c.title} title={c.title} command={c.command} />
        ))}
      </div>
    </div>
  );
}

function DocumentsTab({ project }: { project: Project }) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<DocInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([api.listDocs(project.id), api.jobs(project.id)])
      .then(([d, j]) => {
        setDocs(d.docs);
        setJobs(j.jobs);
        setErr(null);
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const runNext = () => api.runNext(project.id).then(refresh).catch((e) => setErr(e.message));

  // Latest job per doc decides the row extras (spinner / red error).
  const jobFor = (rel: string) => jobs.find((j) => j.doc_rel === rel);

  // Action-first ordering: what needs the prime's attention floats to the top.
  const rank = (d: DocInfo) => {
    if (d.status === 'draft') return 0;
    if (jobFor(d.rel)?.status === 'running') return 1;
    if (d.status === 'uninitialized' && !d.blocked) return 2;
    if (d.status === 'uninitialized') return 3;
    if (d.status === 'approved') return 4;
    if (d.status === 'not-applicable') return 5;
    return 6; // log & rest
  };
  const ordered = [...docs].sort((a, b) => rank(a) - rank(b));

  const groups: { key: 'core' | 'foundation'; title: string }[] = [
    { key: 'core', title: 'Core' },
    { key: 'foundation', title: 'Foundation' },
  ];

  return (
    <div className="kx-docs">
      <HandshakeCard project={project} />
      {err && <div className="kx-error">{err}</div>}
      <div className="kx-docs-toolbar">
        {jobs.some((j) => j.status === 'running') ? (
          <span className="kx-running">
            ⟳ {jobs.filter((j) => j.status === 'running').map((j) => j.doc_rel).join(' · ')} writing…
          </span>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={runNext}>
            Run next step
          </button>
        )}
      </div>
      {groups.map((g) => {
        const items = ordered.filter((d) => d.group === g.key);
        const settled = items.filter(
          (d) => d.status === 'approved' || d.status === 'not-applicable' || d.status === 'log',
        ).length;
        // Open while there is still work in the group; auto-collapses once all
        // docs settle (the handshake takes over the screen at that point).
        return (
          <details key={g.key} className="kx-doc-details" open={settled < items.length}>
            <summary className="kx-doc-group">
              {g.title}
              <span className="kx-doc-count mono">
                {settled}/{items.length}
              </span>
            </summary>
            {items.map((d) => {
              const job = jobFor(d.rel);
              const isRunning = job?.status === 'running';
              const failed = job?.status === 'failed' && d.status === 'uninitialized';
              return (
                <button key={d.rel} className={`kx-doc-row${failed ? ' failed' : ''}`} onClick={() => setOpen(d)}>
                  <span className="kx-doc-name">{d.name}</span>
                  {d.author && <span className="kx-doc-author mono">{d.author.replace(/^\+/, '')}</span>}
                  <span className="kx-doc-spacer" />
                  {isRunning && <span className="kx-running">⟳ writing…</span>}
                  {failed && (
                    <>
                      <span className="kx-doc-fail" title={job?.error ?? ''}>
                        step failed
                      </span>
                      <span
                        className="btn btn-sm btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          runNext();
                        }}
                      >
                        Retry
                      </span>
                    </>
                  )}
                  {d.upstreamChanged && <span className="kx-doc-warn">upstream changed</span>}
                  {!isRunning && <StatusBadge doc={d} />}
                </button>
              );
            })}
          </details>
        );
      })}
      <DocDrawer
        project={project}
        doc={open}
        onClose={() => setOpen(null)}
        onChanged={refresh}
      />
    </div>
  );
}

// Clipboard API can be denied in embedded webviews; fall back to the
// select-and-copy trick so the button never fails silently.
function copyText(text: string) {
  return navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  });
}

// The whole card is the copy button — no truncated code peeking out of a
// too-small box; the command wraps in full and one click grabs it.
function CommandCard({ title, command }: { title: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`kx-cmd-card${copied ? ' copied' : ''}`}
      onClick={() => {
        copyText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <div className="kx-cmd-head">
        <span className="kx-cmd-title">{title}</span>
        <span className="kx-cmd-copy">{copied ? '✓ Copied' : 'Copy'}</span>
      </div>
      <code className="kx-cmd mono">{command}</code>
    </button>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn btn-sm"
      onClick={() => {
        copyText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        });
      }}
    >
      {ok ? '✓' : 'Copy'}
    </button>
  );
}
