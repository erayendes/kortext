import { Inbox, Search, Sparkles, Terminal } from 'lucide-react';
import { useShell } from '../lib/shell-store.tsx';
import { usePendingQuestions } from '../lib/pending-questions.tsx';
import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.ts';
import type { BlueprintStatusResponse, Run } from '../lib/api-types.ts';

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

function useActiveRunCount(): { active: number; total: number } {
  const [state, setState] = useState<{ active: number; total: number }>({ active: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    const tick = () => {
      apiGet<{ runs: Run[] }>('/api/runs')
        .then((res) => {
          if (!alive) return;
          const active = res.runs.filter(
            (r) => r.status === 'running' || r.status === 'queued',
          ).length;
          setState({ active, total: res.runs.length });
        })
        .catch(() => {
          /* ignore */
        });
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return state;
}

export function Header() {
  const { toggleTerminal, toggleTimeline, terminalOpen } = useShell();
  const project = useProjectSummary();
  const { active } = useActiveRunCount();
  const { questions } = usePendingQuestions();
  const pendingCount = questions.filter((q) => q.status === 'open').length;
  return (
    <header
      className="flex items-center gap-3 border-b border-border-subtle bg-bg-0 px-4"
      style={{ height: 'var(--header-h)' }}
    >
      {/* Left cluster — logo + project meta */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-deep) 100%)',
            boxShadow: '0 0 12px var(--accent-glow)',
          }}
        >
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="font-semibold tracking-tight text-[14px] text-tx-1">Kortext</span>
        <div className="w-px h-5 mx-1" style={{ background: 'var(--border-default)' }} />
        <span className="text-[13px] text-tx-2">{project?.name ?? 'No project'}</span>
        <span
          className="mono text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border-default)',
            color: 'var(--tx-3)',
          }}
        >
          {VERSION_TAG}
        </span>
      </div>

      {/* Search bar — opens command palette (Phase B) */}
      <button
        type="button"
        className="ml-2 flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors flex-1 max-w-md text-left"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-default)',
        }}
        title="Search (⌘K) — coming soon"
      >
        <Search size={14} className="text-tx-3" />
        <span className="text-[13px] text-tx-3 flex-1">Search tasks, agents, decisions…</span>
        <kbd
          className="mono text-[10px] px-1.5 py-0.5 rounded text-tx-3"
          style={{ background: 'var(--bg-3)' }}
        >
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Right cluster — live count + actions */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
          style={{ background: 'var(--bg-2)', border: '1px solid var(--border-default)' }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full dot-pulse"
            style={{ background: 'var(--success)' }}
          />
          <span className="text-[12px] text-tx-2">
            <span className="mono text-tx-1">{active}</span> active
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTimeline}
          className="w-7 h-7 rounded flex items-center justify-center text-tx-3 hover:text-tx-1 hover:bg-bg-2 transition-colors"
          title="Toggle timeline"
        >
          <Terminal size={14} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <button
          type="button"
          onClick={toggleTerminal}
          className="w-7 h-7 rounded flex items-center justify-center transition-colors"
          style={{
            background: terminalOpen ? 'var(--bg-2)' : 'transparent',
            color: terminalOpen ? 'var(--accent)' : 'var(--tx-3)',
          }}
          title="Toggle terminal"
        >
          <Terminal size={14} />
        </button>
        <button
          type="button"
          className="relative w-7 h-7 rounded flex items-center justify-center text-tx-3 hover:text-tx-1 hover:bg-bg-2 transition-colors"
          title="Pending approvals"
          onClick={toggleTimeline}
        >
          <Inbox size={14} />
          {pendingCount > 0 ? (
            <span
              className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
              style={{ background: 'var(--danger)', color: '#fff' }}
            >
              {pendingCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold ml-1"
          style={{
            background: 'linear-gradient(135deg, #FCD34D, #F59E0B)',
            color: 'var(--bg-0)',
          }}
          title="+prime (you)"
        >
          +p
        </button>
      </div>
    </header>
  );
}
