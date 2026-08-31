import { useEffect, useState } from 'react';
import { api, type DocInfo, type EngineInfo, type HandshakeState, type Job, type KopengPlan, type Project, type Readiness } from './api';
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
        <ProjectScreen
          key={selected.id}
          project={selected}
          onBack={() => {
            setSelected(null);
            refresh();
          }}
        />
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
                {p.docCounts && (
                  <span
                    className={`kx-card-counts mono${
                      p.docCounts.core.settled === p.docCounts.core.total &&
                      p.docCounts.foundation.settled === p.docCounts.foundation.total &&
                      p.docCounts.core.total > 0
                        ? ' done'
                        : ''
                    }`}
                  >
                    core {p.docCounts.core.settled}/{p.docCounts.core.total} · foundation{' '}
                    {p.docCounts.foundation.settled}/{p.docCounts.foundation.total}
                  </span>
                )}
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
      <footer className="kx-footer">
        <span>
          Kortext by{' '}
          <a href="https://milowda.com" target="_blank" rel="noreferrer">
            Milowda
          </a>
        </span>
        <span className="kx-doc-spacer" />
        <a href="https://github.com/erayendes/kopeng" target="_blank" rel="noreferrer">
          Kopeng — task board
        </a>
      </footer>
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
        <span className="kx-running">Splitting the work into tasks… (writing .kopeng/)</span>
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
  const [paused, setPaused] = useState(!!project.paused);
  const [status, setStatus] = useState('');
  const [hasJobs, setHasJobs] = useState(true); // pessimistic until the first poll
  const [err, setErr] = useState<string | null>(null);
  // Two-step in-place confirmation — browsers silently suppress repeated
  // native confirm() dialogs, which made Restart/Cancel look dead.
  const [arming, setArming] = useState<'restart' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(null), 5000);
    return () => clearTimeout(t);
  }, [arming]);

  const togglePause = () =>
    api
      .pauseProject(project.id, !paused)
      .then((r) => setPaused(r.paused))
      .catch((e) => setErr(e.message));

  const doRestart = () => {
    setArming(null);
    setBusy(true);
    api
      .restartProject(project.id)
      .then(() => setPaused(true)) // restart lands ready — Start begins it
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };

  const doCancel = () => {
    setArming(null);
    setBusy(true);
    api
      .cancelProject(project.id)
      .then(onBack)
      .catch((e) => {
        setErr(e.message);
        setBusy(false);
      });
  };

  return (
    <main className="kx-main">
      <div className="kx-main-nav">
        <button className="btn btn-sm" onClick={onBack}>
          ← Projects
        </button>
        {paused ? (
          <span className="kx-nav-status">
            {hasJobs
              ? '⏸ Paused — running steps were stopped; nothing new starts.'
              : 'Ready — press Start to begin the analysis.'}
          </span>
        ) : (
          status && <span className="kx-nav-status kx-running">{status}</span>
        )}
      </div>
      <div className="kx-main-head">
        <div className="kx-main-title">
          <div className="kx-card-head">
            {project.code && <span className="kx-card-code mono">{project.code}</span>}
            <h1>{project.name}</h1>
          </div>
          <span className="kx-card-path mono" title={project.repo_path}>
            {shortPath(project.repo_path)}
          </span>
        </div>
        <div className="kx-proj-actions">
          {arming === 'restart' ? (
            <>
              <span className="kx-arm-warn">Wipe .kortext/ + .kopeng/ and start over?</span>
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={doRestart}>
                Yes, restart
              </button>
              <button className="btn btn-sm" onClick={() => setArming(null)}>
                No
              </button>
            </>
          ) : (
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={togglePause}>
              {paused ? (hasJobs ? '▶ Continue' : '▶ Start') : '⏸ Pause'}
            </button>
          )}
        </div>
      </div>
      {err && <div className="kx-error">{err}</div>}
      <DocumentsTab
        project={project}
        paused={paused}
        onStatus={setStatus}
        onHasJobs={setHasJobs}
      />
      <div className="kx-danger-zone">
        {arming === 'restart' ? (
          <>
            <span className="kx-arm-warn">Wipe .kortext/ + .kopeng/ and start over?</span>
            <button className="kx-link kx-link-danger" disabled={busy} onClick={doRestart}>
              Yes, restart
            </button>
            <button className="kx-link" onClick={() => setArming(null)}>
              No
            </button>
          </>
        ) : arming === 'cancel' ? (
          <>
            <span className="kx-arm-warn">
              Delete .kortext/, .kopeng/, AGENTS.md and remove the project?
            </span>
            <button className="kx-link kx-link-danger" disabled={busy} onClick={doCancel}>
              Yes, remove
            </button>
            <button className="kx-link" onClick={() => setArming(null)}>
              No
            </button>
          </>
        ) : (
          <>
            <button className="kx-link" disabled={busy} onClick={() => setArming('restart')}>
              Restart analysis
            </button>
            <button className="kx-link kx-link-danger" disabled={busy} onClick={() => setArming('cancel')}>
              Remove project
            </button>
          </>
        )}
      </div>
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
        <CommandCard
          className="kx-kopeng-promo"
          badge="Kopeng"
          title="From here the work moves task by task — watch it on a board."
          hint={
            '"Transfer to Kopeng" splits the work into Version → Epic → Task in one click; ' +
            'your agent pulls tasks while you watch the kanban. Install it and the button ' +
            'appears right here:'
          }
          command="npm install -g kopeng"
        />
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

function DocumentsTab({
  project,
  paused,
  onStatus,
  onHasJobs,
}: {
  project: Project;
  paused?: boolean;
  onStatus?: (text: string) => void;
  onHasJobs?: (has: boolean) => void;
}) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<DocInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gate, setGate] = useState<{ readiness: Readiness | null; checking: boolean }>({
    readiness: null,
    checking: false,
  });

  const refresh = () =>
    Promise.all([api.listDocs(project.id), api.jobs(project.id), api.readiness(project.id)])
      .then(([d, j, g]) => {
        setDocs(d.docs);
        setJobs(j.jobs);
        setGate(g);
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

  // The running-status line lives in the nav row next to ← Projects; the
  // Start/Continue label needs to know whether anything ever ran.
  const running = jobs.filter((j) => j.status === 'running');
  useEffect(() => {
    onStatus?.(running.length > 0 ? `${running.map((j) => j.doc_rel).join(' · ')} writing…` : '');
    onHasJobs?.(jobs.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running.map((j) => j.id).join(','), jobs.length]);

  // The list answers "what should I do now", so it groups by state, not by
  // folder — Needs you first, Reference (n/a + log) last and collapsed.
  const bucketOf = (d: DocInfo): 'needs' | 'progress' | 'next' | 'approved' | 'reference' => {
    const job = jobFor(d.rel);
    if (d.status === 'draft') return 'needs';
    if (d.status === 'uninitialized' && job?.status === 'failed' && !paused) return 'needs';
    if (d.status === 'uninitialized' && (job?.status === 'running' || (paused && job?.status === 'stopped'))) {
      return 'progress';
    }
    if (d.status === 'uninitialized') return 'next';
    if (d.status === 'approved') return 'approved';
    return 'reference'; // not-applicable + log
  };

  const groups: {
    key: 'needs' | 'progress' | 'next' | 'approved' | 'reference';
    title: string;
    closed?: boolean;
  }[] = [
    { key: 'needs', title: 'Needs you' },
    { key: 'progress', title: 'In progress' },
    { key: 'next', title: 'Next' },
    { key: 'approved', title: 'Approved', closed: true },
    { key: 'reference', title: 'Reference', closed: true },
  ];
  // Active buckets keep the dependency order listDocs produced (the order work
  // actually happens in); finished ones read alphabetically — nothing is
  // "next" there, so the name is the only useful key.
  const ordered = docs;
  const sortFor = (key: string, items: DocInfo[]) =>
    key === 'approved' || key === 'reference'
      ? [...items].sort((a, b) => a.name.localeCompare(b.name))
      : items;

  return (
    <div className="kx-docs">
      <HandshakeCard project={project} />
      <ReadinessCard
        gate={gate}
        onOpenBrief={() => setOpen(docs.find((d) => d.rel === 'foundation/BRD.md') ?? null)}
      />
      {err && <div className="kx-error">{err}</div>}
      {groups.map((g) => {
        const items = sortFor(g.key, ordered.filter((d) => bucketOf(d) === g.key));
        if (items.length === 0) return null;
        return (
          <details key={g.key} className="kx-doc-details" open={!g.closed}>
            <summary className="kx-doc-group">
              {g.title}
              <span className="kx-doc-count mono">{items.length}</span>
            </summary>
            {items.map((d) => {
              const job = jobFor(d.rel);
              const isRunning = job?.status === 'running';
              // 'stopped' is the user's own pause/restart — not a failure: its own
              // badge, no red row, no Retry; Continue picks the step up again.
              const stopped = job?.status === 'stopped' && d.status === 'uninitialized';
              const failed = job?.status === 'failed' && d.status === 'uninitialized' && !paused;
              return (
                <button key={d.rel} className={`kx-doc-row${failed ? ' failed' : ''}`} onClick={() => setOpen(d)}>
                  <span className="kx-doc-name">{d.name}</span>
                  <span className="kx-doc-scope">({d.group})</span>
                  {d.author && <span className="kx-doc-author mono">{d.author.replace(/^\+/, '')}</span>}
                  <span className="kx-doc-spacer" />
                  {failed && (
                    <span
                      className="btn btn-sm btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        runNext();
                      }}
                    >
                      Retry
                    </span>
                  )}
                  {d.upstreamChanged && <span className="kx-doc-warn">upstream changed</span>}
                  <span title={failed ? job?.error ?? '' : ''}>
                    <StatusBadge
                      doc={d}
                      running={isRunning}
                      stopped={stopped}
                      failed={failed}
                    />
                  </span>
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

// The readiness gate, when it is closed. The analysis produces nothing from a
// brief that says nothing, so the questions the brief must answer take the
// place of the documents that would otherwise have been invented.
function ReadinessCard({
  gate,
  onOpenBrief,
}: {
  gate: { readiness: Readiness | null; checking: boolean };
  onOpenBrief: () => void;
}) {
  if (gate.checking) {
    return (
      <div className="kx-gate">
        <h3>Reading the brief…</h3>
        <p>Checking whether it says enough to analyse. Nothing is being written yet.</p>
      </div>
    );
  }
  const r = gate.readiness;
  if (!r || r.ready || r.questions.length === 0) return null;
  return (
    <div className="kx-gate">
      <h3>{r.stage === 'error' ? 'The check did not finish' : 'Not enough to start'}</h3>
      <p>
        {r.stage === 'error'
          ? 'Nothing was written.'
          : 'The brief does not say enough to analyse, so no document was written. Answer these in the brief, then press Start.'}
      </p>
      <ul className="kx-gate-questions">
        {r.questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <button className="btn btn-sm btn-primary" onClick={onOpenBrief}>
        Open the brief
      </button>
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
// too-small box; the command wraps in full and one click grabs it. The Kopeng
// promo is the same card with a badge and a longer pitch.
function CommandCard({
  title,
  command,
  badge,
  hint,
  className,
}: {
  title: string;
  command: string;
  badge?: string;
  hint?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`kx-cmd-card${className ? ` ${className}` : ''}${copied ? ' copied' : ''}`}
      onClick={() => {
        copyText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {badge && <span className="kx-kopeng-badge">{badge}</span>}
      <div className="kx-cmd-head">
        <span className={badge ? 'kx-kopeng-title' : 'kx-cmd-title'}>{title}</span>
        <span className="kx-cmd-copy">{copied ? '✓ Copied' : 'Copy'}</span>
      </div>
      {hint && <span className="kx-cmd-hint">{hint}</span>}
      <code className="kx-cmd mono">{command}</code>
    </button>
  );
}
