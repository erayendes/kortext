/**
 * Kortext › Scripts (engine scope) — wireframe-faithful, no backend yet.
 *
 * Maps to `.kpane[data-k=scripts]` in wireframe-v6-hifi.html. Ready-made helpers
 * run manually / on request (unlike Hooks, which are event-triggered). There is
 * no script-registry/run endpoint yet, so the Run buttons + enable toggles are
 * local UI. TODO: wire to a script runner.
 */
import { useState } from 'react';
import { Play } from 'lucide-react';
import { SettingsPane, SetCard, SetRow, Switch } from '../../components/v6/SettingsPane.tsx';

type Script = { id: string; desc: string; enabled: boolean };

const INITIAL: Script[] = [
  { id: 'test:e2e', desc: 'Playwright E2E suite', enabled: true },
  { id: 'db:seed', desc: 'Load demo data', enabled: true },
  { id: 'deploy:preview', desc: 'Vercel preview deploy', enabled: false },
];

export function ScriptsRoute() {
  const [scripts, setScripts] = useState<Script[]>(INITIAL);

  function toggle(id: string) {
    setScripts((cur) => cur.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }

  return (
    <SettingsPane
      title="Scripts"
      full
      subtitle={
        <>
          Ready-made helpers — run manually / on request{' '}
          <span className="st-pill s-amber" style={{ marginLeft: 6 }}>
            preview · no runner yet
          </span>
        </>
      }
    >
      {/* TODO: no script-registry/runner endpoint yet — Run + toggles are local. */}
      <SetCard>
        {scripts.map((s) => (
          <SetRow key={s.id} label={<span className="mono">{s.id}</span>} desc={s.desc}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-secondary btn-sm">
                <Play style={{ width: 12, height: 12 }} />
                Run
              </button>
              <Switch on={s.enabled} onToggle={() => toggle(s.id)} />
            </div>
          </SetRow>
        ))}
      </SetCard>
    </SettingsPane>
  );
}
