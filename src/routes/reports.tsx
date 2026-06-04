/**
 * Reports — per-file agent reports (status / test / security / release …).
 *
 * Pure read-only: the engine writes these, humans only read. Uses the shared
 * {@link FileBrowser} in `ro` mode (no annotation affordance, just the
 * read-only badge). Markdown tables render via the `.md-table` support already
 * built into AnnotatableDoc / markdown.ts.
 *
 * Data is real (`GET /api/docs/reports` + `/:file`).
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { apiGet, usePolling } from '../lib/api.ts';
import { FileBrowser, type FBItem } from '../components/v6/FileBrowser.tsx';

type DocsList = { scope: string; files: { name: string; size: number; mtime: number }[] };
type DocBody = { scope: string; file: string; body: string };

export function ReportsRoute() {
  const { data, loading, error } = usePolling<DocsList>('/api/docs/reports', 15000);

  const items: FBItem[] = useMemo(
    () =>
      (data?.files ?? []).map((f) => ({
        id: f.name,
        name: f.name,
        meta: relDate(f.mtime),
      })),
    [data],
  );

  const loadBody = useCallback(
    (id: string) => apiGet<DocBody>(`/api/docs/reports/${id}`).then((r) => r.body),
    [],
  );

  if (loading && !data) return <FbMessage>Loading reports…</FbMessage>;
  if (error && !data) return <FbMessage>Couldn't load reports — {error}</FbMessage>;

  return <FileBrowser title="Reports" items={items} loadBody={loadBody} mode="ro" />;
}

/** Compact "last modified" label for the file list (mtime is Unix-ms). */
function relDate(mtime: number): string {
  if (!mtime) return '';
  const days = Math.floor((Date.now() - mtime) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(mtime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function FbMessage({ children }: { children: ReactNode }) {
  return (
    <div className="fbrowser">
      <div style={{ padding: '40px 28px', color: 'var(--fg-faint)', fontSize: 13 }}>{children}</div>
    </div>
  );
}
