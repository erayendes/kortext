import { useEffect, useState } from 'react';
import {
  api,
  type DocInfo,
  type EngineInfo,
  type HandshakeState,
  type Job,
  type KopengPlan,
  type Project,
  type Readiness,
} from './api';
import { DocBadges, DocDrawer, StatusBadge } from './DocDrawer';

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

  const live = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const unarchive = (p: Project) =>
    api
      .archiveProject(p.id, false)
      .then(refresh)
      .catch((e) => setError(e.message));

  // A div, not a button: an archived card carries its own Unarchive control,
  // and a button inside a button is not a thing.
  const projectCard = (p: Project) => (
    <div
      key={p.id}
      className="kx-card"
      role="button"
      tabIndex={0}
      onClick={() => setSelected(p)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') setSelected(p);
      }}
    >
      <span className="kx-card-head">
        {p.code && <span className="kx-card-code mono">{p.code}</span>}
        <span className="kx-card-name">{p.name}</span>
        {p.archived === 1 && (
          <button
            className="btn btn-link-success kx-card-action"
            onClick={(e) => {
              e.stopPropagation();
              void unarchive(p);
            }}
          >
            Unarchive
          </button>
        )}
      </span>
      <span className="kx-card-path mono" title={p.repo_path}>
        {shortPath(p.repo_path)}
      </span>
      {p.docCounts && (
        <span
          className={`kx-card-counts mono${
            p.docCounts.total > 0 && p.docCounts.settled === p.docCounts.total ? ' done' : ''
          }`}
        >
          {p.docCounts.settled}/{p.docCounts.total} documents settled
        </span>
      )}
    </div>
  );

  return (
    <div className="kx-shell">
      <header className="kx-header">
        <span className="kx-logo">Kortext</span>
        <EngineBadge />
        <span className="kx-doc-spacer" />
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
              No projects yet. Add one to start — a brief template is scaffolded into the repo, and
              your own coding agent takes it from there.
            </div>
          )}
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
          <div className="kx-grid">{live.map(projectCard)}</div>
          {archived.length > 0 && (
            <details className="kx-doc-details kx-archive">
              <summary className="kx-doc-group">
                Archived
                <span className="kx-doc-count mono">{archived.length}</span>
              </summary>
              <div className="kx-grid">{archived.map(projectCard)}</div>
            </details>
          )}
        </main>
      )}
      <footer className="kx-footer">
        <div className="kx-footer-row">
          <span>
            Kortext <Version /> by{' '}
            <a href="https://milowda.com" target="_blank" rel="noreferrer">
              Milowda
            </a>
          </span>
          <span className="kx-doc-spacer" />
          <ThemeSwitch />
        </div>
      </footer>
    </div>
  );
}

// The running build, not the installed one — after an upgrade the process did
// not restart for, those differ and every fix looks missing.
function Version() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    api
      .health()
      .then((h) => setVersion(h.version))
      .catch(() => {});
  }, []);
  return version ? <span className="kx-version mono">v{version}</span> : null;
}

// §1 — Tema. Üç durum: auto işletim sistemini takip eder, light ve dark onu ezer
// ve hatırlanır. Nitelik yoksa auto demektir, ilk açılışın hâli budur.
type ThemeChoice = 'auto' | 'light' | 'dark';

function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    try {
      const v = localStorage.getItem('kx-theme');
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    try {
      if (choice === 'auto') localStorage.removeItem('kx-theme');
      else localStorage.setItem('kx-theme', choice);
    } catch {
      /* private mode — the choice lasts the session */
    }
  }, [choice]);
  return (
    <span className="seg seg-sm kx-theme">
      {(['auto', 'light', 'dark'] as ThemeChoice[]).map((t) => (
        <button key={t} className={t === choice ? 'on' : ''} onClick={() => setChoice(t)}>
          {t === 'auto' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}
        </button>
      ))}
    </span>
  );
}

// The engine belongs to a project, not to the app: each one is added with the
// CLI it runs on and switches on its own screen. All the header owes anyone is
// the warning that there is no CLI at all.
function EngineBadge() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);

  useEffect(() => {
    api.engines().then((r) => setEngines(r.engines));
  }, []);

  if (engines.length === 0 || engines.some((e) => e.available)) return null;
  return (
    <span className="kx-engine-warn">
      No agent CLI found — required to produce documents. Install one:{' '}
      <code className="mono">{engines[0]?.installHint ?? ''}</code>
    </span>
  );
}

/** The installed CLIs, as a dropdown. Empty list renders nothing. */
function EngineSelect({
  engines,
  value,
  onChange,
  className = '',
}: {
  engines: EngineInfo[];
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
}) {
  if (engines.length === 0) return null;
  return (
    <select
      className={`select ${className}`.trim()}
      value={value ?? engines[0].id}
      onChange={(e) => onChange(e.target.value)}
      title="The agent CLI that writes this project's documents"
    >
      {engines.map((e) => (
        <option key={e.id} value={e.id}>
          {e.id}
        </option>
      ))}
    </select>
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
          <span
            className={`kx-status kx-status-${plan.status === 'approved' ? 'approved' : 'draft'}`}
          >
            {plan.status ?? 'draft'}
          </span>
          <span className="kx-doc-spacer" />
          {plan.status !== 'approved' && (
            <button
              className="btn btn-success"
              onClick={() =>
                api.approvePlan(project.id).then(() => setPlan({ ...plan, status: 'approved' }))
              }
            >
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
              className="btn btn-secondary"
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
        Splits the work into tasks (Version → Epic → Task) and writes the files Kopeng reads under
        .kopeng/.
      </span>
      {err && <span className="kx-doc-fail">{err}</span>}
    </div>
  );
}

// The docs follow the brief's language — the example is English, but a brief
// written in any language yields documents in that language.
const BRIEF_EXAMPLE = `# Acme CRM

## Product Vision & Goals

A CRM for small sales teams: a card per customer, the meeting notes attached to it, and a
reminder for the next step. Today the team keeps customers in a shared spreadsheet and loses
the context between meetings — this puts the last conversation next to the customer, so
nobody walks into a call blind.

## Target Audience & Personas

Sales teams of 5-20 people, non-technical. The team lead creates the workspace and invites
the others; everyone else only ever sees their own customers.

## Interface Language

English only in v1. A second language is a later decision, not v1 scope.

## Key Performance Indicators (KPIs)

Meeting notes written per active user per week; the share of customers carrying a note from
the last 30 days; weekly active users per team.

## Future Scope & Out of Scope

No billing, no phone integration, no mobile app. The MVP customer list caps at 8 items per
view. Nothing is shared between teams.`;

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
  const [docLang, setDocLang] = useState('');
  const [brief, setBrief] = useState('');
  const [briefMode, setBriefMode] = useState<'write' | 'upload'>('write');
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The engine is asked for HERE, next to Initialize, rather than ranked for the
  // user: the three CLIs are equals, and only the person who installed them knows
  // which one they actually use. One installed CLI answers the question itself.
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [engine, setEngine] = useState<string | null>(null);

  useEffect(() => {
    api
      .engines()
      .then(({ engines, selected }) => {
        const usable = engines.filter((e) => e.available);
        setEngines(usable);
        setEngine(selected ?? (usable.length === 1 ? usable[0].id : null));
      })
      .catch(() => {});
  }, []);

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
      const { project } = await api.createProject({
        engine: engine ?? undefined,
        name,
        repoPath,
        kind,
        code: code || undefined,
        brief: brief || undefined,
        docLang: docLang || undefined,
      });
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
      <div className="kx-form-row">
        <input
          className="kx-input kx-path"
          placeholder={
            kind === 'existing'
              ? 'Documents language — e.g. Türkçe (there is no brief to take it from)'
              : 'Documents language (optional) — leave empty to follow the brief'
          }
          value={docLang}
          onChange={(e) => setDocLang(e.target.value)}
        />
      </div>
      {kind === 'existing' && (
        <span className="kx-cmd-hint">
          No brief for an existing project — the code itself is the evidence. Nothing runs until you
          press Start.
        </span>
      )}
      {kind === 'new' && (
        <div className="kx-brief">
          <div className="kx-brief-head">
            <span className="kx-cmd-title">Brief</span>
            <span className="kx-doc-spacer" />
            <button
              className="btn btn-link-primary"
              title="Download a filled-in example BRIEF.md"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([BRIEF_EXAMPLE], { type: 'text/markdown' }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'BRIEF.md';
                a.click();
                URL.revokeObjectURL(url);
                setBriefMode('upload'); // download → edit → bring it back here
              }}
            >
              Example ↓
            </button>
            {/* Write and Upload are one choice, so they are a segment, not two tabs. */}
            <span className="seg">
              <button
                className={briefMode === 'write' ? 'on' : ''}
                onClick={() => setBriefMode('write')}
              >
                Write
              </button>
              <button
                className={briefMode === 'upload' ? 'on' : ''}
                onClick={() => setBriefMode('upload')}
              >
                Upload
              </button>
            </span>
          </div>
          {briefMode === 'write' && (
            <>
              <textarea
                className="kx-editor kx-brief-text"
                placeholder={[
                  'Write the brief in any language — the documents come back in the language you use here.',
                  '',
                  'The analysis cannot start until it answers five things:',
                  '• what you are building, and why it should exist',
                  '• who it is for',
                  '• which language the product speaks to its users, and the default if there is more than one',
                  '• how you will know it worked',
                  '• what is deliberately out of scope',
                  '',
                  'Leave it empty to fill in and approve later from Documents.',
                ].join('\n')}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
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
                  <strong>{uploadName}</strong> loaded ({brief.length} chars) — click again to
                  replace, or edit in the Write tab.
                </span>
              ) : (
                <span>Click to pick your .md / .txt brief file</span>
              )}
            </label>
          )}
          <span className="kx-cmd-hint">
            The brief lands as yours, approved — nothing is read until you press Start. If the check
            then finds it too thin, it comes back to you with the questions it needs answered.
          </span>
        </div>
      )}
      {err && <div className="kx-error">{err}</div>}
      {engines.length === 0 && (
        <span className="kx-cmd-hint">
          No agent CLI found on your PATH. Install one — claude, codex or gemini — and pick it here;
          the project can be added now and started later.
        </span>
      )}
      <div className="kx-form-row">
        <EngineSelect engines={engines} value={engine} onChange={setEngine} />
        <button className="btn btn-primary" onClick={submit}>
          Initialize
        </button>
        <button className="btn btn-link-primary" onClick={onCancel}>
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
  const [pending, setPending] = useState(true); // any document still unwritten
  const [checking, setChecking] = useState(false); // the gate is reading the brief
  const [err, setErr] = useState<string | null>(null);
  // Two-step in-place confirmation — browsers silently suppress repeated
  // native confirm() dialogs, which made Restart/Cancel look dead.
  const [arming, setArming] = useState<'restart' | 'archive' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  // Switching engine mid-project is a quota move: the CLI you started on ran out,
  // so the rest of the analysis continues on another. A running step finishes on
  // the old one; everything that starts after this sees the new one.
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [engine, setEngine] = useState<string | null>(project.engine || null);

  useEffect(() => {
    api
      .engines()
      .then(({ engines, selected }) => {
        const usable = engines.filter((e) => e.available);
        setEngines(usable);
        setEngine((current) => current ?? selected ?? usable[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(null), 5000);
    return () => clearTimeout(t);
  }, [arming]);

  // Reading the brief is work in flight too — the gate holds the chain open.
  const running = status.length > 0 || checking;

  const start = () => {
    if (paused) return togglePause(); // unpausing kicks the chain
    // Already unpaused but idle — the gate refused, or the last pass ended.
    // Re-enter the chain so the gate runs again and any freed step starts.
    api.runNext(project.id).catch(() => {});
  };

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

  const doArchive = () => {
    setArming(null);
    setBusy(true);
    api
      .archiveProject(project.id, !project.archived)
      .then(onBack)
      .catch((e) => {
        setErr(e.message);
        setBusy(false);
      });
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
        <button className="btn btn-link-primary" onClick={onBack}>
          ← Projects
        </button>
        {running ? (
          <span className="kx-nav-status kx-running">{status || 'Reading the brief…'}</span>
        ) : paused && hasJobs ? (
          <span className="kx-nav-status">
            ⏸ Paused — running steps were stopped; nothing new starts.
          </span>
        ) : pending ? (
          <span className="kx-nav-status">
            {hasJobs
              ? 'Stopped — press Continue to pick it up.'
              : 'Ready — press Start to begin the analysis.'}
          </span>
        ) : null}
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
          <EngineSelect
            engines={engines}
            value={engine}
            onChange={(id) => {
              setEngine(id);
              api.setProjectEngine(project.id, id).catch((e) => setErr((e as Error).message));
            }}
          />
          {arming === 'restart' ? (
            <>
              <span className="kx-arm-warn">Wipe .kortext/ + .kopeng/ and start over?</span>
              <button className="btn btn-danger" disabled={busy} onClick={doRestart}>
                Yes, restart
              </button>
              <button className="btn btn-link-primary" onClick={() => setArming(null)}>
                No
              </button>
            </>
          ) : running ? (
            <button className="btn btn-primary" disabled={busy} onClick={togglePause}>
              ⏸ Pause
            </button>
          ) : (
            // Nothing is running: whatever the paused flag says, the only move
            // left is to start it. Offering Pause against a stopped chain — a
            // closed gate, a queue waiting on approvals — reads as a lie.
            pending && (
              <button className="btn btn-primary" disabled={busy} onClick={start}>
                {hasJobs ? '▶ Continue' : '▶ Start'}
              </button>
            )
          )}
        </div>
      </div>
      {err && <div className="kx-error">{err}</div>}
      <DocumentsTab
        project={project}
        paused={paused}
        onStatus={setStatus}
        onHasJobs={setHasJobs}
        onPending={setPending}
        onChecking={setChecking}
      />
      <div className="kx-danger-zone">
        {arming === 'restart' ? (
          <>
            <span className="kx-arm-warn">Wipe .kortext/ + .kopeng/ and start over?</span>
            <button className="btn btn-link-danger" disabled={busy} onClick={doRestart}>
              Yes, restart
            </button>
            <button className="btn btn-link-primary" onClick={() => setArming(null)}>
              No
            </button>
          </>
        ) : arming === 'archive' ? (
          <>
            <span className="kx-arm-warn">
              {project.archived
                ? 'Bring it back into the project list?'
                : 'Fold it away? The repo and its documents are untouched.'}
            </span>
            <button className="btn btn-link-success" disabled={busy} onClick={doArchive}>
              {project.archived ? 'Yes, unarchive' : 'Yes, archive'}
            </button>
            <button className="btn btn-link-primary" onClick={() => setArming(null)}>
              No
            </button>
          </>
        ) : arming === 'cancel' ? (
          <>
            <span className="kx-arm-warn">
              Delete .kortext/, .kopeng/ and kortext's AGENTS.md block, then remove the project?
            </span>
            <button className="btn btn-link-danger" disabled={busy} onClick={doCancel}>
              Yes, remove
            </button>
            <button className="btn btn-link-primary" onClick={() => setArming(null)}>
              No
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-link-primary"
              disabled={busy}
              onClick={() => setArming('restart')}
            >
              Restart analysis
            </button>
            <span className="kx-danger-sep">·</span>
            <button
              className="btn btn-link-success"
              disabled={busy}
              onClick={() => setArming('archive')}
            >
              {project.archived ? 'Unarchive project' : 'Archive project'}
            </button>
            <span className="kx-danger-sep">·</span>
            <button
              className="btn btn-link-danger"
              disabled={busy}
              onClick={() => setArming('cancel')}
            >
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
    const refresh = () =>
      api
        .handshake(project.id)
        .then(setState)
        .catch(() => {});
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
          Kortext's job is done; the documents are now the project's sacred guideline. From here on
          it's between you and your client.
        </span>
      </div>
      {/* Kopeng is not released, so nothing advertises it: the transfer panel
          appears for whoever has the binary, and everyone else sees nothing
          rather than an install command that 404s. */}
      {state.kopengInstalled && <TransferPanel project={project} />}
      <div className="kx-handshake-cards">
        <span className="kx-cmd-hint">
          Click a card — the command is copied to your clipboard; paste it into your client (CLI or
          app).
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
  onPending,
  onChecking,
}: {
  project: Project;
  paused?: boolean;
  onStatus?: (text: string) => void;
  onHasJobs?: (has: boolean) => void;
  onPending?: (pending: boolean) => void;
  onChecking?: (checking: boolean) => void;
}) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<DocInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gate, setGate] = useState<{ readiness: Readiness | null; checking: boolean }>({
    readiness: null,
    checking: false,
  });
  // The panel cannot see the server. What it last knew is not what is true now,
  // so it stops claiming a step is in flight — a dead server left "X writing…"
  // and a Pause button standing over a chain that had already finished.
  const [offline, setOffline] = useState(false);

  const refresh = () =>
    Promise.all([api.listDocs(project.id), api.jobs(project.id), api.readiness(project.id)])
      .then(([d, j, g]) => {
        setDocs(d.docs);
        setJobs(j.jobs);
        setGate(g);
        onChecking?.(g.checking);
        setOffline(false);
        setErr(null);
      })
      .catch((e) => {
        setOffline(true);
        setErr(
          `${e.message} — the panel has lost the kortext server; this page may be out of date.`,
        );
      });

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const runNext = () =>
    api
      .runNext(project.id)
      .then(refresh)
      .catch((e) => setErr(e.message));

  // Latest job per doc decides the row extras (spinner / red error).
  const jobFor = (rel: string) => jobs.find((j) => j.doc_rel === rel);

  // The running-status line lives in the nav row next to ← Projects; the
  // Start/Continue label needs to know whether anything ever ran.
  const running = offline ? [] : jobs.filter((j) => j.status === 'running');
  useEffect(() => {
    onStatus?.(running.length > 0 ? `${running.map((j) => j.doc_rel).join(' · ')} writing…` : '');
    onHasJobs?.(jobs.length > 0);
    onPending?.(docs.some((d) => d.status === 'uninitialized'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    running.map((j) => j.id).join(','),
    jobs.length,
    docs.map((d) => d.status).join(','),
    offline,
  ]);

  // The list answers "what should I do now", so it groups by state, not by
  // folder — Needs you first, Not applicable last and collapsed: those were
  // considered and deliberately skipped, so they are the least interesting.
  const bucketOf = (d: DocInfo): 'needs' | 'progress' | 'next' | 'approved' | 'na' => {
    const job = jobFor(d.rel);
    // A badge outranks the state for grouping — a failed attempt and an open
    // demand are both work for prime, wherever the document itself stands.
    // `dependent` is the exception: it is news, not a job, so the document
    // stays where it is.
    if (d.status === 'uninitialized' && job?.status === 'failed' && !paused) return 'needs';
    // A document the agent is rewriting is not waiting on prime, whatever it
    // said before the run started: a revision in flight read as "Needs you"
    // while the badge next to it said "writing…".
    if (job?.status === 'running' && d.status !== 'approved') return 'progress';
    if (d.revisionRequests.length > 0) return 'needs';
    if (d.status === 'draft') return 'needs';
    if (
      d.status === 'uninitialized' &&
      (job?.status === 'running' || (paused && job?.status === 'stopped'))
    ) {
      return 'progress';
    }
    if (d.status === 'uninitialized') return 'next';
    if (d.status === 'approved') return 'approved';
    return 'na'; // considered and deliberately skipped
  };

  const groups: {
    key: 'needs' | 'progress' | 'next' | 'approved' | 'na';
    title: string;
    closed?: boolean;
  }[] = [
    { key: 'needs', title: 'Needs you' },
    { key: 'progress', title: 'In progress' },
    { key: 'next', title: 'Next' },
    { key: 'approved', title: 'Approved', closed: true },
    { key: 'na', title: 'Not applicable', closed: true },
  ];
  // Active buckets keep the dependency order listDocs produced (the order work
  // actually happens in); finished ones read alphabetically — nothing is
  // "next" there, so the name is the only useful key.
  const ordered = docs;
  const sortFor = (key: string, items: DocInfo[]) =>
    key === 'approved' || key === 'na'
      ? [...items].sort((a, b) => a.name.localeCompare(b.name))
      : items;

  return (
    <div className="kx-docs">
      <HandshakeCard project={project} />
      <ReadinessCard
        gate={gate}
        // An existing project has no brief to open — the evidence is its code.
        onOpenBrief={(() => {
          const brief = docs.find((d) => d.rel === 'BRIEF.md');
          return brief ? () => setOpen(brief) : null;
        })()}
        onRecheck={() =>
          // run-next re-enters the chain, which re-runs the gate; a 409 just
          // means there was nothing to start, and the refresh shows the verdict.
          api
            .runNext(project.id)
            .catch(() => {})
            .then(refresh)
        }
      />
      {err && <div className="kx-error">{err}</div>}
      {groups.map((g) => {
        const items = sortFor(
          g.key,
          ordered.filter((d) => bucketOf(d) === g.key),
        );
        if (items.length === 0) return null;
        return (
          <details key={g.key} className="kx-doc-details" open={!g.closed}>
            <summary className="kx-doc-group">
              {g.title}
              <span className="kx-doc-count mono">{items.length}</span>
            </summary>
            {items.map((d) => {
              const job = jobFor(d.rel);
              // An approved document with a job running is being RE-READ, not
              // written — it keeps its state and says so with the badge.
              const rechecking = job?.status === 'running' && d.status === 'approved';
              const isRunning = job?.status === 'running' && !rechecking;
              // 'stopped' is the user's own pause/restart — not a failure: its own
              // badge, no red row, no Retry; Continue picks the step up again.
              const stopped = job?.status === 'stopped' && d.status === 'uninitialized';
              const failed = job?.status === 'failed' && d.status === 'uninitialized' && !paused;
              return (
                <button
                  key={d.rel}
                  className={`kx-doc-row${failed ? ' failed' : ''}`}
                  onClick={() => setOpen(d)}
                >
                  <span className="kx-doc-name">{d.name}</span>
                  {d.author && (
                    <span className="kx-doc-author mono">{d.author.replace(/^\+/, '')}</span>
                  )}
                  <span className="kx-doc-spacer" />
                  {failed && (
                    <span
                      className="btn btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        runNext();
                      }}
                    >
                      Retry
                    </span>
                  )}
                  <DocBadges doc={d} failed={failed} rechecking={rechecking} />
                  <span title={failed ? (job?.error ?? '') : ''}>
                    <StatusBadge doc={d} running={isRunning} stopped={stopped} />
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
        failedError={
          open && open.status === 'uninitialized' && jobFor(open.rel)?.status === 'failed'
            ? (jobFor(open.rel)?.error ?? 'no reason recorded')
            : null
        }
        onRetry={runNext}
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
  onRecheck,
}: {
  gate: { readiness: Readiness | null; checking: boolean };
  onOpenBrief: (() => void) | null;
  onRecheck: () => Promise<unknown>;
}) {
  const [rechecking, setRechecking] = useState(false);
  const recheck = () => {
    setRechecking(true);
    void onRecheck().finally(() => setTimeout(() => setRechecking(false), 1200));
  };
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
  const title = {
    error: 'The check did not finish',
    'no-engine': 'No agent CLI found',
    floor: 'Not enough to start',
    judgment: 'Not enough to start',
  }[r.stage];
  const lead = {
    error: 'Nothing was written.',
    'no-engine': 'Nothing can run until one is installed.',
    floor: 'There is not enough here to analyse, so no document was written.',
    judgment: 'There is not enough here to analyse, so no document was written.',
  }[r.stage];
  return (
    <div className="kx-gate">
      <h3>{title}</h3>
      <p>{lead}</p>
      <ul className="kx-gate-questions">
        {r.questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      {onOpenBrief && r.stage !== 'no-engine' ? (
        <button className="btn btn-primary" onClick={onOpenBrief}>
          Open the brief
        </button>
      ) : (
        // No brief to open: an existing project is judged on its code, and a
        // missing CLI is fixed outside the panel. Both end in the same move —
        // change the thing, ask again. The button reports that it ran, because
        // a re-check that finds the same thing looks like a dead button.
        <button className="btn btn-primary" disabled={rechecking} onClick={recheck}>
          {rechecking ? 'Checking…' : 'Check again'}
        </button>
      )}
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
