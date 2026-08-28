import { useEffect, useState } from 'react';
import { api, type KortextRequest, type Project } from './api';

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
      {tab === 'documents' && (
        <div className="kx-empty">
          Analysis documents will appear here as your agent produces them (E3).
        </div>
      )}
      {tab === 'reports' && <div className="kx-empty">Reports land here in E4.</div>}
      {tab === 'connect' && (
        <ConnectTab project={project} pending={pending} onChanged={refreshRequests} />
      )}
    </main>
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
