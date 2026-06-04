/**
 * Agent models (settings) — GET /api/personas + /api/personas/usage.
 *
 * Maps to the `agent-models` route in wireframe-v6-hifi.html. Lists every
 * persona with the model it runs on — a *project-specific* assignment (persona
 * bodies themselves are read-only in Kortext › Agents). The model picker is
 * UI-only for now: there is no persona-model assignment endpoint yet, so the
 * selection is local state (TODO).
 */
import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api.ts';
import type { PersonaSummary } from '../../lib/api-types.ts';
import { personaColor, personaIcon } from '../../lib/persona-colors.ts';
import { SettingsPane, SetCard, SetSelect } from '../../components/v6/SettingsPane.tsx';
import { Cpu } from 'lucide-react';

type PersonasResponse = { personas: PersonaSummary[] };
type UsageResponse = { usage: { handle: string; step_count: number }[] };

const MODELS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

/** Heuristic default: heavier model for managers/leads, light for the rest. */
function defaultModel(handle: string): string {
  if (/manager|prime|architect|security/.test(handle)) return MODELS[0]!;
  return MODELS[1]!;
}

function Avatar({ handle }: { handle: string }) {
  const color = personaColor(handle);
  const Icon = personaIcon(handle);
  return (
    <span
      className="avatar"
      style={{ width: 22, height: 22, background: `${color}22`, border: `1px solid ${color}55`, color }}
    >
      <Icon style={{ width: 11, height: 11 }} />
    </span>
  );
}

export function AgentModelsRoute() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [models, setModels] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    apiGet<PersonasResponse>('/api/personas')
      .then((r) => {
        if (!alive) return;
        setPersonas(r.personas);
        setModels(Object.fromEntries(r.personas.map((p) => [p.handle, defaultModel(p.handle)])));
      })
      .catch(() => alive && setPersonas([]));
    apiGet<UsageResponse>('/api/personas/usage')
      .then((r) => alive && setUsage(Object.fromEntries(r.usage.map((u) => [u.handle, u.step_count]))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SettingsPane
      title="Agent models"
      subtitle="Which model each agent runs — specific to this project"
      wide
    >
      <div className="am-banner">
        <span className="am-pill">
          <Cpu />
          Project-specific
        </span>
        <span>
          Persona bodies are read-only in{' '}
          <b style={{ color: 'var(--fg-mid)', fontWeight: 500 }}>Kortext &gt; Agents</b>; here you only
          assign the model.
        </span>
      </div>

      <SetCard>
        {personas.map((p) => {
          const steps = usage[p.handle] ?? 0;
          const role = p.description || (steps ? `${steps} workflow step${steps === 1 ? '' : 's'}` : '—');
          return (
            <div className="am-row" key={p.handle}>
              <span className="am-who">
                <Avatar handle={p.handle} />
                <span className="am-name mono">{p.handle}</span>
                <span className="am-role">{role}</span>
              </span>
              {/* TODO: no persona→model assignment endpoint yet — local only. */}
              <SetSelect
                value={models[p.handle] ?? MODELS[1]}
                onChange={(m) => setModels((cur) => ({ ...cur, [p.handle]: m }))}
                options={MODELS.map((m) => ({ value: m }))}
              />
            </div>
          );
        })}
        {personas.length === 0 && (
          <div style={{ padding: '14px 16px', color: 'var(--fg-faint)', fontSize: 12.5 }}>
            No personas loaded
          </div>
        )}
      </SetCard>
    </SettingsPane>
  );
}
