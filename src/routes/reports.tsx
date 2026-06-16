/**
 * Reports — per-file agent reports (status / test / security / release …).
 *
 * The engine writes these; humans read and can "Ask AI" about any line
 * (clarify chat). They are generated records, so there is no revise/apply —
 * `onAsk` only, no `onPropose`/`onApply`. Uses the shared {@link FileBrowser}.
 * Markdown tables render via the `.md-table` support in AnnotatableDoc.
 *
 * Data is real (`GET /api/docs/reports` + `/:file`); chat via `…/:file/explain`.
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { apiGet, apiPost, usePolling } from '../lib/api.ts';
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

  // Ask AI about a report line — chat only (no revise: reports are records).
  const onAsk = useCallback(
    async (
      id: string,
      q: { lines: number[]; quote: string; question: string; history: { role: 'prime' | 'agent'; text: string }[] },
    ) => {
      const r = await apiPost<{ answer: string }>(`/api/docs/reports/${id}/explain`, {
        question: q.question,
        quote: q.quote,
        history: q.history,
      });
      return r.answer;
    },
    [],
  );

  if (loading && !data) return <FbMessage>Loading reports…</FbMessage>;
  if (error && !data) return <FbMessage>Couldn't load reports — {error}</FbMessage>;

  return (
    <FileBrowser
      title="Reports"
      sub={`${items.length} file${items.length === 1 ? '' : 's'} · test, status & release reports`}
      items={items}
      loadBody={loadBody}
      mode="clarify"
      onAsk={onAsk}
    />
  );
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
