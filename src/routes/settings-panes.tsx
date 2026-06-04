import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Cloud,
  CreditCard,
  EyeOff,
  FileText,
  Code2,
  GitMerge,
  Info,
  Lock,
  Plus,
  Send,
  MessageSquare,
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { PageHeader } from '../components/PageHeader.tsx';
import { PersonaEditor } from '../components/PersonaEditor.tsx';
import { apiGet, apiPut, apiDelete, usePolling } from '../lib/api.ts';
import type { PersonaSummary, WorkflowSummary, WorkflowDetail, ProjectMeta } from '../lib/api-types.ts';
import { personaColor, personaIcon } from '../lib/persona-colors.ts';
import { groupWorkflowByPhase } from '../lib/workflow-diagram.ts';

marked.setOptions({ gfm: true, breaks: false });

// ─────────────────────────────────── Project settings

const PLATFORM_OPTIONS = ['Web', 'iOS', 'Android', 'Desktop'];

type ProjectForm = { name: string; code: string; githubRepo: string; platforms: string[] };

export function ProjectPane() {
  const { data, error, refresh } = usePolling<{ meta: ProjectMeta | null }>(
    '/api/project-meta',
    30_000,
  );
  const meta = data?.meta ?? null;

  const [form, setForm] = useState<ProjectForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Hydrate the editable form once the meta arrives (and re-sync after a save).
  useEffect(() => {
    if (meta && form === null) {
      setForm({
        name: meta.name,
        code: meta.code,
        githubRepo: meta.githubRepo ?? '',
        platforms: meta.platforms,
      });
    }
  }, [meta, form]);

  const dirty =
    !!meta &&
    !!form &&
    (form.name !== meta.name ||
      form.code !== meta.code ||
      form.githubRepo !== (meta.githubRepo ?? '') ||
      form.platforms.join(',') !== meta.platforms.join(','));

  function patch(p: Partial<ProjectForm>) {
    setForm((f) => (f ? { ...f, ...p } : f));
    setSaved(false);
  }

  function togglePlatform(name: string) {
    if (!form) return;
    const has = form.platforms.includes(name);
    patch({
      platforms: has
        ? form.platforms.filter((p) => p !== name)
        : [...form.platforms, name],
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setSaveError(null);
    try {
      await apiPut('/api/project-meta', {
        name: form.name,
        code: form.code,
        githubRepo: form.githubRepo.trim() === '' ? null : form.githubRepo.trim(),
        platforms: form.platforms,
      });
      setForm(null); // re-hydrate from the refreshed meta
      setSaved(true);
      refresh();
    } catch (e) {
      setSaveError(mutationError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Project settings" subtitle="Core identity and workspace" />
      <div className="px-6 py-5 max-w-4xl flex flex-col">
        {error && !meta && <div className="text-[12px] text-danger mb-3">{error}</div>}
        {!meta && !error && <div className="text-[12px] text-tx-3">loading…</div>}
        {form && (
          <>
            <FieldRow
              label="Project name"
              desc="Displayed in topbar and reports"
              control={
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  style={{ width: 280 }}
                />
              }
            />
            <FieldRow
              label="Project code"
              desc="Slug used in task IDs (e.g. ACME-T-101)"
              control={
                <input
                  className="input mono"
                  value={form.code}
                  onChange={(e) => patch({ code: e.target.value })}
                  style={{ width: 200 }}
                />
              }
            />
            <FieldRow
              label="Target platform"
              desc="Multiple allowed · affects stack defaults"
              control={
                <div className="flex gap-1.5">
                  {PLATFORM_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={form.platforms.includes(p) ? 'btn btn-primary btn-xs' : 'btn btn-outline btn-xs'}
                      onClick={() => togglePlatform(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              }
            />
            <FieldRow
              label="GitHub repository"
              desc="Where agents commit"
              control={
                <div className="flex items-center gap-2">
                  <input
                    className="input mono"
                    placeholder="github.com/owner/repo"
                    value={form.githubRepo}
                    onChange={(e) => patch({ githubRepo: e.target.value })}
                    style={{ width: 320 }}
                  />
                  {form.githubRepo.trim() !== '' && (
                    <a
                      className="btn btn-ghost btn-xs"
                      href={`https://${form.githubRepo.replace(/^https?:\/\//, '')}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  )}
                </div>
              }
            />

            <div className="mt-6 flex items-center gap-3">
              <button className="btn btn-primary btn-xs" disabled={busy || !dirty} onClick={save}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              {saved && !dirty && <span className="text-[12px] text-success">Saved ✓</span>}
              {saveError && <span className="text-[12px] text-danger">{saveError}</span>}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────── Agents (merged with Models)

type ModelTier = 'orchestrator' | 'manager' | 'specialist' | 'utility';
type CostTier = '$' | '$$$' | '$$$$';

const PERSONA_META: Record<string, { role: string; tier: ModelTier; cost: CostTier; models: string[]; status: 'working' | 'idle' | 'blocked' }> = {
  '+operation-manager': { role: 'Orchestrator', tier: 'orchestrator', cost: '$$$$', models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'], status: 'working' },
  '+product-manager': { role: 'Product strategy & backlog', tier: 'manager', cost: '$$$', models: ['claude-sonnet-4-6', 'claude-opus-4-7'], status: 'working' },
  '+engineering-manager': { role: 'Code & architecture review', tier: 'manager', cost: '$$$$', models: ['claude-opus-4-7', 'claude-sonnet-4-6'], status: 'working' },
  '+delivery-manager': { role: 'Release & hotfix', tier: 'manager', cost: '$', models: ['claude-haiku-4-5', 'claude-sonnet-4-6'], status: 'idle' },
  '+backend-developer': { role: 'Server & APIs', tier: 'specialist', cost: '$$$', models: ['claude-sonnet-4-6', 'claude-opus-4-7'], status: 'working' },
  '+frontend-developer': { role: 'UI & client logic', tier: 'specialist', cost: '$$$', models: ['claude-sonnet-4-6', 'claude-haiku-4-5'], status: 'working' },
  '+designer': { role: 'UI/UX design', tier: 'specialist', cost: '$$$', models: ['claude-sonnet-4-6'], status: 'working' },
  '+qa-engineer': { role: 'Tests & verification', tier: 'utility', cost: '$', models: ['claude-haiku-4-5', 'claude-sonnet-4-6'], status: 'working' },
  '+db-admin': { role: 'Schemas & migrations', tier: 'utility', cost: '$', models: ['claude-haiku-4-5'], status: 'idle' },
  '+devops-engineer': { role: 'Infrastructure & CI/CD', tier: 'utility', cost: '$', models: ['claude-haiku-4-5'], status: 'blocked' },
  '+security-engineer': { role: 'Security audits & OWASP', tier: 'specialist', cost: '$$$', models: ['claude-sonnet-4-6'], status: 'idle' },
  '+copywriter': { role: 'Product & marketing copy', tier: 'specialist', cost: '$$$', models: ['claude-sonnet-4-6'], status: 'working' },
  '+compliance-expert': { role: 'Legal & GDPR', tier: 'utility', cost: '$', models: ['claude-haiku-4-5'], status: 'idle' },
  '+growth-expert': { role: 'Acquisition & metrics', tier: 'utility', cost: '$', models: ['claude-haiku-4-5'], status: 'idle' },
};

export function AgentsPane() {
  const { data } = usePolling<{ personas: PersonaSummary[] }>('/api/personas', 30_000);
  const personas = data?.personas ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  const enriched = personas.map((p) => ({
    ...p,
    meta: PERSONA_META[p.handle.startsWith('+') ? p.handle : `+${p.handle}`],
  }));
  const working = enriched.filter((p) => p.meta?.status === 'working').length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Agents"
        subtitle={`${personas.length} personas · ${working} active · configure model + view live status / identity`}
      />
      <div className="px-6 py-5 flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.08em] text-tx-3 font-semibold mr-1">Quick preset</span>
          <button className="btn btn-outline btn-xs">All Opus</button>
          <button className="btn btn-outline btn-xs">All Sonnet</button>
          <button className="btn btn-outline btn-xs">All Haiku</button>
          <button className="btn btn-primary btn-xs">Balanced</button>
          <span className="flex-1" />
          <span className="text-[12px] text-tx-3">
            Daily est. <span className="mono text-tx-1">$4.30</span> · Monthly <span className="mono text-tx-1">$129</span>
          </span>
        </div>

        <div className="rounded-lg border border-border-default overflow-hidden">
          <div
            className="grid px-4 py-2.5 border-b border-border-default bg-bg-1 text-[11px] uppercase tracking-[0.08em] text-tx-3 font-semibold"
            style={{ gridTemplateColumns: '32px 1.4fr 90px 1fr 90px 50px', gap: 12 }}
          >
            <div />
            <div>Persona · Role</div>
            <div>Status</div>
            <div>Model</div>
            <div>Tier</div>
            <div>Cost</div>
          </div>
          {enriched.length === 0 && (
            <div className="px-4 py-6 text-[12px] text-tx-3">no personas loaded</div>
          )}
          {enriched.map((p) => {
            const handle = p.handle.startsWith('+') ? p.handle : `+${p.handle}`;
            const meta = p.meta;
            const Icon = personaIcon(handle);
            return (
              <button
                key={handle}
                type="button"
                onClick={() => setSelected(handle)}
                className="grid w-full items-center px-4 py-2.5 text-left border-b border-border-subtle last:border-b-0 hover:bg-bg-1 transition-colors"
                style={{ gridTemplateColumns: '32px 1.4fr 90px 1fr 90px 50px', gap: 12 }}
              >
                <span
                  className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full"
                  style={{ background: personaColor(handle), color: '#0A0814' }}
                  aria-hidden
                >
                  <Icon size={13} strokeWidth={2.5} />
                </span>
                <div>
                  <div className="mono text-[13px]" style={{ color: personaColor(handle) }}>{handle}</div>
                  <div className="text-[11px] text-tx-3 mt-0.5">{meta?.role ?? 'persona'}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusDot status={meta?.status ?? 'idle'} />
                  <span className="text-[12px]" style={{ color: statusColor(meta?.status ?? 'idle') }}>
                    {meta?.status ?? 'idle'}
                  </span>
                </div>
                <select
                  className="input mono"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={(e) => e.stopPropagation()}
                  defaultValue={meta?.models[0]}
                >
                  {(meta?.models ?? ['claude-sonnet-4-6']).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <Badge tone={tierTone(meta?.tier)}>{meta?.tier ?? 'persona'}</Badge>
                <span className="mono text-[12px] text-tx-3">{meta?.cost ?? '—'}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-tx-3">
          Model changes take effect on next pipeline run. Click any row to view live status & persona definition.
        </p>

        {selected && (
          <div className="rounded-lg border border-border-default bg-bg-1 mt-2">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
              <div className="flex items-center gap-2 mono text-[13px]" style={{ color: personaColor(selected) }}>
                {selected}
                <span className="text-[11px] text-tx-3">— inline editor</span>
              </div>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="p-2">
              <PersonaEditor />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: 'working' | 'idle' | 'blocked' }) {
  const cls = status === 'working' ? 'dot-success dot-pulse' : status === 'blocked' ? 'dot-danger' : 'dot-warning';
  return <span className={`dot ${cls}`} />;
}
function statusColor(status: 'working' | 'idle' | 'blocked'): string {
  if (status === 'working') return 'var(--success)';
  if (status === 'blocked') return 'var(--danger)';
  return 'var(--warning)';
}
function tierTone(tier?: ModelTier): BadgeTone {
  if (tier === 'orchestrator' || tier === 'manager') return 'purple';
  if (tier === 'specialist') return 'blue';
  return 'neutral';
}

// ─────────────────────────────────── Rules

const RULE_FILES = ['behavior.md', 'branching.md', 'commands.md', 'emergency.md', 'models.md'];

export function RulesPane() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Rules"
        subtitle="Behavior, branching, commands, models · markdown definitions"
      />
      <div className="px-6 py-5 flex-1 min-h-0">
        <MarkdownFileShell scope="rules" knownFiles={RULE_FILES} />
      </div>
    </div>
  );
}

// ─────────────────────────────────── Workflows (editor + diagram)

export function WorkflowsPane() {
  const { data } = usePolling<{ workflows: WorkflowSummary[] }>('/api/workflows', 30_000);
  const wfs = data?.workflows ?? [];
  const [mode, setMode] = useState<'editor' | 'diagram'>('editor');

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Workflows"
        subtitle={`${wfs.length} pipeline definitions · markdown source + visual flow`}
      />
      <div className="px-6 py-5 flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex gap-1">
          <button
            className={mode === 'editor' ? 'btn btn-primary btn-xs' : 'btn btn-ghost btn-xs'}
            onClick={() => setMode('editor')}
          >
            Markdown editor
          </button>
          <button
            className={mode === 'diagram' ? 'btn btn-primary btn-xs' : 'btn btn-ghost btn-xs'}
            onClick={() => setMode('diagram')}
          >
            Visual flow
          </button>
        </div>

        {mode === 'editor' ? (
          <div className="flex-1 min-h-0">
            <MarkdownFileShell scope="workflows" knownFiles={wfs.map((w) => `${w.id}.md`)} />
          </div>
        ) : (
          <WorkflowDiagram workflows={wfs} />
        )}
      </div>
    </div>
  );
}

function WorkflowDiagram({ workflows }: { workflows: WorkflowSummary[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const id = selectedId ?? workflows[0]?.id ?? null;

  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setWf(null);
      return;
    }
    let alive = true;
    setWf(null);
    setError(null);
    apiGet<{ workflow: WorkflowDetail }>(`/api/workflows/${encodeURIComponent(id)}`)
      .then((r) => alive && setWf(r.workflow))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  const phases = wf ? groupWorkflowByPhase(wf) : [];

  return (
    <div className="border border-border-default rounded-lg p-5 bg-bg-1 overflow-x-auto">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] uppercase tracking-[0.06em] text-tx-3 font-semibold">
          visual flow
        </span>
        {workflows.length > 0 && (
          <select
            className="input mono"
            style={{ padding: '4px 8px', fontSize: 12 }}
            value={id ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>{w.id}</option>
            ))}
          </select>
        )}
        {wf?.nextWorkflowId && (
          <span className="text-[12px] text-tx-3">
            next → <code className="mono">{wf.nextWorkflowId}</code>
          </span>
        )}
      </div>
      {workflows.length === 0 && <p className="text-[12px] text-tx-3">no workflows loaded</p>}
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {id && !wf && !error && <p className="text-[12px] text-tx-3">loading…</p>}
      {wf && phases.length === 0 && (
        <p className="text-[12px] text-tx-3">this workflow has no parsed steps</p>
      )}
      {phases.length > 0 && (
        <div className="flex flex-col gap-4">
          {phases.map((p) => (
            <div key={p.phase} className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.06em] text-accent font-semibold">
                {p.phase}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {p.steps.map((s, i) => (
                  <span key={s.key} className="flex items-center gap-2">
                    <span className="inline-flex flex-col gap-1 px-3 py-2 rounded-md border border-border-default bg-bg-0 min-w-[180px] max-w-[260px]">
                      <span className="text-[10px] uppercase tracking-[0.06em] text-tx-3 font-semibold">
                        Step {s.index + 1}
                        {s.persona && (
                          <span className="ml-1.5 normal-case" style={{ color: personaColor(s.persona) }}>
                            {s.persona}
                          </span>
                        )}
                      </span>
                      <span className="text-[12px] text-tx-1 line-clamp-2">
                        {s.description || s.key}
                      </span>
                    </span>
                    {i < p.steps.length - 1 && <span className="text-tx-3">→</span>}
                  </span>
                ))}
                {p.gates.map((g, gi) => (
                  <span key={gi} className="flex items-center gap-2">
                    <span className="text-tx-3">→</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-warning/40 bg-warning/5 text-[11px] text-warning">
                      <GitMerge className="w-3 h-3" />
                      gate{g.approver ? ` · ${g.approver}` : ''}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────── Hooks

type Hook = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  command: string;
};

export function HooksPane() {
  const { data, error, refresh } = usePolling<{ hooks: Hook[] }>('/api/hooks', 30_000);
  const hooks = data?.hooks ?? [];
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function toggle(target: Hook) {
    setSaving(true);
    setSaveError(null);
    try {
      const next = hooks.map((h) => ({
        id: h.id,
        enabled: h.id === target.id ? !h.enabled : h.enabled,
        command: h.command,
      }));
      await apiPut('/api/hooks', { hooks: next });
      refresh();
    } catch (e) {
      setSaveError(mutationError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Hooks"
        subtitle="Lifecycle event listeners · toggle to enable/disable"
      />
      <div className="px-6 py-5 max-w-4xl">
        {error && hooks.length === 0 && (
          <div className="text-[12px] text-danger mb-3">{error}</div>
        )}
        {saveError && <div className="text-[12px] text-danger mb-3">{saveError}</div>}
        <div className="rounded-lg border border-border-default overflow-hidden">
          {hooks.length === 0 && (
            <div className="px-4 py-6 text-[12px] text-tx-3">loading hooks…</div>
          )}
          {hooks.map((h, i) => (
            <div
              key={h.id}
              className={[
                'flex items-center justify-between gap-4 px-4 py-3',
                i < hooks.length - 1 ? 'border-b border-border-subtle' : '',
              ].join(' ')}
            >
              <div>
                <div className="text-[13px] text-tx-1">{h.label}</div>
                <div className="text-[12px] text-tx-3 mt-0.5">{h.description}</div>
              </div>
              <LiveToggle on={h.enabled} disabled={saving} onToggle={() => toggle(h)} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────── Integrations

type Integration = {
  id: string;
  label: string;
  connected: boolean;
  tokenMasked: string | null;
};

const INTEGRATION_ICONS: Record<string, ReactNode> = {
  github: <Code2 className="w-4 h-4" />,
  vercel: <Cloud className="w-4 h-4" />,
  stripe: <CreditCard className="w-4 h-4" />,
  auth0: <Lock className="w-4 h-4" />,
  slack: <MessageSquare className="w-4 h-4" />,
  telegram: <Send className="w-4 h-4" />,
};

export function IntegrationsPane() {
  const { data, error, refresh } = usePolling<{ integrations: Integration[] }>(
    '/api/integrations',
    30_000,
  );
  const integrations = data?.integrations ?? [];

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="External services · store a token to connect (no live calls yet)"
      />
      <div className="px-6 py-5 max-w-4xl flex flex-col gap-3">
        {error && integrations.length === 0 && (
          <div className="text-[12px] text-danger">{error}</div>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {integrations.map((i) => (
            <IntegrationCard key={i.id} integration={i} onChanged={refresh} />
          ))}
        </div>
      </div>
    </>
  );
}

function IntegrationCard({
  integration,
  onChanged,
}: {
  integration: Integration;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dim = !integration.connected && !editing;

  async function connect() {
    if (token.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiPut(`/api/integrations/${integration.id}`, { token: token.trim() });
      setToken('');
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(mutationError(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/integrations/${integration.id}`);
      onChanged();
    } catch (e) {
      setError(mutationError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`border border-border-default rounded-md p-3.5 ${dim ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-2.5 mb-1">
        {INTEGRATION_ICONS[integration.id] ?? <Cloud className="w-4 h-4" />}
        <span className="text-[13px] text-tx-1 font-medium">{integration.label}</span>
        <span className="flex-1" />
        {integration.connected ? (
          <div className="flex items-center gap-2">
            <Badge tone="green">Connected</Badge>
            <button className="btn btn-ghost btn-xs" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          </div>
        ) : editing ? (
          <button className="btn btn-ghost btn-xs" onClick={() => { setEditing(false); setError(null); }}>
            Cancel
          </button>
        ) : (
          <button className="btn btn-outline btn-xs" onClick={() => setEditing(true)}>
            Connect
          </button>
        )}
      </div>
      {integration.connected && (
        <div className="text-[12px] text-tx-3 mono">token {integration.tokenMasked}</div>
      )}
      {!integration.connected && editing && (
        <div className="flex items-center gap-2 mt-2">
          <input
            className="input mono"
            type="password"
            placeholder="paste token / API key"
            value={token}
            autoFocus
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void connect()}
            style={{ flex: 1, fontSize: 12 }}
          />
          <button className="btn btn-primary btn-xs" disabled={busy || token.trim().length === 0} onClick={connect}>
            Save
          </button>
        </div>
      )}
      {!integration.connected && !editing && (
        <div className="text-[12px] text-tx-3 mono">not connected</div>
      )}
      {error && <div className="text-[11px] text-danger mt-1.5">{error}</div>}
    </div>
  );
}

// ─────────────────────────────────── Environment

type EnvVar = { key: string; valueMasked: string };

export function EnvironmentPane() {
  const { data, error, refresh } = usePolling<{ vars: EnvVar[] }>('/api/env', 30_000);
  const vars = data?.vars ?? [];

  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function save(key: string, value: string) {
    setBusy(true);
    setActionError(null);
    try {
      await apiPut(`/api/env/${encodeURIComponent(key)}`, { value });
      setAdding(false);
      setNewKey('');
      setNewValue('');
      setEditKey(null);
      setEditValue('');
      refresh();
    } catch (e) {
      setActionError(mutationError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(key: string) {
    setBusy(true);
    setActionError(null);
    try {
      await apiDelete(`/api/env/${encodeURIComponent(key)}`);
      refresh();
    } catch (e) {
      setActionError(mutationError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Environment"
        subtitle="Project-specific variables and secrets available to agents"
      />
      <div className="px-6 py-5 max-w-5xl flex flex-col gap-3">
        {error && vars.length === 0 && (
          <div className="text-[12px] text-danger">{error}</div>
        )}
        {actionError && <div className="text-[12px] text-danger">{actionError}</div>}
        <div className="rounded-lg border border-border-default overflow-hidden">
          <div
            className="grid px-4 py-2.5 border-b border-border-default bg-bg-1 text-[11px] uppercase tracking-[0.08em] text-tx-3 font-semibold"
            style={{ gridTemplateColumns: '1fr 1fr 120px', gap: 12 }}
          >
            <div>Key</div>
            <div>Value</div>
            <div />
          </div>
          {vars.length === 0 && !adding && (
            <div className="px-4 py-6 text-[12px] text-tx-3">
              No variables yet. Add one below.
            </div>
          )}
          {vars.map((v) => (
            <div
              key={v.key}
              className="grid items-center px-4 py-2.5 border-b border-border-subtle last:border-b-0"
              style={{ gridTemplateColumns: '1fr 1fr 120px', gap: 12 }}
            >
              <span className="mono text-[12px] text-tx-2">{v.key}</span>
              {editKey === v.key ? (
                <input
                  className="input mono"
                  type="password"
                  placeholder="new value"
                  value={editValue}
                  autoFocus
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void save(v.key, editValue)}
                  style={{ fontSize: 12 }}
                />
              ) : (
                <span className="mono text-[12px] text-tx-3 flex items-center gap-1.5">
                  {v.valueMasked}
                  <EyeOff className="w-3 h-3 text-tx-disabled" />
                </span>
              )}
              <div className="flex items-center gap-1.5 justify-end">
                {editKey === v.key ? (
                  <>
                    <button className="btn btn-primary btn-xs" disabled={busy} onClick={() => save(v.key, editValue)}>Save</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => { setEditKey(null); setEditValue(''); }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-xs" onClick={() => { setEditKey(v.key); setEditValue(''); }}>Edit</button>
                    <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => remove(v.key)} style={{ color: 'var(--danger)' }}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {adding && (
            <div
              className="grid items-center px-4 py-2.5 border-t border-border-subtle bg-bg-1"
              style={{ gridTemplateColumns: '1fr 1fr 120px', gap: 12 }}
            >
              <input
                className="input mono"
                placeholder="KEY_NAME"
                value={newKey}
                autoFocus
                onChange={(e) => setNewKey(e.target.value)}
                style={{ fontSize: 12 }}
              />
              <input
                className="input mono"
                type="password"
                placeholder="value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newKey.trim() && void save(newKey.trim(), newValue)}
                style={{ fontSize: 12 }}
              />
              <div className="flex items-center gap-1.5 justify-end">
                <button className="btn btn-primary btn-xs" disabled={busy || newKey.trim().length === 0} onClick={() => save(newKey.trim(), newValue)}>Add</button>
                <button className="btn btn-ghost btn-xs" onClick={() => { setAdding(false); setNewKey(''); setNewValue(''); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        {!adding && (
          <button className="btn btn-outline btn-xs self-start" onClick={() => setAdding(true)}>
            <Plus className="w-3 h-3" /> Add variable
          </button>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────── Danger zone

export function DangerPane() {
  return (
    <>
      <PageHeader
        title="Danger zone"
        subtitle="Irreversible actions — proceed with caution"
      />
      <div className="px-6 py-5 max-w-4xl flex flex-col gap-3">
        <DangerCard
          title="Archive project"
          desc="Read-only mode. Agents stop, history preserved."
          action={
            <button className="btn btn-outline btn-xs" style={{ borderColor: 'rgba(245,158,11,0.4)', color: 'var(--warning)' }}>
              Archive
            </button>
          }
          tone="amber"
        />
        <DangerCard
          title="Reset memory"
          desc="Clear all decisions, learned items, handovers. Backlog preserved."
          action={
            <button className="btn btn-xs" style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}>
              Reset memory
            </button>
          }
          tone="red"
        />
        <DangerCard
          title="Delete project"
          desc="Permanent. All data removed. Type project code to confirm."
          action={
            <button className="btn btn-xs" style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}>
              Delete
            </button>
          }
          tone="red"
        />
        <div className="rounded-lg border border-danger/40 bg-bg-1 px-4 py-3 mt-1">
          <div className="flex items-center gap-2 text-danger text-[12px] mb-1">
            <AlertTriangle size={13} /> Dashboard wiring lands in v3.2. CLI today: <code className="mono ml-1 text-tx-2">kortext cleanup …</code>
          </div>
        </div>
      </div>
    </>
  );
}

function DangerCard({
  title,
  desc,
  action,
  tone,
}: {
  title: string;
  desc: string;
  action: ReactNode;
  tone: 'amber' | 'red';
}) {
  const border = tone === 'amber' ? 'border-warning/25' : 'border-danger/25';
  return (
    <div className={`rounded-lg border ${border} px-3.5 py-3.5 flex items-center justify-between gap-3`}>
      <div>
        <div className="text-[13px] text-tx-1 font-medium">{title}</div>
        <div className="text-[12px] text-tx-3 mt-0.5">{desc}</div>
      </div>
      {action}
    </div>
  );
}

// ─────────────────────────────────── Shared bits

function FieldRow({
  label,
  desc,
  control,
}: {
  label: string;
  desc: string;
  control: ReactNode;
}) {
  return (
    <div className="grid items-center gap-6 py-3 border-b border-border-subtle last:border-b-0" style={{ gridTemplateColumns: '300px 1fr' }}>
      <div>
        <div className="text-[13px] text-tx-1">{label}</div>
        <div className="text-[12px] text-tx-3 mt-0.5">{desc}</div>
      </div>
      <div>{control}</div>
    </div>
  );
}

/** Controlled toggle — caller owns `on` and persists on change. */
function LiveToggle({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return <ToggleVisual on={on} disabled={disabled} onClick={onToggle} />;
}

function ToggleVisual({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="relative inline-flex items-center w-[40px] h-[22px] rounded-full transition-colors duration-200 disabled:opacity-50"
      style={{ background: on ? 'var(--accent)' : 'var(--bg-3)' }}
    >
      <span
        className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all duration-200"
        style={{ left: on ? 20 : 2 }}
      />
    </button>
  );
}

/** Format an apiPut/apiDelete rejection (ApiPostError-shaped) for display. */
function mutationError(e: unknown): string {
  if (e && typeof e === 'object') {
    const obj = e as { error?: unknown; message?: unknown; details?: unknown };
    if (typeof obj.message === 'string' && obj.message.length > 0) return obj.message;
    if (Array.isArray(obj.details) && obj.details.length > 0) {
      return obj.details.map(String).join('; ');
    }
    if (typeof obj.error === 'string') return obj.error;
  }
  return e instanceof Error ? e.message : String(e);
}

// ─────────────────────────────────── shared markdown file shell (rules + workflows)

function MarkdownFileShell({
  scope,
  knownFiles,
}: {
  scope: string;
  knownFiles: string[];
}) {
  const { data } = usePolling<{ files: { name: string }[] }>(`/api/docs/${scope}`, 15_000);
  const available = useMemo(() => {
    const names = (data?.files ?? []).map((f) => f.name);
    return names.length > 0 ? names : knownFiles;
  }, [data, knownFiles]);

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (selected === null && available.length > 0) setSelected(available[0]!);
  }, [available, selected]);

  return (
    <div
      className="grid gap-0 border border-border-default rounded-lg overflow-hidden min-h-[480px] h-full"
      style={{ gridTemplateColumns: '240px 1fr' }}
    >
      <aside className="bg-bg-1 border-r border-border-default p-2 overflow-y-auto">
        {available.map((f) => {
          const active = f === selected;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setSelected(f)}
              className={[
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors',
                active ? 'bg-accent/10 text-tx-1' : 'text-tx-2 hover:bg-bg-2 hover:text-tx-1',
              ].join(' ')}
            >
              <FileText className="w-3 h-3 text-tx-3 shrink-0" />
              <span className="mono text-[12px] truncate">{f}</span>
            </button>
          );
        })}
      </aside>
      <FileBody scope={scope} file={selected} />
    </div>
  );
}

function FileBody({
  scope,
  file,
}: {
  scope: string;
  file: string | null;
}) {
  const [body, setBody] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    if (!file) {
      setBody('');
      setError(null);
      return;
    }
    let alive = true;
    setBody('');
    setError(null);
    apiGet<{ body: string }>(`/api/docs/${scope}/${file}`)
      .then((r) => alive && setBody(r.body))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [scope, file]);

  // Sanitize marked HTML through DOMPurify before injecting it — same XSS
  // guard as MarkdownViewer / PersonaEditor.
  const html = useMemo(() => {
    if (!body) return '';
    const raw = marked.parse(body, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [body]);

  if (!file) {
    return (
      <section className="flex items-center justify-center text-[13px] text-tx-3">
        Select a file
      </section>
    );
  }

  return (
    <section className="flex flex-col min-w-0">
      <header className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-border-default">
        <div className="flex items-center gap-2 mono text-[12px] text-tx-3">
          <Lock className="w-3 h-3 text-tx-disabled" />
          <span className="text-tx-2">{file}</span>
          <span className="text-tx-disabled">·</span>
          <span>{scope}/ · readonly</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? 'Rendered' : 'View source'}
        </button>
      </header>
      <div className="px-3.5 py-2 flex items-center gap-2 text-[11px] text-tx-3 border-b border-border-subtle">
        <Info className="w-3 h-3 text-tx-disabled" />
        <span>
          Package-owned content. Editing requires forking the kortext npm package — v3.2 will
          revisit.
        </span>
      </div>
      {error && <div className="px-4 py-3 text-[12px] text-danger">{error}</div>}
      {showSource ? (
        <pre className="flex-1 overflow-auto px-3.5 py-3.5 mono text-[12px] leading-[1.65] text-tx-2 whitespace-pre-wrap">
          {body}
        </pre>
      ) : (
        <SanitizedMarkdownArticle html={html} />
      )}
    </section>
  );
}

function SanitizedMarkdownArticle({ html }: { html: string }) {
  // DOMPurify sanitized `html` upstream — see FileBody's useMemo.
  return (
    <article
      className="prose-markdown overflow-y-auto px-5 py-4 text-[13px] leading-[1.65]"
      // eslint-disable-next-line react/no-danger -- input pre-sanitized via DOMPurify
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─────────────────────────────────── badge

type BadgeTone = 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'neutral';

function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const presets: Record<BadgeTone, { color: string; bg: string }> = {
    purple: { color: 'var(--accent-soft)', bg: 'rgba(168,85,247,0.15)' },
    blue: { color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' },
    green: { color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
    amber: { color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' },
    red: { color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' },
    neutral: { color: 'var(--tx-2)', bg: 'rgba(255,255,255,0.06)' },
  };
  const { color, bg } = presets[tone];
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded leading-tight"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}
