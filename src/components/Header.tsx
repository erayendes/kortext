import { Inbox, PanelLeft, Search, Terminal } from 'lucide-react';
import { useShell } from '../lib/shell-store.tsx';
import { usePendingQuestions } from '../lib/pending-questions.tsx';
import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.ts';
import type { BlueprintStatusResponse } from '../lib/api-types.ts';

type ProjectSummary = {
  name: string;
  code: string;
};

const VERSION_TAG = 'v3.1.0';

function useProjectSummary(): ProjectSummary | null {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  useEffect(() => {
    let alive = true;
    apiGet<BlueprintStatusResponse>('/api/blueprint/status')
      .then((res) => {
        if (!alive) return;
        if (res.project) {
          setProject({ name: res.project.name, code: res.project.code });
        }
      })
      .catch(() => {
        /* surfaced elsewhere */
      });
    return () => {
      alive = false;
    };
  }, []);
  return project;
}

export function Header() {
  const { toggleTerminal, terminalOpen, toggleSidebar, sidebarCollapsed } = useShell();
  const { questions } = usePendingQuestions();
  const project = useProjectSummary();
  const hasPending = questions.some((q) => q.status === 'open');
  return (
    <header
      className="flex items-center gap-3 border-b px-4"
      style={{
        height: 'var(--header-h)',
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <button
        type="button"
        onClick={toggleSidebar}
        className="w-8 h-8 rounded-md flex items-center justify-center transition-colors mr-1"
        style={{
          color: sidebarCollapsed ? 'var(--accent)' : 'var(--tx-2)',
          background: sidebarCollapsed ? 'var(--bg-2)' : 'transparent',
        }}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <PanelLeft size={16} />
      </button>

      <div
        className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[13px] font-semibold"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--signal))' }}
      >
        K
      </div>
      <span className="font-semibold text-[14px] text-tx-1">Kortext</span>

      <div
        className="w-px h-4"
        style={{ background: 'rgba(255, 255, 255, 0.08)' }}
      />

      <span className="text-[13px] text-tx-2">{project?.name ?? 'No project'}</span>
      <span
        className="mono text-[10px] font-medium px-2 py-0.5 rounded"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: 'var(--tx-2)',
        }}
      >
        {VERSION_TAG}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        disabled
        aria-disabled="true"
        className="flex items-center gap-2 h-[33px] px-3 rounded-md text-[13px] text-tx-3 cursor-not-allowed"
        style={{
          width: 320,
          background: 'var(--bg-1)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          opacity: 0.55,
        }}
        title="Search lands in v3.2"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search tasks, agents, decisions…</span>
        <span
          className="mono text-[9px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
          style={{ color: 'var(--tx-3)', background: 'rgba(255,255,255,0.06)' }}
        >
          soon
        </span>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={toggleTerminal}
        className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
        style={{
          color: terminalOpen ? 'var(--accent)' : 'var(--tx-2)',
          background: terminalOpen ? 'var(--bg-2)' : 'transparent',
        }}
        title="Terminal"
      >
        <Terminal size={16} />
      </button>

      <InboxButton hasPending={hasPending} pendingCount={questions.filter((q) => q.status === 'open').length} />
    </header>
  );
}

function InboxButton({ hasPending, pendingCount }: { hasPending: boolean; pendingCount: number }) {
  const { inboxOpen, toggleInbox } = useShell();
  return (
    <button
      type="button"
      onClick={toggleInbox}
      className="relative w-8 h-8 rounded-md flex items-center justify-center transition-colors"
      style={{
        color: inboxOpen ? 'var(--accent)' : 'var(--tx-2)',
        background: inboxOpen ? 'var(--bg-2)' : 'transparent',
      }}
      title={hasPending ? `Approvals — ${pendingCount} pending` : 'Approvals'}
    >
      <Inbox size={16} />
      {hasPending ? (
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
          style={{
            background: 'var(--danger)',
            border: '2px solid var(--bg-0)',
          }}
        />
      ) : null}
    </button>
  );
}
