/**
 * Kortext › Rules (engine scope) — GET /api/docs/rules + /api/docs/rules/:file.
 *
 * Read-only markdown browser (`.kpane[data-k=rules]` in wireframe-v6-hifi.html).
 * Rules are package-defined content sourced from the npm package, not the
 * project — hence read-only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api.ts';
import { FileBrowser, type FBItem } from '../../components/v6/FileBrowser.tsx';

type DocsListResponse = { files: { name: string; size: number; mtime: number }[] };
type DocResponse = { body: string };

export function RulesRoute() {
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    apiGet<DocsListResponse>('/api/docs/rules')
      .then((r) => alive && setFiles(r.files.map((f) => f.name)))
      .catch(() => alive && setFiles([]));
    return () => {
      alive = false;
    };
  }, []);

  const items: FBItem[] = useMemo(
    () => files.map((name) => ({ id: name, name, status: 'ro' as const })),
    [files],
  );

  const loadBody = useCallback(async (id: string) => {
    const r = await apiGet<DocResponse>(`/api/docs/rules/${encodeURIComponent(id)}`);
    return r.body;
  }, []);

  return <FileBrowser title="Rules" items={items} loadBody={loadBody} mode="ro" />;
}
