import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Cloud,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Code2,
  GitMerge,
  Lock,
  Plus,
  Send,
  MessageSquare,
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { PageHeader } from '../components/PageHeader.tsx';
import { PersonaEditor } from '../components/PersonaEditor.tsx';
import { apiGet, usePolling } from '../lib/api.ts';
import type { PersonaSummary, WorkflowSummary } from '../lib/api-types.ts';
import { personaColor, personaInitials } from '../lib/persona-colors.ts';

marked.setOptions({ gfm: true, breaks: false });

// ─────────────────────────────────── Project settings

export function ProjectPane() {
  return (
    <>
      <PageHeader
        title="Project settings"
        subtitle="Core identity, workspace and behavior"
      />
      <div className="px-6 py-5 max-w-4xl flex flex-col">
        <FieldRow
          label="Project name"
          desc="Displayed in topbar and reports"
          control={<input className="input" defaultValue="Acme CRM" style={{ width: 280 }} />}
        />
        <FieldRow
          label="Project code"
          desc="Slug used in task IDs (e.g. ACME-T-101)"
          control={<input className="input mono" defaultValue="ACME" style={{ width: 200 }} />}
        />
        <FieldRow
          label="Version"
          desc="Bumped automatically on release"
          control={<input className="input mono" defaultValue="0.1.0" style={{ width: 140 }} />}
        />
        <FieldRow
          label="Target platform"
          desc="Multiple allowed · affects stack defaults"
          control={
            <div className="flex gap-1.5">
              <button className="btn btn-primary btn-xs">Web</button>
              <button className="btn btn-outline btn-xs">iOS</button>
              <button className="btn btn-outline btn-xs">Android</button>
              <button className="btn btn-outline btn-xs">Desktop</button>
            </div>
          }
        />
        <FieldRow
          label="GitHub repository"
          desc="Where agents commit"
          control={
            <div className="flex items-center gap-2">
              <input className="input mono" defaultValue="github.com/acme/acme-crm" style={{ width: 320 }} />
              <button className="btn btn-ghost btn-xs">Open</button>
            </div>
          }
        />
        <FieldRow
          label="Blueprint"
          desc="Product vision document"
          control={
            <div className="flex items-center gap-2">
              <span className="mono text-[13px] text-tx-2">blueprint.md</span>
              <span className="text-[12px] text-tx-3">4.2 KB · edited 4d ago</span>
              <button className="btn btn-ghost btn-xs">View</button>
              <button className="btn btn-ghost btn-xs">Replace</button>
            </div>
          }
        />
        <FieldRow
          label="Auto-commit on transitions"
          desc="Every status change creates a kortext meta-commit"
          control={<Toggle defaultOn />}
        />
        <FieldRow
          label="Require approval for PR merges"
          desc="engineering-manager always asks +prime before merging to main"
          control={<Toggle defaultOn />}
        />

        <div className="mt-6">
          <button className="btn btn-primary btn-xs">Save changes</button>
        </div>
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
            return (
              <button
                key={handle}
                type="button"
                onClick={() => setSelected(handle)}
                className="grid w-full items-center px-4 py-2.5 text-left border-b border-border-subtle last:border-b-0 hover:bg-bg-1 transition-colors"
                style={{ gridTemplateColumns: '32px 1.4fr 90px 1fr 90px 50px', gap: 12 }}
              >
                <span
                  className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[10px] font-bold"
                  style={{ background: personaColor(handle), color: '#0A0814' }}
                  aria-hidden
                >
                  {personaInitials(handle)}
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
  const first = workflows[0];
  return (
    <div className="border border-border-default rounded-lg p-5 bg-bg-1 overflow-x-auto">
      <div className="text-[11px] uppercase tracking-[0.06em] text-tx-3 mb-4 font-semibold">
        {first ? `${first.id} · visual flow` : 'visual flow'}
      </div>
      {!first && <p className="text-[12px] text-tx-3">no workflows loaded</p>}
      {first && (
        <div className="flex flex-col gap-3">
          <PhaseRow
            phases={[
              { label: 'Step 1 ✓', title: 'Analyze blueprint', tone: 'done' },
              { label: 'Step 2 ✓', title: 'Plan pipeline', tone: 'done' },
              { label: 'Step 3 ✓', title: 'Dispatch agents', tone: 'done' },
            ]}
          />
          <PhaseRow
            phases={[
              { label: 'Step 4 · active', title: 'Implementation', tone: 'active' },
            ]}
            gate="Code review gate"
            loopback="← FAIL → step 4"
          />
          <PhaseRow
            phases={[
              { label: 'Step 5', title: 'Integration tests', tone: 'idle' },
            ]}
            gate="QA gate"
            loopback="← FAIL → step 4"
          />
          <PhaseRow
            phases={[
              { label: 'Step 6', title: 'Handover to QA', tone: 'idle' },
            ]}
            trailing={
              <span className="text-[12px] text-tx-3">
                → <code className="mono">{workflows[1]?.id ?? '—'}</code>
              </span>
            }
          />
        </div>
      )}
    </div>
  );
}

function PhaseRow({
  phases,
  gate,
  loopback,
  trailing,
}: {
  phases: { label: string; title: string; tone: 'done' | 'active' | 'idle' }[];
  gate?: string;
  loopback?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {phases.map((p, i) => (
        <span key={p.label} className="flex items-center gap-2">
          <span
            className={[
              'inline-flex flex-col gap-1 px-3 py-2 rounded-md border min-w-[160px]',
              p.tone === 'done' ? 'border-success/40 bg-success/5' : '',
              p.tone === 'active' ? 'border-accent bg-accent/10' : '',
              p.tone === 'idle' ? 'border-border-default bg-bg-0' : '',
            ].join(' ')}
          >
            <span className="text-[10px] uppercase tracking-[0.06em] text-tx-3 font-semibold">{p.label}</span>
            <span className="text-[12px] text-tx-1">{p.title}</span>
          </span>
          {i < phases.length - 1 && <span className="text-tx-3">→</span>}
        </span>
      ))}
      {gate && (
        <>
          <span className="text-tx-3">→</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-warning/40 bg-warning/5 text-[11px] text-warning">
            <GitMerge className="w-3 h-3" /> {gate}
          </span>
        </>
      )}
      {loopback && <span className="text-[11px] text-danger ml-2">{loopback}</span>}
      {trailing}
    </div>
  );
}

// ─────────────────────────────────── Hooks

const HOOK_EVENTS: { name: string; desc: string; defaultOn: boolean }[] = [
  { name: 'PreToolUse', desc: 'Runs before any tool call · blocks dangerous patterns', defaultOn: true },
  { name: 'PostToolUse', desc: 'Audit logger · persists to audit.log', defaultOn: true },
  { name: 'UserPromptSubmit', desc: 'Adds context (project, agent, date) when +prime types', defaultOn: true },
  { name: 'SessionStart', desc: 'Loads workflow state & memory on session resume', defaultOn: true },
  { name: 'HandoverStart', desc: 'Captures context bundle on persona handover', defaultOn: false },
  { name: 'BlockerDetected', desc: 'Notify +prime when an agent reports it cannot proceed', defaultOn: false },
];

export function HooksPane() {
  return (
    <>
      <PageHeader
        title="Hooks"
        subtitle="Lifecycle event listeners · toggle to enable/disable"
      />
      <div className="px-6 py-5 max-w-4xl">
        <div className="rounded-lg border border-border-default overflow-hidden">
          {HOOK_EVENTS.map((h, i) => (
            <div
              key={h.name}
              className={[
                'flex items-center justify-between gap-4 px-4 py-3',
                i < HOOK_EVENTS.length - 1 ? 'border-b border-border-subtle' : '',
              ].join(' ')}
            >
              <div>
                <div className="text-[13px] text-tx-1">{h.name}</div>
                <div className="text-[12px] text-tx-3 mt-0.5">{h.desc}</div>
              </div>
              <Toggle defaultOn={h.defaultOn} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────── Integrations

type IntegrationStatus = 'connected' | 'test' | 'disconnected';
type Integration = {
  name: string;
  icon: ReactNode;
  status: IntegrationStatus;
  meta: string;
};

const INTEGRATIONS: Integration[] = [
  { name: 'GitHub', icon: <Code2 className="w-4 h-4" />, status: 'connected', meta: 'acme/acme-crm' },
  { name: 'Vercel', icon: <Cloud className="w-4 h-4" />, status: 'connected', meta: 'Staging + production' },
  { name: 'Stripe', icon: <CreditCard className="w-4 h-4" />, status: 'test', meta: 'Webhook T-102 in progress' },
  { name: 'Auth0', icon: <Lock className="w-4 h-4" />, status: 'connected', meta: 'acme-crm.us.auth0.com' },
  { name: 'Slack', icon: <MessageSquare className="w-4 h-4" />, status: 'disconnected', meta: 'Approval notifications' },
  { name: 'Telegram', icon: <Send className="w-4 h-4" />, status: 'disconnected', meta: 'Approval notifications' },
];

export function IntegrationsPane() {
  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="External services connected to this project"
      />
      <div className="px-6 py-5 max-w-4xl grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {INTEGRATIONS.map((i) => (
          <IntegrationCard key={i.name} integration={i} />
        ))}
      </div>
    </>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const dim = integration.status === 'disconnected';
  return (
    <div className={`border border-border-default rounded-md p-3.5 ${dim ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-2.5 mb-1">
        {integration.icon}
        <span className="text-[13px] text-tx-1 font-medium">{integration.name}</span>
        <span className="flex-1" />
        {integration.status === 'connected' && <Badge tone="green">Connected</Badge>}
        {integration.status === 'test' && <Badge tone="amber">Test mode</Badge>}
        {integration.status === 'disconnected' && (
          <button className="btn btn-outline btn-xs">Connect</button>
        )}
      </div>
      <div className="text-[12px] text-tx-3 mono">{integration.meta}</div>
    </div>
  );
}

// ─────────────────────────────────── Environment

type EnvVar = { key: string; value: string; type: 'secret' | 'string' | 'number' };

const ENV_VARS: EnvVar[] = [
  { key: 'ANTHROPIC_API_KEY', value: 'sk-ant-•••••••1a2b', type: 'secret' },
  { key: 'STRIPE_SECRET_KEY', value: 'sk_live_•••••••3f4g', type: 'secret' },
  { key: 'GITHUB_TOKEN', value: 'ghp_•••••••9h0i', type: 'secret' },
  { key: 'DATABASE_URL', value: 'postgres://acme:••••@…', type: 'secret' },
  { key: 'NODE_ENV', value: 'production', type: 'string' },
  { key: 'MAX_CONCURRENT_AGENTS', value: '3', type: 'number' },
];

export function EnvironmentPane() {
  return (
    <>
      <PageHeader
        title="Environment"
        subtitle="Project-specific variables and secrets available to agents"
      />
      <div className="px-6 py-5 max-w-5xl flex flex-col gap-3">
        <div className="rounded-lg border border-border-default overflow-hidden">
          <div
            className="grid px-4 py-2.5 border-b border-border-default bg-bg-1 text-[11px] uppercase tracking-[0.08em] text-tx-3 font-semibold"
            style={{ gridTemplateColumns: '1fr 1fr 90px 60px', gap: 12 }}
          >
            <div>Key</div>
            <div>Value</div>
            <div>Type</div>
            <div />
          </div>
          {ENV_VARS.map((v) => (
            <div
              key={v.key}
              className="grid items-center px-4 py-2.5 border-b border-border-subtle last:border-b-0"
              style={{ gridTemplateColumns: '1fr 1fr 90px 60px', gap: 12 }}
            >
              <span className="mono text-[12px] text-tx-2">{v.key}</span>
              <span className="mono text-[12px] text-tx-3 flex items-center gap-1.5">
                {v.value}
                {v.type === 'secret' && <EyeOff className="w-3 h-3 text-tx-disabled" />}
              </span>
              <Badge tone={v.type === 'secret' ? 'red' : 'neutral'}>{v.type}</Badge>
              <button className="btn btn-ghost btn-xs">Edit</button>
            </div>
          ))}
        </div>
        <button className="btn btn-outline btn-xs self-start">
          <Plus className="w-3 h-3" /> Add variable
        </button>
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

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className="relative inline-flex items-center w-[40px] h-[22px] rounded-full transition-colors duration-200"
      style={{ background: on ? 'var(--accent)' : 'var(--bg-3)' }}
    >
      <span
        className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all duration-200"
        style={{ left: on ? 20 : 2 }}
      />
    </button>
  );
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
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');

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
      <FileBody scope={scope} file={selected} mode={mode} onModeChange={setMode} />
    </div>
  );
}

function FileBody({
  scope,
  file,
  mode,
  onModeChange,
}: {
  scope: string;
  file: string | null;
  mode: 'preview' | 'edit';
  onModeChange: (m: 'preview' | 'edit') => void;
}) {
  const [body, setBody] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

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
        <span className="mono text-[13px] text-tx-2">{file}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => onModeChange(mode === 'preview' ? 'edit' : 'preview')}
          >
            <Eye className="w-3 h-3" /> {mode === 'preview' ? 'Edit' : 'Preview'}
          </button>
          <button type="button" disabled title="Inline save lands in v3.2" className="btn btn-outline btn-xs">
            Save
          </button>
        </div>
      </header>
      {error && <div className="px-4 py-3 text-[12px] text-danger">{error}</div>}
      {mode === 'edit' ? (
        <textarea
          spellCheck={false}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none p-3.5 mono text-[12px] leading-[1.65] text-tx-2 resize-none"
        />
      ) : (
        <article
          className="prose-markdown overflow-y-auto px-5 py-4 text-[13px] leading-[1.65]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </section>
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
