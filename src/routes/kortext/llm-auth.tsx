/**
 * Kortext › LLM Auth (engine scope) — wireframe-faithful, no backend yet.
 *
 * Maps to `.kpane[data-k=auth]` in wireframe-v6-hifi.html. There is no
 * auth-config endpoint, so the method selection is local state and the provider
 * status row is static. TODO: wire to a real LLM-auth settings endpoint.
 */
import { useState } from 'react';
import { SettingsPane, SetSection } from '../../components/v6/SettingsPane.tsx';

type AuthMethod = 'cli' | 'apikey';

const PROVIDERS: { name: string; on: boolean }[] = [
  { name: 'claude', on: true },
  { name: 'codex', on: true },
  { name: 'gemini', on: true },
  { name: 'antigravity', on: false },
];

export function LlmAuthRoute() {
  const [method, setMethod] = useState<AuthMethod>('cli');

  return (
    <SettingsPane title="LLM Auth" subtitle="How agents authenticate to the model providers">
      <SetSection>Method</SetSection>
      {/* TODO: no auth-config endpoint yet — selection is local. */}
      <div
        className={`auth-opt${method === 'cli' ? ' sel' : ''}`}
        onClick={() => setMethod('cli')}
      >
        <span className="auth-radio" />
        <div>
          <div className="set-lbl">Use CLI</div>
          <div className="set-desc">
            Claude / Codex / Gemini / Antigravity CLI auth — no API key needed
          </div>
        </div>
      </div>
      <div
        className={`auth-opt${method === 'apikey' ? ' sel' : ''}`}
        onClick={() => setMethod('apikey')}
      >
        <span className="auth-radio" />
        <div>
          <div className="set-lbl">API key</div>
          <div className="set-desc">
            <span className="mono">ANTHROPIC_API_KEY</span> from <span className="mono">.env</span>
          </div>
        </div>
      </div>

      <div className="set-sec" style={{ marginTop: 22 }}>
        Providers
      </div>
      <div className="chips">
        {PROVIDERS.map((p) => (
          <span className="prov" key={p.name}>
            <span className="d" style={{ background: p.on ? 'var(--green)' : 'var(--fg-faint)' }} />
            {p.name}
          </span>
        ))}
      </div>
    </SettingsPane>
  );
}
