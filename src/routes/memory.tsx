/**
 * Memory — the engine's own scratch memory (handover / decisions / learned).
 *
 * Read-only content the engine writes; humans can only *clarify*. Uses the
 * shared {@link FileBrowser} in `clarify` mode: selecting lines and submitting
 * raises questions for the agents — it never edits the document. Submission is
 * surfaced as a toast ("sent to Activity · memory unchanged"); the body stays
 * exactly as the engine wrote it.
 *
 * Data is real (`GET /api/docs/memory` + `/:file`).
 *
 * TODO(v6): route the clarification into the real Activity feed once a
 * questions/clarify endpoint exists — today it is a local acknowledgement.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { apiGet, usePolling } from '../lib/api.ts';
import { FileBrowser, type FBItem } from '../components/v6/FileBrowser.tsx';

type DocsList = { scope: string; files: { name: string; size: number; mtime: number }[] };
type DocBody = { scope: string; file: string; body: string };

export function MemoryRoute() {
  const { data, loading, error } = usePolling<DocsList>('/api/docs/memory', 15000);
  const toast = useToast();

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
    (id: string) => apiGet<DocBody>(`/api/docs/memory/${id}`).then((r) => r.body),
    [],
  );

  const onAnnotate = useCallback(
    (_id: string, _lines: number[], note: string) => {
      const n = note.split('\n').filter(Boolean).length || 1;
      toast.fire(`${n} clarification${n === 1 ? '' : 's'} sent to Activity · memory unchanged`);
      // TODO(v6): deliver to the real Activity feed once a clarify endpoint exists.
    },
    [toast],
  );

  if (loading && !data) return <FbMessage>Loading memory…</FbMessage>;
  if (error && !data) return <FbMessage>Couldn't load memory — {error}</FbMessage>;

  return (
    <>
      <FileBrowser
        title="Memory"
        items={items}
        loadBody={loadBody}
        mode="clarify"
        onAnnotate={onAnnotate}
      />
      {toast.node}
    </>
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

/** Tiny transient toast bound to the v6 `.toast` element (green, auto-fade). */
function useToast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fire = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2800);
  }, []);
  const node = (
    <div className={`toast${show ? ' show' : ''}`}>
      <Check style={{ width: 14, height: 14 }} />
      {msg}
    </div>
  );
  return { fire, node };
}

function FbMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="fbrowser">
      <div style={{ padding: '40px 28px', color: 'var(--fg-faint)', fontSize: 13 }}>{children}</div>
    </div>
  );
}
