/**
 * Kortext › Agents (engine scope) — GET /api/personas + /api/personas/:handle.
 *
 * Read-only persona viewer (`.kpane[data-k=agents]` in wireframe-v6-hifi.html):
 * the left list is every loaded persona, the right pane renders the persona's
 * markdown body. Persona definitions are package-defined; a PUT endpoint exists
 * but the viewer stays read-only for now (model assignment lives in
 * Project › Agent models).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api.ts';
import type { PersonaSummary } from '../../lib/api-types.ts';
import { FileBrowser, type FBItem } from '../../components/v6/FileBrowser.tsx';

type PersonasResponse = { personas: PersonaSummary[] };
type PersonaDetail = { persona: { systemPrompt: string } };

export function KortextAgentsRoute() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);

  useEffect(() => {
    let alive = true;
    apiGet<PersonasResponse>('/api/personas')
      .then((r) => alive && setPersonas(r.personas))
      .catch(() => alive && setPersonas([]));
    return () => {
      alive = false;
    };
  }, []);

  const items: FBItem[] = useMemo(
    () =>
      personas.map((p) => ({
        id: p.id,
        name: p.handle,
        meta: p.description,
        status: 'ro' as const,
      })),
    [personas],
  );

  const loadBody = useCallback(async (id: string) => {
    const r = await apiGet<PersonaDetail>(`/api/personas/${encodeURIComponent(id)}`);
    return r.persona.systemPrompt;
  }, []);

  return <FileBrowser title="Agents" items={items} loadBody={loadBody} mode="ro" />;
}
