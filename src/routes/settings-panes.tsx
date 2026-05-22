import { PageHeader } from '../components/PageHeader.tsx';
import { MarkdownViewer } from '../components/MarkdownViewer.tsx';
import { PersonaEditor } from '../components/PersonaEditor.tsx';
import { usePolling } from '../lib/api.ts';
import type { WorkflowSummary } from '../lib/api-types.ts';
import { AlertTriangle, EyeOff } from 'lucide-react';

export function ProjectPane() {
  return (
    <>
      <PageHeader title="Project settings" subtitle="Project metadata, default executor, paths." />
      <div className="px-6 py-5 grid gap-4 max-w-3xl">
        <ReadOnlyRow label="Name" value="Acme CRM" />
        <ReadOnlyRow label="Default executor" value="claude" mono />
        <ReadOnlyRow label="Workspace root" value="workspace/" mono />
        <ReadOnlyRow label="Default branch" value="main" mono />
        <ReadOnlyRow label="Working branch" value="feature/auth-42" mono />
        <Hint>
          Editable project settings land in a follow-up phase; today these come from{' '}
          <code className="mono">server/config/env.ts</code> + workspace defaults.
        </Hint>
      </div>
    </>
  );
}

export function AgentsPane() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Agents"
        subtitle="14 personas — markdown definitions in agents/*.md. Edit, save, hot-reload."
      />
      <div className="flex-1 min-h-0">
        <PersonaEditor />
      </div>
    </div>
  );
}

export function RulesPane() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Rules" subtitle="behavior / branching / commands / emergency / models." />
      <div className="flex-1 min-h-0">
        <MarkdownViewer scope="rules" subtitle="rules/" />
      </div>
    </div>
  );
}

export function WorkflowsPane() {
  const { data, error } = usePolling<{ workflows: WorkflowSummary[] }>(
    '/api/workflows',
    30_000,
  );
  const wfs = data?.workflows ?? [];
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Workflows"
        subtitle={`${wfs.length} pipelines — DAG-driven, data-flow based.`}
      />
      <div className="px-6 py-5">
        {error && <div className="text-[12px] text-danger mb-3">{error}</div>}
        <div className="rounded-lg border border-border-subtle bg-bg-1 overflow-hidden">
          <div className="grid px-4 py-2 border-b border-border-subtle text-[11px] uppercase tracking-[0.10em] text-tx-3"
               style={{ gridTemplateColumns: '1.4fr 2fr 60px 60px' }}>
            <span>ID</span>
            <span>Title</span>
            <span className="text-right">Steps</span>
            <span className="text-right">Gates</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {wfs.map((w) => (
              <li
                key={w.id}
                className="grid items-center px-4 py-2.5 hover:bg-bg-2 transition-colors duration-200"
                style={{ gridTemplateColumns: '1.4fr 2fr 60px 60px' }}
              >
                <span className="mono text-[12px] text-accent-soft">{w.id}</span>
                <span className="text-[13px] text-tx-1 truncate">{w.title}</span>
                <span className="mono text-[12px] text-tx-3 text-right">{w.stepCount}</span>
                <span className="mono text-[12px] text-tx-3 text-right">{w.gateCount}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex-1 min-h-0 border-t border-border-subtle">
        <MarkdownViewer scope="workflows" subtitle="workflows/" />
      </div>
    </div>
  );
}

export function HooksPane() {
  return (
    <>
      <PageHeader title="Hooks" subtitle="Lifecycle hooks — pre/post step, gate, blueprint events." />
      <div className="px-6 py-5 grid gap-3 max-w-3xl">
        <HookCard event="blueprint.approved" target="orchestrator.triggerWorkflow" state="builtin" />
        <HookCard event="run.completed" target="notifications.notify" state="builtin" />
        <HookCard event="step.safety.violation" target="engine.markFailed" state="builtin" />
        <Hint>User-defined hooks pluggable via <code className="mono">.kortext/hooks.json</code> arrive in a later phase. The three above are wired into the runtime today.</Hint>
      </div>
    </>
  );
}

export function IntegrationsPane() {
  return (
    <>
      <PageHeader title="Integrations" subtitle="Slack, Telegram, GitHub, MCP clients." />
      <div className="px-6 py-5 grid gap-3 max-w-3xl">
        <IntegrationCard name="Slack" status="disconnected" hint="Set KORTEXT_SLACK_WEBHOOK to enable." />
        <IntegrationCard name="Telegram" status="disconnected" hint="Set KORTEXT_TELEGRAM_BOT_TOKEN + chat id." />
        <IntegrationCard name="GitHub" status="disconnected" hint="GitHub App credentials land here." />
        <IntegrationCard name="MCP server" status="available" hint="Stdio + SSE — kortext mcp." />
      </div>
    </>
  );
}

export function EnvironmentPane() {
  return (
    <>
      <PageHeader title="Environment" subtitle="Env vars, secrets, executor binaries." />
      <div className="px-6 py-5 grid gap-2 max-w-3xl">
        <EnvRow name="KORTEXT_PORT" value="3200" />
        <EnvRow name="KORTEXT_DB_PATH" value=".kortext/runtime/kortext.db" />
        <EnvRow name="KORTEXT_WORKTREE_ROOT" value=".kortext/worktrees" />
        <EnvRow name="KORTEXT_CLAUDE_BIN" value="(unset)" muted />
        <EnvRow name="KORTEXT_CODEX_BIN" value="(unset)" muted />
        <EnvRow name="KORTEXT_GEMINI_BIN" value="(unset)" muted />
        <EnvRow name="KORTEXT_SLACK_WEBHOOK" value="●●●●●●●●" secret />
        <Hint>Values are read at server boot. Restart after changing env to pick up new defaults.</Hint>
      </div>
    </>
  );
}

export function DangerPane() {
  return (
    <>
      <PageHeader title="Danger zone" subtitle="Destructive operations — gated behind CLI confirmation." />
      <div className="px-6 py-5 grid gap-3 max-w-3xl">
        <DangerRow
          title="Cleanup stale worktrees"
          desc="Quarantined worktrees older than 7 days are removed permanently."
          command="kortext cleanup --quarantine-older-than=7d"
        />
        <DangerRow
          title="Cleanup kortext branches"
          desc="Deletes every git branch with the kortext/ prefix that has no worktree."
          command="kortext cleanup --branches"
        />
        <DangerRow
          title="Reset SQLite runtime db"
          desc="Drops every backlog item, run, handover, audit entry. Markdown sources untouched."
          command="rm .kortext/runtime/kortext.db && kortext doctor"
        />
        <div className="rounded-lg border border-danger/40 bg-bg-1 px-4 py-3">
          <div className="flex items-center gap-2 text-danger text-[12px] mb-1">
            <AlertTriangle size={13} /> All actions above run from the CLI today.
          </div>
          <div className="text-tx-3 text-[12px]">
            Dashboard triggers land in Faz 8 with a double-confirm dialog.
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- shared bits ----------

function ReadOnlyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid items-center gap-4 px-4 py-3 rounded-lg border border-border-subtle bg-bg-1"
         style={{ gridTemplateColumns: '180px 1fr' }}>
      <span className="text-[12px] text-tx-3">{label}</span>
      <span className={`${mono ? 'mono' : ''} text-[13px] text-tx-1`}>{value}</span>
    </div>
  );
}

function HookCard({ event, target, state }: { event: string; target: string; state: 'builtin' | 'user' }) {
  return (
    <div className="grid items-center gap-3 px-4 py-3 rounded-lg border border-border-subtle bg-bg-1"
         style={{ gridTemplateColumns: '1fr 1fr 90px' }}>
      <span className="mono text-[12px] text-accent-soft">{event}</span>
      <span className="mono text-[12px] text-tx-2">{target}</span>
      <span className={`text-[11px] mono text-right ${state === 'builtin' ? 'text-success' : 'text-warning'}`}>
        {state}
      </span>
    </div>
  );
}

function IntegrationCard({ name, status, hint }: {
  name: string;
  status: 'connected' | 'available' | 'disconnected';
  hint: string;
}) {
  const dotClass =
    status === 'connected' ? 'dot-success' : status === 'available' ? 'dot-accent' : 'dot-muted';
  return (
    <div className="grid items-center gap-3 px-4 py-3 rounded-lg border border-border-subtle bg-bg-1"
         style={{ gridTemplateColumns: '140px 1fr 120px' }}>
      <span className="text-[13px] text-tx-1">{name}</span>
      <span className="text-[12px] text-tx-3">{hint}</span>
      <span className="text-[11px] text-tx-2 inline-flex items-center justify-end gap-1.5">
        <span className={`dot ${dotClass}`} /> {status}
      </span>
    </div>
  );
}

function EnvRow({ name, value, muted = false, secret = false }: {
  name: string;
  value: string;
  muted?: boolean;
  secret?: boolean;
}) {
  return (
    <div className="grid items-center gap-3 px-4 py-2 rounded border border-border-subtle bg-bg-1"
         style={{ gridTemplateColumns: '300px 1fr 30px' }}>
      <span className="mono text-[12px] text-tx-2">{name}</span>
      <span className={`mono text-[12px] ${muted ? 'text-tx-disabled' : 'text-tx-1'}`}>{value}</span>
      {secret && <EyeOff size={12} className="text-tx-3" />}
    </div>
  );
}

function DangerRow({ title, desc, command }: { title: string; desc: string; command: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-1 px-4 py-3">
      <div className="text-[13px] text-tx-1 font-medium">{title}</div>
      <div className="text-[12px] text-tx-3 mt-0.5">{desc}</div>
      <code className="mono text-[12px] text-warning mt-2 block">{command}</code>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] text-tx-3 mt-1">{children}</div>
  );
}
