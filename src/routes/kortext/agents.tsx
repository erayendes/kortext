/**
 * Kortext › Agents (engine scope) — GET /api/personas + /api/personas/:handle,
 * plus model assignment via /api/llm-models.
 *
 * Left list = every loaded persona (name only); right pane renders the persona's
 * markdown body (read-only — definitions are package-defined) AND a model picker
 * in the panel head. The picker's options are the models the user entered in
 * Kortext › LLM models; choosing one persists the persona→model assignment.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { apiGet, apiPut } from '../../lib/api.ts';
import type { PersonaSummary } from '../../lib/api-types.ts';
import { FileBrowser, type FBItem } from '../../components/v6/FileBrowser.tsx';
import { SetSelect } from '../../components/v6/SettingsPane.tsx';
import { personaColor } from '../../lib/persona-colors.ts';

type PersonasResponse = { personas: PersonaSummary[] };
type PersonaDetail = { persona: { systemPrompt: string } };
type ProviderConfig = { authMethod: string; models: string[] };
type LlmConfig = { providers: Record<string, ProviderConfig>; assignments: Record<string, string> };

const PROVIDER_LABEL: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  antigravity: 'Antigravity',
};

/** Two-letter initials, exactly as the board derives them (board.tsx initialsOf). */
function initialsOf(handle: string): string {
  const h = handle.replace(/^\+/, '');
  const p = h.split('-');
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toLowerCase() || '?';
}

/** The board's persona avatar — `.kc-ava`: soft tint + initials (set --ava). */
function PersonaBadge({ handle }: { handle: string }) {
  return (
    <span className="kc-ava" style={{ ['--ava']: personaColor(handle) } as CSSProperties}>
      {initialsOf(handle)}
    </span>
  );
}

export function KortextAgentsRoute() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [llm, setLlm] = useState<LlmConfig | null>(null);

  const loadLlm = useCallback(() => {
    apiGet<LlmConfig>('/api/llm-models')
      .then(setLlm)
      .catch(() => setLlm(null));
  }, []);

  useEffect(() => {
    let alive = true;
    apiGet<PersonasResponse>('/api/personas')
      .then((r) => alive && setPersonas(r.personas))
      .catch(() => alive && setPersonas([]));
    loadLlm();
    return () => {
      alive = false;
    };
  }, [loadLlm]);

  // No `meta` — the description already shows as the body's first line; keeping it
  // out of the panel-head avoids colliding with the model picker on the right.
  const items: FBItem[] = useMemo(
    () => personas.map((p) => ({ id: p.id, name: p.handle })),
    [personas],
  );
  // Assignments are keyed by handle; map the FileBrowser's active id back to it.
  const handleById = useMemo(
    () => Object.fromEntries(personas.map((p) => [p.id, p.handle])),
    [personas],
  );

  const loadBody = useCallback(async (id: string) => {
    const r = await apiGet<PersonaDetail>(`/api/personas/${encodeURIComponent(id)}`);
    return r.persona.systemPrompt;
  }, []);

  const assign = useCallback(
    async (handle: string, model: string) => {
      await apiPut(`/api/llm-models/assignment/${encodeURIComponent(handle)}`, { model: model || null });
      loadLlm();
    },
    [loadLlm],
  );

  // Providers that actually have models entered — the picker's option groups.
  const providerEntries = llm ? Object.entries(llm.providers).filter(([, c]) => c.models.length) : [];
  const hasModels = providerEntries.length > 0;

  const detailExtra = (id: string) => {
    const handle = handleById[id];
    if (!handle) return null;
    if (!hasModels) {
      return (
        <span className="upd faint" style={{ fontSize: 11.5 }}>
          No models yet — add them in LLM models
        </span>
      );
    }
    return (
      <SetSelect value={llm?.assignments[handle] ?? ''} onChange={(m) => assign(handle, m)}>
        <option value="">— model —</option>
        {providerEntries.map(([pid, c]) => (
          <optgroup key={pid} label={PROVIDER_LABEL[pid] ?? pid}>
            {c.models.map((m) => (
              <option key={pid + m} value={m}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
      </SetSelect>
    );
  };

  return (
    <FileBrowser
      title="Agents"
      sub="View each agent and assign its model"
      items={items}
      loadBody={loadBody}
      mode="ro"
      hideListMeta
      renderIcon={(it) => <PersonaBadge handle={it.name} />}
      detailExtra={detailExtra}
    />
  );
}
