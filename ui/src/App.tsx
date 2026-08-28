import { useEffect, useState } from 'react';
import { api, type Project } from './api';

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
        <div className="kx-empty">
          Agent connection commands (CLI one-liner, MCP add) land here in E2.
        </div>
      )}
    </main>
  );
}
