import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.ts';
import type { BlueprintStatusResponse, Run } from '../lib/api-types.ts';

type Counts = {
  active: number;
  idle: number;
  blocked: number;
};

function useCounts(): Counts {
  const [c, setC] = useState<Counts>({ active: 0, idle: 0, blocked: 0 });
  useEffect(() => {
    let alive = true;
    const tick = () => {
      apiGet<{ runs: Run[] }>('/api/runs')
        .then((res) => {
          if (!alive) return;
          let active = 0;
          let idle = 0;
          let blocked = 0;
          for (const r of res.runs) {
            if (r.status === 'running' || r.status === 'queued') active++;
            else if (r.status === 'awaiting_approval') blocked++;
            else if (r.status === 'failed' || r.status === 'cancelled') blocked++;
            else idle++;
          }
          setC({ active, idle, blocked });
        })
        .catch(() => {
          /* keep last */
        });
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return c;
}

function useProjectName(): string {
  const [name, setName] = useState<string>('No project');
  useEffect(() => {
    apiGet<BlueprintStatusResponse>('/api/blueprint/status')
      .then((res) => {
        if (res.project) setName(res.project.name);
      })
      .catch(() => {
        /* keep default */
      });
  }, []);
  return name;
}

export function Footer() {
  const { active, idle, blocked } = useCounts();
  const projectName = useProjectName();
  return (
    <footer
      className="border-t flex items-center gap-4 px-4 text-[11px]"
      style={{
        height: 'var(--footer-h)',
        background: 'var(--bg-0)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--tx-3)',
      }}
    >
      <span className="flex items-center gap-1.5">
        <span className="dot dot-accent" />
        <span className="text-tx-2">{projectName}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dot dot-success dot-pulse" />
        <span className="text-tx-2">
          <span className="mono">{active}</span> active
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dot dot-muted" />
        <span>
          <span className="mono">{idle}</span> idle
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dot dot-danger" />
        <span>
          <span className="mono">{blocked}</span> blocked
        </span>
      </span>
      <span className="ml-auto mono" style={{ color: 'var(--accent-soft)' }}>
        ⚡ ~1.2K tkn/s
      </span>
      <span className="mono" style={{ color: 'var(--success)' }}>
        $4.30 today
      </span>
      <span className="mono text-tx-3">⎇ feature/auth-42</span>
      <span className="mono text-tx-3">workflow: 04-development 4/7</span>
    </footer>
  );
}
