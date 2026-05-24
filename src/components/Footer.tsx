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

function Divider() {
  return (
    <div
      className="w-px h-3"
      style={{ background: 'rgba(255, 255, 255, 0.08)' }}
    />
  );
}

export function Footer() {
  const { active, idle, blocked } = useCounts();
  const projectName = useProjectName();
  return (
    <footer
      className="flex items-center gap-[14px] border-t px-4 text-[12px] text-tx-3"
      style={{
        height: 'var(--footer-h)',
        background: 'var(--bg-0)',
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <span className="flex items-center gap-1.5">
        <span className="dot dot-success" />
        <span className="text-tx-1">{projectName}</span>
      </span>

      <Divider />

      <span className="flex items-center gap-1.5">
        <span className="dot dot-success" />
        <span className="mono">{active}</span> active
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dot dot-warning" />
        <span className="mono">{idle}</span> idle
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dot dot-danger" />
        <span className="mono">{blocked}</span> blocked
      </span>

      <div className="flex-1" />
    </footer>
  );
}
