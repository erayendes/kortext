/**
 * Foundation — the project's foundational docs (PRD / vision / business basis).
 *
 * Same shape as References: the shared {@link FileBrowser} in `clarify` mode
 * over `GET /api/docs/foundation` + `/:file`. These are agent-written,
 * +prime-gated documents — read-here, explain-on-demand.
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { apiGet, apiPost, apiPut, usePolling } from '../lib/api.ts';
import { FileBrowser, type FBItem } from '../components/v6/FileBrowser.tsx';

type DocsList = { scope: string; files: { name: string; size: number; mtime: number }[] };
type DocBody = { scope: string; file: string; body: string };

export function FoundationRoute() {
  const { data, loading, error } = usePolling<DocsList>('/api/docs/foundation', 15000);

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
    (id: string) => apiGet<DocBody>(`/api/docs/foundation/${id}`).then((r) => r.body),
    [],
  );

  // Explain chat + propose→preview→apply, same as Memory but scoped to foundation.
  const onAsk = useCallback(
    async (
      id: string,
      q: { lines: number[]; quote: string; question: string; history: { role: 'prime' | 'agent'; text: string }[] },
    ) => {
      const r = await apiPost<{ answer: string }>(`/api/docs/foundation/${id}/explain`, {
        question: q.question,
        quote: q.quote,
        history: q.history,
      });
      return r.answer;
    },
    [],
  );

  const onPropose = useCallback(
    async (
      id: string,
      q: { line: number; quote: string; instruction: string; history: { role: 'prime' | 'agent'; text: string }[] },
    ) => {
      const r = await apiPost<{ proposal: string }>(`/api/docs/foundation/${id}/propose`, {
        instruction: q.instruction,
        quote: q.quote,
        history: q.history,
      });
      return r.proposal;
    },
    [],
  );

  const onApply = useCallback(async (id: string, body: string) => {
    await apiPut(`/api/docs/foundation/${id}`, { body });
  }, []);

  if (loading && !data) return <FbMessage>Loading foundation…</FbMessage>;
  if (error && !data) return <FbMessage>Couldn't load foundation — {error}</FbMessage>;

  return (
    <FileBrowser
      title="Foundation"
      sub={`${items.length} files · product & business basis, +prime-gated`}
      items={items}
      loadBody={loadBody}
      mode="clarify"
      onAsk={onAsk}
      onPropose={onPropose}
      onApply={onApply}
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
    <div className="full">
      <div style={{ padding: '40px 28px', color: 'var(--fg-faint)', fontSize: 13 }}>{children}</div>
    </div>
  );
}
