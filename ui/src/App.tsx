import { useEffect, useState } from 'react';
import { api, type DocInfo, type KortextRequest, type PlanState, type Project, type ReportInfo } from './api';
import { DocDrawer, StatusBadge } from './DocDrawer';

type Tab = 'documents' | 'plan' | 'reports' | 'connect';

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

  const [initialTab, setInitialTab] = useState<Tab>('documents');

  return (
    <div className="kx-shell">
      <header className="kx-header">
        <span className="kx-logo">Kortext</span>
        <span className="kx-tagline">project brain</span>
      </header>
      {error && <div className="kx-error">{error}</div>}
      {selected ? (
        <ProjectScreen
          key={selected.id}
          project={selected}
          initialTab={initialTab}
          onBack={() => {
            setSelected(null);
            setInitialTab('documents');
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
                <span className="kx-card-name">{p.name}</span>
                <span className="kx-card-path mono">{p.repo_path}</span>
              </button>
            ))}
          </div>
          {adding && (
            <AddProject
              onDone={(project, hadBrief) => {
                setAdding(false);
                refresh();
                // A written/uploaded brief is already approved — go straight to
                // Connect so the agent can be started; otherwise the BRD still
                // needs filling in Documents.
                setInitialTab(hadBrief ? 'connect' : 'documents');
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

const BRIEF_EXAMPLE = `# Acme CRM

## Ne yapıyoruz
Küçük ekipler için basit bir CRM: müşteri kartları, görüşme notları, hatırlatmalar.

## Kimin için
5-20 kişilik satış ekipleri; teknik olmayan kullanıcılar.

## Kapsam
- Müşteri listesi + detay kartı
- Görüşme notu ekleme
- Hatırlatma (e-posta)
MVP: en fazla 8 item.

## Kapsam dışı
Faturalama, telefon entegrasyonu.`;

function AddProject({
  onDone,
  onCancel,
}: {
  onDone: (project: Project, hadBrief: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
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
      const { project } = await api.createProject({ name, repoPath, brief: brief || undefined });
      onDone(project, brief.trim().length > 0);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="kx-form">
      <input
        className="kx-input"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
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
              placeholder="Projenin brief'ini buraya yaz: ne yapıyoruz, kimin için, kapsam, kapsam dışı… (Boş bırakırsan sonra Documents'tan doldurursun.)"
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
                <strong>{uploadName}</strong> yüklendi ({brief.length} karakter) — değiştirmek için
                tekrar tıkla, düzenlemek için Write sekmesi.
              </span>
            ) : (
              <span>.md / .txt brief dosyanı seçmek için tıkla</span>
            )}
          </label>
        )}
        <span className="kx-cmd-hint">
          Brief'ini yazar ya da yüklersen onaylı BRD olarak kaydedilir ve seni doğrudan Connect
          ekranına götürür; boş bırakırsan Documents'tan doldurup onaylarsın.
        </span>
      </div>
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

function ProjectScreen({
  project,
  onBack,
  initialTab = 'documents',
}: {
  project: Project;
  onBack: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
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
        {(['documents', 'plan', 'reports', 'connect'] as Tab[]).map((t) => (
          <button key={t} className={`kx-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'documents' ? 'Documents' : t === 'plan' ? 'Plan' : t === 'reports' ? 'Reports' : 'Connect'}
            {t === 'connect' && pending.length > 0 && <span className="kx-badge">{pending.length}</span>}
          </button>
        ))}
      </nav>
      {tab === 'documents' && <DocumentsTab project={project} />}
      {tab === 'plan' && <PlanTab project={project} onRequested={refreshRequests} />}
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

  const groups: { key: 'core' | 'foundation'; title: string }[] = [
    { key: 'foundation', title: 'Foundation' },
    { key: 'core', title: 'Core' },
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

function PlanTab({ project, onRequested }: { project: Project; onRequested: () => void }) {
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [todoOpen, setTodoOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => api.planState(project.id).then(setPlan);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  if (!plan) return <div className="kx-empty">Loading…</div>;

  const transfer = () =>
    api.createRequest(project.id, 'planning', {}).then(() => {
      setMsg('Planlama isteği kuyruğa eklendi — ajan, analiz onayları tamamlandığında backlog + TODO üretir.');
      onRequested();
      refresh();
    });

  return (
    <div className="kx-plan">
      {msg && (
        <div className="kx-info" onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}
      {!plan.todoExists && !plan.planningPending && (
        <div className="kx-plan-cta">
          <p>
            No plan yet — and that's the default. Kortext creates tasks only when you ask for the
            transfer; until then the project stays analysis-only.
          </p>
          <button className="btn btn-primary" onClick={transfer}>
            Kopeng'e aktar
          </button>
          <span className="kx-cmd-hint">
            Queues a planning request. Your agent produces backlog.yaml + TODO.md; live Kopeng board
            push arrives when Kopeng is ready — the export file format is already frozen.
          </span>
        </div>
      )}
      {plan.planningPending && (
        <div className="kx-empty">
          Planning request queued — run your agent; it will produce the backlog once analysis
          approvals are complete.
        </div>
      )}
      {plan.todoExists && (
        <div className="kx-plan-ready">
          <div className="kx-plan-row">
            <span className="kx-doc-name">TODO.md</span>
            <StatusBadge
              doc={{
                rel: 'TODO.md',
                group: 'core',
                name: 'TODO',
                status: plan.todoStatus ?? 'draft',
                author: '+operation-manager',
                inputs: [],
                blocked: false,
                revisionPending: false,
                upstreamChanged: false,
              }}
            />
            <span className="kx-doc-spacer" />
            <button className="btn btn-sm" onClick={() => setTodoOpen(true)}>
              Open
            </button>
          </div>
          {plan.backlogExists && (
            <span className="kx-cmd-hint">
              backlog.yaml is in .kortext/foundation/ — the frozen export contract Kopeng will
              consume.
            </span>
          )}
        </div>
      )}
      <DocDrawer
        project={project}
        doc={
          todoOpen
            ? {
                rel: 'TODO.md',
                group: 'core',
                name: 'TODO',
                status: plan.todoStatus ?? 'draft',
                author: '+operation-manager',
                inputs: [],
                blocked: false,
                revisionPending: false,
                upstreamChanged: false,
              }
            : null
        }
        onClose={() => setTodoOpen(false)}
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
                group: 'core',
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
