import { useEffect, useState } from 'react';
import { api, type DocInfo, type EngineInfo, type HandshakeState, type Job, type Project } from './api';
import { DocDrawer, StatusBadge } from './DocDrawer';

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
                <span className="kx-card-name">{p.name}</span>
                <span className="kx-card-path mono">{p.repo_path}</span>
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
        Ajan CLI bulunamadı — belge üretimi için gerekli. Kur: <code className="mono">{hint}</code>
      </span>
    );
  }
  return (
    <span className="kx-engine">
      Motor:
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
          ? 'Sıfırdan ürün: ajan new-project-analysis akışını koşar.'
          : 'Var olan kod tabanı: ajan existing-project-analysis ile mevcut durumu belgeler.'}
      </span>
      <div className="kx-form-row">
        <input
          className="kx-input kx-path"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="kx-input mono kx-code"
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
          Existing projede brief alınmaz — analiz kod gerçeğinden çıkar; Add deyince başlar.
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
        <h1>{project.name}</h1>
        <span className="kx-card-path mono">{project.repo_path}</span>
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
      title: 'Analiz et ve geliştirmeye başla',
      command: 'Read AGENTS.md and the .kortext/ guideline docs, then start building.',
    },
    {
      title: 'Önce görevlere böl',
      command: 'Read AGENTS.md, break the work into tasks first and show me the list.',
    },
    {
      title: 'Belirli bir işle başla',
      command: 'Read AGENTS.md, then start with: <işi buraya yaz>',
    },
  ];

  return (
    <div className="kx-handshake">
      <div className="kx-handshake-head">
        <span className="kx-handshake-title">✓ Analysis complete — el sıkışma tamam</span>
        <span className="kx-cmd-hint">
          Kortext görevini bitirdi; belgeler artık projenin kutsal guideline'ı. Bundan sonrası
          senin istemcinle aranızda.
        </span>
      </div>
      {state.kopengInstalled ? (
        <div className="kx-handshake-kopeng">
          <button className="btn btn-primary" disabled title="R5 ile geliyor">
            Kopeng'e aktar
          </button>
          <span className="kx-cmd-hint">
            İşi görevlere böler ve .kopeng/ altına Kopeng board'unun okuyacağı dosyaları koyar.
            {state.transferred ? ' (Aktarılmış görünüyor.)' : ''}
          </span>
        </div>
      ) : (
        <div className="kx-handshake-promo">
          <span className="kx-cmd-title">Görevleri board'da izlemek ister misin?</span>
          <span className="kx-cmd-hint">
            Kopeng, ajanının işlerini kanban'da izlediğin tamamlayıcı üründür — ajan görev çeker,
            sen izlersin. Kur ve "Kopeng'e aktar" butonu burada belirsin:
          </span>
          <code className="kx-cmd mono">npm install -g kopeng</code>
        </div>
      )}
      <div className="kx-handshake-cards">
        {instructions.map((c) => (
          <CommandCard key={c.title} title={c.title} hint="İstemcine (CLI ya da uygulama) yapıştır." command={c.command} />
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
    { key: 'foundation', title: 'Foundation' },
    { key: 'core', title: 'Core' },
  ];

  return (
    <div className="kx-docs">
      <HandshakeCard project={project} />
      {err && <div className="kx-error">{err}</div>}
      <div className="kx-docs-toolbar">
        {jobs.some((j) => j.status === 'running') ? (
          <span className="kx-running">
            ⟳ {jobs.filter((j) => j.status === 'running').map((j) => j.doc_rel).join(' · ')} yazılıyor…
          </span>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={runNext}>
            Run next step
          </button>
        )}
      </div>
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="kx-doc-group">{g.title}</h2>
          {ordered
            .filter((d) => d.group === g.key)
            .map((d) => {
              const job = jobFor(d.rel);
              const isRunning = job?.status === 'running';
              const failed = job?.status === 'failed' && d.status === 'uninitialized';
              return (
                <button key={d.rel} className={`kx-doc-row${failed ? ' failed' : ''}`} onClick={() => setOpen(d)}>
                  <span className="kx-doc-name">{d.name}</span>
                  {d.author && <span className="kx-doc-author mono">{d.author}</span>}
                  <span className="kx-doc-spacer" />
                  {isRunning && <span className="kx-running">⟳ yazılıyor…</span>}
                  {failed && (
                    <>
                      <span className="kx-doc-fail" title={job?.error ?? ''}>
                        adım başarısız
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
