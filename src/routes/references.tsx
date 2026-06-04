/**
 * References — the team's living, ALL-CAPS reference docs (STACK / API / TEST …).
 *
 * Uses the shared {@link FileBrowser} in `revise` mode: the reviewer selects
 * lines and attaches change requests ("Request changes"), or stamps the whole
 * file "Approve". Both drive a small Approved → Waiting → Approved status
 * machine.
 *
 * Data is real (`GET /api/docs/references` + `/:file`). Status, however, is a
 * route-local overlay — the docs endpoint only reports name/size/mtime, and
 * there is no write endpoint yet, so the revise/approve flow is shown in the
 * UI and persisted only in memory.
 *
 * TODO(v6): when a references write/status endpoint exists, replace the local
 * `statuses` overlay with real POSTs (request-changes → 'review',
 * approve → 'approved').
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { apiGet, usePolling } from '../lib/api.ts';
import { FileBrowser, type FBItem, type FBStatus } from '../components/v6/FileBrowser.tsx';

type DocsList = { scope: string; files: { name: string; size: number; mtime: number }[] };
type DocBody = { scope: string; file: string; body: string };

export function ReferencesRoute() {
  const { data, loading, error } = usePolling<DocsList>('/api/docs/references', 15000);
  // Local status machine, keyed by filename. Living references default to
  // "approved"; a revise request moves a file to "review" (waiting), and an
  // explicit Approve returns it to "approved".
  const [statuses, setStatuses] = useState<Record<string, FBStatus>>({});
  const activeRef = useRef<string | null>(null);
  const toast = useToast();

  const items: FBItem[] = useMemo(
    () =>
      (data?.files ?? []).map((f) => ({
        id: f.name,
        name: f.name,
        status: statuses[f.name] ?? 'approved',
        meta: relDate(f.mtime),
      })),
    [data, statuses],
  );

  // loadBody fires whenever FileBrowser switches files, so it doubles as our
  // "active file" signal for the Approve button (which lives in headerActions
  // and otherwise has no view onto FileBrowser's internal selection).
  const loadBody = useCallback((id: string) => {
    activeRef.current = id;
    return apiGet<DocBody>(`/api/docs/references/${id}`).then((r) => r.body);
  }, []);

  const onAnnotate = useCallback(
    (id: string, lines: number[]) => {
      setStatuses((s) => ({ ...s, [id]: 'review' }));
      toast.fire(`Change requested · ${lines.length} line(s) recorded locally`);
      // TODO(v6): POST the change request once a references write endpoint lands.
    },
    [toast],
  );

  const approve = useCallback(() => {
    const id = activeRef.current;
    if (!id) return;
    setStatuses((s) => ({ ...s, [id]: 'approved' }));
    toast.fire(`Approved · ${id}`);
    // TODO(v6): POST approval once a references status endpoint lands.
  }, [toast]);

  if (loading && !data) return <FbMessage>Loading references…</FbMessage>;
  if (error && !data) return <FbMessage>Couldn't load references — {error}</FbMessage>;

  return (
    <>
      <FileBrowser
        title="References"
        items={items}
        loadBody={loadBody}
        mode="revise"
        onAnnotate={onAnnotate}
        headerActions={
          items.length > 0 ? (
            <button className="btn btn-sm btn-approve" onClick={approve}>
              <Check style={{ width: 13, height: 13 }} />
              Approve
            </button>
          ) : null
        }
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

function FbMessage({ children }: { children: ReactNode }) {
  return (
    <div className="fbrowser">
      <div style={{ padding: '40px 28px', color: 'var(--fg-faint)', fontSize: 13 }}>{children}</div>
    </div>
  );
}
