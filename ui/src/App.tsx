import { useEffect, useState } from 'react';
import { api, type DocInfo, type KortextRequest, type Project, type ReportInfo } from './api';
import { DocDrawer, StatusBadge } from './DocDrawer';

type Tab = 'documents' | 'reports' | 'connect';

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
      </header>
      {error && <div className="kx-error">{error}</div>}
      {selected ? (
        <ProjectScreen project={selected} onBack={() => setSelected(null)} />
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
                <span className="kx-card-name">{p.name}</span>
                <span className="kx-card-path mono">{p.repo_path}</span>
              </button>
            ))}
          </div>
          {adding && (
            <AddProject
              onDone={() => {
                setAdding(false);
                refresh();
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </main>
      )}
    </div>
  );
}

function AddProject({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [mode, setMode] = useState<'new' | 'existing'>('existing');
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    try {
      await api.createProject({ name, repoPath, mode });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="kx-form">
      <div className="kx-form-row">
        <button
          className={`btn ${mode === 'existing' ? 'btn-primary' : ''}`}
          onClick={() => setMode('existing')}
        >
          Existing repo
        </button>
        <button className={`btn ${mode === 'new' ? 'btn-primary' : ''}`} onClick={() => setMode('new')}>
          New project
        </button>
      </div>
      <input
        className="kx-input"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="kx-input mono"
        placeholder={mode === 'new' ? 'Folder to create (absolute path)' : 'Repo path (absolute)'}
        value={repoPath}
        onChange={(e) => setRepoPath(e.target.value)}
      />
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

function ProjectScreen({ project, onBack }: { project: Project; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('documents');
  const [pending, setPending] = useState<KortextRequest[]>([]);

  const refreshRequests = () =>
    api.listRequests(project.id, 'pending').then((r) => setPending(r.requests));

  useEffect(() => {
    refreshRequests();
    const timer = setInterval(refreshRequests, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  return (
    <main className="kx-main">
      <div className="kx-main-head">
        <button className="btn" onClick={onBack}>
          ← Projects
        </button>
        <h1>{project.name}</h1>
        <span className="kx-card-path mono">{project.repo_path}</span>
      </div>
      <nav className="kx-tabs">
        {(['documents', 'reports', 'connect'] as Tab[]).map((t) => (
          <button key={t} className={`kx-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'documents' ? 'Documents' : t === 'reports' ? 'Reports' : 'Connect'}
            {t === 'connect' && pending.length > 0 && <span className="kx-badge">{pending.length}</span>}
          </button>
        ))}
      </nav>
      {tab === 'documents' && <DocumentsTab project={project} />}
      {tab === 'reports' && <ReportsTab project={project} onRequested={refreshRequests} />}
      {tab === 'connect' && (
        <ConnectTab project={project} pending={pending} onChanged={refreshRequests} />
      )}
    </main>
  );
}

function DocumentsTab({ project }: { project: Project }) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [open, setOpen] = useState<DocInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () =>
    api
      .listDocs(project.id)
      .then((r) => {
        setDocs(r.docs);
        setErr(null);
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const groups: { key: 'foundation' | 'references'; title: string }[] = [
    { key: 'foundation', title: 'Foundation' },
    { key: 'references', title: 'References' },
  ];

  return (
    <div className="kx-docs">
      {err && <div className="kx-error">{err}</div>}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="kx-doc-group">{g.title}</h2>
          {docs
            .filter((d) => d.group === g.key)
            .map((d) => (
              <button key={d.rel} className="kx-doc-row" onClick={() => setOpen(d)}>
                <span className="kx-doc-name">{d.name}</span>
                {d.author && <span className="kx-doc-author mono">{d.author}</span>}
                <span className="kx-doc-spacer" />
                {d.upstreamChanged && <span className="kx-doc-warn">upstream changed</span>}
                <StatusBadge doc={d} />
              </button>
            ))}
        </section>
      ))}
      <DocDrawer
        project={project}
        doc={open}
        onClose={() => setOpen(null)}
        onChanged={refresh}
      />
    </div>
  );
}

function ReportsTab({ project, onRequested }: { project: Project; onRequested: () => void }) {
  const [reports, setReports] = useState<ReportInfo[]>([]);
  const [open, setOpen] = useState<ReportInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => api.listReports(project.id).then((r) => setReports(r.reports));

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const requestFromAgent = (reportType: string, label: string) =>
    api.createRequest(project.id, 'report', { report_type: reportType }).then(() => {
      setMsg(`${label} isteği kuyruğa eklendi — ajanın bir sonraki adımında yazılır.`);
      onRequested();
    });

  const cards = [
    {
      key: 'change',
      title: 'Change',
      desc: 'Doc statuses + recent git history. Generated instantly by kortext.',
      action: 'Generate now',
      run: () => api.generateChangeReport(project.id).then(refresh),
      disabled: false,
    },
    {
      key: 'risk',
      title: 'Risk & Recommendations',
      desc: 'Written by your agent from the project state.',
      action: 'Request from agent',
      run: () => requestFromAgent('risk', 'Risk & Recommendations'),
      disabled: false,
    },
    {
      key: 'decisions',
      title: 'Decision Summary',
      desc: 'Written by your agent from decisions.md and the docs.',
      action: 'Request from agent',
      run: () => requestFromAgent('decisions', 'Decision Summary'),
      disabled: false,
    },
    {
      key: 'progress',
      title: 'Progress',
      desc: 'Task progress — available once the project is transferred to Kopeng.',
      action: 'Kopeng not connected',
      run: () => {},
      disabled: true,
    },
  ];

  return (
    <div className="kx-reports">
      {msg && (
        <div className="kx-info" onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}
      <div className="kx-report-cards">
        {cards.map((c) => (
          <div key={c.key} className={`kx-report-card${c.disabled ? ' disabled' : ''}`}>
            <span className="kx-report-title">{c.title}</span>
            <span className="kx-report-desc">{c.desc}</span>
            <button className="btn btn-sm" disabled={c.disabled} onClick={c.run}>
              {c.action}
            </button>
          </div>
        ))}
      </div>
      <section>
        <h2 className="kx-doc-group">History</h2>
        {reports.length === 0 && <div className="kx-empty">No reports yet.</div>}
        {reports.map((r) => (
          <button key={r.rel} className="kx-doc-row" onClick={() => setOpen(r)}>
            <span className="kx-doc-name">{r.name}</span>
            {r.type && <span className="kx-req-type">{r.type}</span>}
            <span className="kx-doc-spacer" />
            <span className="kx-req-when">{r.created_at.slice(0, 16).replace('T', ' ')}</span>
          </button>
        ))}
      </section>
      <DocDrawer
        project={project}
        doc={
          open
            ? {
                rel: open.rel,
                group: 'references',
                name: open.name,
                status: 'report',
                author: null,
                inputs: [],
                blocked: false,
                revisionPending: false,
                upstreamChanged: false,
              }
            : null
        }
        onClose={() => setOpen(null)}
        onChanged={refresh}
      />
    </div>
  );
}

function ConnectTab({
  project,
  pending,
  onChanged,
}: {
  project: Project;
  pending: KortextRequest[];
  onChanged: () => void;
}) {
  const port = window.location.port || '4200';
  const cli = `cd ${project.repo_path} && claude "Read AGENTS.md and start the analysis."`;
  const prompt = 'Read AGENTS.md and start the analysis.';
  const mcp = `claude mcp add --transport http kortext http://localhost:${port}/mcp`;

  return (
    <div className="kx-connect">
      <CommandCard
        title="Terminal (Claude Code / Codex CLI)"
        hint="Paste in your terminal — the agent finds the repo and the contract."
        command={cli}
      />
      <CommandCard
        title="Desktop app"
        hint="Open the project folder in your agent's app, then paste this prompt."
        command={prompt}
      />
      <CommandCard
        title="MCP connection (once per machine)"
        hint="Lets the agent see panel requests (revise notes, report asks)."
        command={mcp}
      />
      <section className="kx-requests">
        <h2>Pending requests {pending.length > 0 && <span className="kx-badge">{pending.length}</span>}</h2>
        {pending.length === 0 && (
          <div className="kx-empty">No pending requests. Notes and report asks queue up here for your agent.</div>
        )}
        {pending.map((r) => (
          <div key={r.id} className="kx-request-row">
            <span className={`kx-req-type kx-req-${r.type}`}>{r.type}</span>
            <span className="kx-req-payload mono">{r.payload}</span>
            <span className="kx-req-when">{r.created_at}</span>
            <button
              className="btn btn-sm"
              onClick={() => api.cancelRequest(r.id).then(onChanged)}
            >
              Cancel
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

function CommandCard({ title, hint, command }: { title: string; hint: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="kx-cmd-card">
      <div className="kx-cmd-head">
        <span className="kx-cmd-title">{title}</span>
        <button
          className="btn btn-sm"
          onClick={() => {
            navigator.clipboard.writeText(command).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code className="kx-cmd mono">{command}</code>
      <span className="kx-cmd-hint">{hint}</span>
    </div>
  );
}
