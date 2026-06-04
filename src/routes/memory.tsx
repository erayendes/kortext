import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, ChevronDown, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/PageHeader.tsx';
import { MarkdownViewer } from '../components/MarkdownViewer.tsx';
import { usePolling, formatElapsed } from '../lib/api.ts';
import type { DecisionIndex, Handover, DecisionStatus } from '../lib/api-types.ts';
import { personaColor, personaIcon } from '../lib/persona-colors.ts';

type Tab = 'decisions' | 'learned' | 'handovers';

export function MemoryRoute() {
  const decisions = usePolling<{ decisions: DecisionIndex[] }>('/api/decisions', 10_000);
  const handovers = usePolling<{ handovers: Handover[] }>('/api/handovers', 5_000);

  const [tab, setTab] = useState<Tab>('decisions');

  const decisionCount = decisions.data?.decisions.length ?? 0;
  const handoverCount = handovers.data?.handovers.length ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Memory"
        subtitle="Collective intelligence — decisions, learnings, handovers"
        actions={
          <button className="btn btn-outline btn-xs">
            <Plus className="w-3 h-3" /> New entry
          </button>
        }
      />

      <TabBar
        current={tab}
        onChange={setTab}
        tabs={[
          { id: 'decisions', label: 'Decisions', count: decisionCount },
          { id: 'learned', label: 'Learned', count: null },
          { id: 'handovers', label: 'Handovers', count: handoverCount },
        ]}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {tab === 'decisions' && <DecisionsTab data={decisions.data?.decisions ?? []} error={decisions.error} loading={decisions.loading} />}
        {tab === 'learned' && <LearnedTab />}
        {tab === 'handovers' && <HandoversTab data={handovers.data?.handovers ?? []} error={handovers.error} loading={handovers.loading} />}
      </div>
    </div>
  );
}

// ───────────────────────── tab bar

function TabBar({
  current,
  onChange,
  tabs,
}: {
  current: Tab;
  onChange: (t: Tab) => void;
  tabs: { id: Tab; label: string; count: number | null }[];
}) {
  return (
    <div className="flex items-center gap-1 px-6 border-b border-border-subtle">
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              'flex items-center gap-2 px-3 py-2.5 text-[12px] uppercase tracking-[0.08em] font-semibold transition-colors duration-200 border-b-2',
              active
                ? 'text-tx-1 border-accent'
                : 'text-tx-3 border-transparent hover:text-tx-2',
            ].join(' ')}
          >
            {t.label}
            {t.count !== null && (
              <span
                className={[
                  'mono text-[10px] px-1.5 py-0.5 rounded',
                  active ? 'bg-accent/15 text-accent-soft' : 'bg-bg-2 text-tx-3',
                ].join(' ')}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── decisions tab

const DECISION_BADGE: Record<DecisionStatus, { label: string; color: string; bg: string }> = {
  proposed: { label: 'Proposed', color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' },
  accepted: { label: 'Adopted', color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
  superseded: { label: 'Superseded', color: 'var(--tx-3)', bg: 'rgba(107,101,119,0.15)' },
  rejected: { label: 'Rejected', color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' },
};

function DecisionsTab({
  data,
  error,
  loading,
}: {
  data: DecisionIndex[];
  error: string | null;
  loading: boolean;
}) {
  if (error) return <ErrorBlock message={error} />;
  if (loading && data.length === 0) return <LoadingBlock label="decisions" />;
  if (data.length === 0) return <EmptyBlock label="No decisions yet" hint="As personas record architectural calls, they appear here." />;

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => (
        <MemCard
          key={d.decision_id}
          id={d.decision_id}
          title={d.title}
          quote={null}
          footer={
            <>
              <span className="text-tx-3">{formatElapsed(d.created_at)}</span>
              <span className="flex-1" />
              {d.tags.map((tag) => (
                <Badge key={tag} tone={tag.toLowerCase().includes('arch') ? 'purple' : 'blue'}>
                  {tag}
                </Badge>
              ))}
              <Badge
                tone="custom"
                color={DECISION_BADGE[d.status].color}
                bg={DECISION_BADGE[d.status].bg}
              >
                {DECISION_BADGE[d.status].label}
              </Badge>
              <ViewLink />
            </>
          }
        />
      ))}
    </div>
  );
}

// ───────────────────────── learned tab (markdown for now)

function LearnedTab() {
  return (
    <div className="rounded-lg border border-border-default bg-bg-1 p-5">
      <MarkdownViewer scope="memory" subtitle="workspace/memory/learned.md" />
    </div>
  );
}

// ───────────────────────── handovers tab

function HandoversTab({
  data,
  error,
  loading,
}: {
  data: Handover[];
  error: string | null;
  loading: boolean;
}) {
  if (error) return <ErrorBlock message={error} />;
  if (loading && data.length === 0) return <LoadingBlock label="handovers" />;
  if (data.length === 0) return <EmptyBlock label="No handovers yet" hint="Persona-to-persona transitions appear here." />;

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((h) => {
        const fromColor = personaColor(h.from_persona);
        const toColor = personaColor(h.to_persona);
        const FromIcon = personaIcon(h.from_persona);
        return (
          <MemCard
            key={h.id}
            id={`#${h.id}`}
            title={
              <span className="flex items-center gap-2 flex-wrap">
                <code className="mono" style={{ color: fromColor }}>{h.from_persona}</code>
                <ArrowRight size={12} className="text-tx-3" />
                <code className="mono" style={{ color: toColor }}>{h.to_persona}</code>
              </span>
            }
            quote={h.reason}
            avatar={{ icon: FromIcon, color: fromColor }}
            footer={
              <>
                {h.item_id && <span className="mono text-tx-3">{h.item_id}</span>}
                {h.item_id && <span className="text-tx-disabled">·</span>}
                <span className="text-tx-3">{formatElapsed(h.created_at)}</span>
                <span className="flex-1" />
                <Badge tone="purple">Handover</Badge>
                <ViewLink />
              </>
            }
          />
        );
      })}
    </div>
  );
}

// ───────────────────────── mem-card primitive

function MemCard({
  id,
  title,
  quote,
  avatar,
  footer,
}: {
  id: string;
  title: ReactNode;
  quote: string | null;
  avatar?: { icon: LucideIcon; color: string };
  footer: ReactNode;
}) {
  return (
    <article className="border border-border-default rounded-md bg-bg-0 px-4 py-3 hover:border-border-strong transition-colors duration-200">
      <header className="flex items-center gap-2.5 mb-2">
        <span className="mono text-[10px] text-tx-3 shrink-0">{id}</span>
        <span className="flex-1 text-[13px] text-tx-1 leading-snug">{title}</span>
        {avatar && (() => { const Ic = avatar.icon; return (
          <span
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full"
            style={{ background: avatar.color, color: '#0A0814' }}
            aria-hidden
          >
            <Ic size={11} strokeWidth={2.5} />
          </span>
        ); })()}
      </header>
      {quote && (
        <p className="text-[12px] text-tx-2 leading-relaxed border-l-2 border-border-default pl-3 my-2">
          "{quote}"
        </p>
      )}
      <footer className="flex items-center gap-2 text-[11px] mt-2">
        {footer}
      </footer>
    </article>
  );
}

// ───────────────────────── badges + view link + helpers

type BadgeTone = 'purple' | 'green' | 'blue' | 'amber' | 'custom';

function Badge({
  tone,
  color,
  bg,
  children,
}: {
  tone: BadgeTone;
  color?: string;
  bg?: string;
  children: ReactNode;
}) {
  const presets: Record<Exclude<BadgeTone, 'custom'>, { color: string; bg: string }> = {
    purple: { color: 'var(--accent-soft)', bg: 'rgba(168,85,247,0.15)' },
    green: { color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
    blue: { color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' },
    amber: { color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' },
  };
  const style = tone === 'custom'
    ? { color: color ?? 'var(--tx-2)', background: bg ?? 'rgba(255,255,255,0.06)' }
    : { color: presets[tone].color, background: presets[tone].bg };
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded leading-tight"
      style={style}
    >
      {children}
    </span>
  );
}

function ViewLink() {
  return (
    <button type="button" className="inline-flex items-center gap-1 text-[11px] text-tx-3 hover:text-tx-1 transition-colors">
      View <ChevronDown className="w-3 h-3" />
    </button>
  );
}

function EmptyBlock({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="border border-dashed border-border-default rounded-md px-5 py-8 text-center">
      <p className="text-[13px] text-tx-2">{label}</p>
      {hint && <p className="mt-1 text-[12px] text-tx-3">{hint}</p>}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="text-[13px] text-tx-3 px-1 py-2">loading {label}…</div>;
}

function ErrorBlock({ message }: { message: string }) {
  return <div className="text-[13px] text-danger px-1 py-2">{message}</div>;
}
