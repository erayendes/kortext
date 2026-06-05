/**
 * Project Initializing (v6) — the one-screen timeline shown during project
 * setup, after onboarding and before the development cycle begins.
 *
 * Each row is one artifact/task being produced by a persona (LEGAL.md by
 * +legal-expert, GROWTH.md by +growth-expert, PRD.md by +product-manager …).
 * +prime walks the timeline top-to-bottom, opening each artifact and either
 * approving it or sending it back with a revision reason.
 *
 * Data is real: `GET /api/questions` (polled ~1.5s) supplies one row per
 * pending/answered question, each carrying init metadata (`artifact_path`,
 * `persona`, `phase`). The row status is *derived* from that list (see
 * `deriveRows`). Approve → `POST /api/runs/:runId/approve`; revise →
 * `POST /api/questions/:id/answer` with the reason as the answer.
 *
 * Pure derivations (status machine, artifact-path → docs route, filename) are
 * exported so `tests/initializing.web.test.tsx` can pin them without rendering.
 *
 * TODO(v6): lifecycle gating — auto-show this view while the project is in its
 * init phase and auto-route to the dashboard once the first development cycle
 * starts. The trigger (a blueprint/init-status signal) isn't wired here yet, so
 * the screen is simply reachable at /initializing; a redirect can replace the
 * manual route when that signal exists.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Check, PenLine, X, Loader2 } from 'lucide-react';
import { apiGet, apiPost, usePolling } from '../lib/api.ts';
import type { PendingQuestion } from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import { AnnotatableDoc } from '../components/v6/AnnotatableDoc.tsx';
import { Drawer } from '../components/v6/Drawer.tsx';

// ───────────────────────── pure derivations (tested) ─────────────────────────

export type InitStatus = 'initializing' | 'waiting' | 'need_action' | 'approved';

export type InitRow = {
  /** Stable React key — the question id when present, else the artifact path. */
  key: string;
  /** The question driving this row (null while the artifact is still generating). */
  question: PendingQuestion | null;
  status: InitStatus;
  persona: string | null;
  /** e.g. `.kortext/references/LEGAL.md`. */
  artifactPath: string | null;
  /** Display filename, e.g. `LEGAL.md`. */
  filename: string;
  phase: string | null;
};

const STATUS_META: Record<InitStatus, { label: string; cls: string }> = {
  initializing: { label: 'Initializing', cls: 'tag-warn' },
  waiting: { label: 'Waiting', cls: 'tag-warn' },
  need_action: { label: 'Need action', cls: 'tag-block' },
  approved: { label: 'Approved', cls: 'tag-live' },
};

/** True when an answer string means "approve" (anything else = revise/reject). */
export function isApprove(answer: string | null | undefined): boolean {
  return (answer ?? '').trim().toLowerCase() === 'approve';
}

/** Last path segment of an artifact path, e.g. `.kortext/references/LEGAL.md` → `LEGAL.md`. */
export function artifactFilename(path: string | null | undefined): string {
  if (!path) return '—';
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Resolve a question's status into one of the four timeline states.
 *
 *  - answered + answer==='approve'  → approved
 *  - status==='open'                → need_action (a question is waiting on +prime)
 *  - answered but not approve       → waiting (revision sent; the agent is reworking)
 *  - anything else (expired/etc.)   → waiting
 *
 * A row with no question at all (artifact still being generated) is `initializing`;
 * that case is handled in `deriveRows`, not here.
 */
export function questionStatus(q: PendingQuestion): InitStatus {
  if (q.status === 'answered') {
    return isApprove(q.answer) ? 'approved' : 'waiting';
  }
  if (q.status === 'open') return 'need_action';
  return 'waiting';
}

/**
 * Build the timeline rows from the questions list.
 *
 * Each question becomes a row. Rows are ordered by phase appearance then by
 * question id, so the timeline reads in roughly the order artifacts are
 * produced. Approved rows sink to the bottom is *not* applied — order is stable
 * so +prime can watch a row flip in place from Need action → Approved.
 */
export function deriveRows(questions: PendingQuestion[]): InitRow[] {
  return [...questions]
    .sort((a, b) => a.id - b.id)
    .map((q) => ({
      key: `q-${q.id}`,
      question: q,
      status: questionStatus(q),
      persona: q.persona ?? null,
      artifactPath: q.artifact_path ?? null,
      filename: artifactFilename(q.artifact_path),
      phase: q.phase ?? null,
    }));
}

/**
 * Map an artifact path to the shared docs endpoint (`GET /api/docs/:scope/:file`).
 *
 * Paths look like `.kortext/references/LEGAL.md`; the docs router exposes the
 * workspace subdirs as scopes (`references`, `foundation`, `reports`, `memory`).
 * We take the directory segment immediately under `.kortext/` as the scope and
 * the final `.md` filename as the file. Returns null when the path can't be
 * mapped (so the viewer shows a graceful fallback rather than a bad request).
 */
export function docsPathFor(artifactPath: string | null | undefined): string | null {
  if (!artifactPath) return null;
  const segs = artifactPath.split('/').filter(Boolean);
  // Drop a leading `.kortext` if present.
  const rel = segs[0] === '.kortext' ? segs.slice(1) : segs;
  if (rel.length < 2) return null;
  const scope = rel[0]!;
  const file = rel[rel.length - 1]!;
  if (!/\.md$/.test(file)) return null;
  return `/api/docs/${encodeURIComponent(scope)}/${encodeURIComponent(file)}`;
}

// ──────────────────────────────── route ──────────────────────────────────────

export function InitializingRoute() {
  const [nonce, setNonce] = useState(0);
  return <InitializingView key={nonce} onRefresh={() => setNonce((n) => n + 1)} />;
}

function InitializingView({ onRefresh }: { onRefresh: () => void }) {
  const { data, error, loading, refresh } = usePolling<{ questions: PendingQuestion[] }>(
    '/api/questions',
    1500,
  );
  const rows = useMemo(() => deriveRows(data?.questions ?? []), [data]);
  const [openRow, setOpenRow] = useState<InitRow | null>(null);
  // When the drawer is opened via the row's "Revize" button, land directly in
  // revise mode; a plain row/"görüntüle" open lands in read mode.
  const [openRevise, setOpenRevise] = useState(false);
  // Key of the row whose inline "Onayla" POST is in flight (guards double-fire).
  const [approvingKey, setApprovingKey] = useState<string | null>(null);

  // Keep the open drawer's row fresh as polling reconciles status/answer.
  const liveOpenRow = useMemo(() => {
    if (!openRow) return null;
    return rows.find((r) => r.key === openRow.key) ?? openRow;
  }, [openRow, rows]);

  // Inline approve — mirrors the drawer's approve path so +prime can clear a row
  // straight from the timeline without opening it (the screen-level fix for the
  // dead row buttons). Run-bound questions approve via the run endpoint; loose
  // questions answer directly.
  const approveRow = useCallback(
    async (row: InitRow) => {
      const q = row.question;
      if (!q || approvingKey) return;
      setApprovingKey(row.key);
      try {
        if (q.run_id != null) {
          await apiPost(`/api/runs/${q.run_id}/approve`, {
            answer: 'approve',
            answered_by: 'prime',
          });
        } else {
          await apiPost(`/api/questions/${q.id}/answer`, {
            answer: 'approve',
            answered_by: 'prime',
          });
        }
        refresh();
      } finally {
        setApprovingKey(null);
      }
    },
    [approvingKey, refresh],
  );

  const openRowAt = useCallback((row: InitRow, revise: boolean) => {
    setOpenRevise(revise);
    setOpenRow(row);
  }, []);

  const remaining = rows.filter((r) => r.status !== 'approved').length;

  return (
    <div className="dash">
      <div className="dash-main">
        <div
          className="sec-h"
          style={{ marginBottom: 18, alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div>
            <div className="page-title" style={{ fontSize: 18 }}>
              Proje hazırlanıyor
            </div>
            <div className="metric-sub" style={{ marginTop: 4 }}>
              Ajanlar başlangıç dökümanlarını üretiyor. Her birini aç, onayla ya da revize iste.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="sec-c">
              {remaining === 0 && rows.length > 0
                ? 'Hepsi onaylandı'
                : `${remaining} bekliyor`}
            </span>
            <button
              type="button"
              className="btn btn-line btn-sm"
              onClick={() => {
                refresh();
                onRefresh();
              }}
            >
              <RefreshCw style={{ width: 13, height: 13 }} /> Yenile
            </button>
          </div>
        </div>

        <div className="work">
          {loading && !data ? (
            <EmptyRow text="Zaman çizelgesi yükleniyor…" />
          ) : error && !data ? (
            <EmptyRow text={`Yüklenemedi — ${error}`} />
          ) : rows.length === 0 ? (
            <EmptyRow text="Henüz üretilen döküman yok — ajanlar başladığında burada görünecek." />
          ) : (
            rows.map((row, i) => (
              <TimelineRow
                key={row.key}
                row={row}
                index={i}
                approving={approvingKey === row.key}
                onOpen={() => openRowAt(row, false)}
                onApprove={() => void approveRow(row)}
                onRevise={() => openRowAt(row, true)}
              />
            ))
          )}
        </div>
      </div>

      <ArtifactDrawer
        row={liveOpenRow}
        initialRevise={openRevise}
        onClose={() => setOpenRow(null)}
        onAnswered={() => {
          refresh();
          setOpenRow(null);
        }}
      />
    </div>
  );
}

// ──────────────────────────────── timeline row ───────────────────────────────

function TimelineRow({
  row,
  index,
  approving,
  onOpen,
  onApprove,
  onRevise,
}: {
  row: InitRow;
  index: number;
  approving: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onRevise: () => void;
}) {
  const meta = STATUS_META[row.status];
  const Initializing = row.status === 'initializing';
  return (
    <div
      className="work-row rise"
      style={{ animationDelay: `${index * 30}ms` }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="w-left">
        <span className={`tag ${meta.cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {Initializing ? <Loader2 style={{ width: 10, height: 10 }} className="spin" /> : null}
          {meta.label}
        </span>
        <Avatar handle={row.persona} size={18} />
        <span className="w-name">{short(row.persona)}</span>
        <span className="w-id" aria-hidden>·</span>
        <span className="w-desc mono">{row.filename}</span>
      </div>
      <div className="w-right" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {row.status === 'need_action' ? (
          <span className="prime-acts">
            <button
              type="button"
              className="btn btn-sm btn-approve"
              disabled={approving}
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
            >
              {approving ? (
                <Loader2 style={{ width: 12, height: 12 }} className="spin" />
              ) : (
                <Check style={{ width: 12, height: 12 }} />
              )}{' '}
              Onayla
            </button>
            <button
              type="button"
              className="btn btn-line btn-sm"
              disabled={approving}
              onClick={(e) => {
                e.stopPropagation();
                onRevise();
              }}
            >
              <PenLine style={{ width: 12, height: 12 }} /> Revize
            </button>
          </span>
        ) : (
          <span className="w-name" style={{ color: 'var(--fg-faint)' }}>
            {row.status === 'approved' ? 'onaylandı' : 'görüntüle'}
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────── artifact drawer ────────────────────────────

function ArtifactDrawer({
  row,
  initialRevise,
  onClose,
  onAnswered,
}: {
  row: InitRow | null;
  initialRevise: boolean;
  onClose: () => void;
  onAnswered: () => void;
}) {
  const open = !!row;
  const docsPath = row ? docsPathFor(row.artifactPath) : null;

  // Load the artifact body whenever the open row changes.
  const [body, setBody] = useState<string>('');
  const [bodyState, setBodyState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const loadKey = row?.artifactPath ?? null;
  useEffect(() => {
    if (!open || !docsPath) {
      setBody('');
      setBodyState(open && !docsPath ? 'error' : 'idle');
      return;
    }
    let alive = true;
    setBodyState('loading');
    apiGet<{ body: string }>(docsPath)
      .then((r) => {
        if (alive) {
          setBody(r.body);
          setBodyState('ready');
        }
      })
      .catch(() => {
        if (alive) {
          setBody('');
          setBodyState('error');
        }
      });
    return () => {
      alive = false;
    };
    // Reload only when the underlying artifact changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, open]);

  const [busy, setBusy] = useState(false);
  const [reviseMode, setReviseMode] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Reset the per-row action state when the drawer target changes. Honour the
  // entry mode: opening via the row's "Revize" button lands in revise mode.
  useEffect(() => {
    setReviseMode(initialRevise && row?.status === 'need_action');
    setReason('');
    setErr(null);
    setBusy(false);
  }, [row?.key, initialRevise, row?.status]);

  const approve = useCallback(async () => {
    if (!row?.question || busy) return;
    const runId = row.question.run_id;
    setBusy(true);
    setErr(null);
    try {
      if (runId != null) {
        await apiPost(`/api/runs/${runId}/approve`, { answer: 'approve', answered_by: 'prime' });
      } else {
        // No run binding — fall back to answering the question directly.
        await apiPost(`/api/questions/${row.question.id}/answer`, {
          answer: 'approve',
          answered_by: 'prime',
        });
      }
      onAnswered();
    } catch (e) {
      setErr(answerErr(e));
      setBusy(false);
    }
  }, [row, busy, onAnswered]);

  const submitRevise = useCallback(async () => {
    if (!row?.question || busy) return;
    const text = reason.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      await apiPost(`/api/questions/${row.question.id}/answer`, {
        answer: text,
        answered_by: 'prime',
      });
      onAnswered();
    } catch (e) {
      setErr(answerErr(e));
      setBusy(false);
    }
  }, [row, reason, busy, onAnswered]);

  const canAct = !!row?.question && row.status === 'need_action';

  return (
    <Drawer open={open} onClose={onClose} width={620}>
      {row && (
        <>
          <div className="dr-head">
            <Avatar handle={row.persona} size={22} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="page-title mono" style={{ fontSize: 14 }}>
                {row.filename}
              </span>
              <span className="metric-sub">
                {short(row.persona)}
                {row.phase ? ` · ${row.phase}` : ''}
              </span>
            </div>
            <span className={`tag ${STATUS_META[row.status].cls}`} style={{ marginLeft: 'auto' }}>
              {STATUS_META[row.status].label}
            </span>
            <button
              type="button"
              className="btn btn-line btn-sm"
              onClick={onClose}
              style={{ marginLeft: 6 }}
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>

          {row.question?.question ? (
            <div
              className="metric-sub"
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--border)',
                color: 'var(--fg-mid)',
              }}
            >
              {row.question.question}
            </div>
          ) : null}

          <div className="dr-body" style={{ padding: 0 }}>
            {bodyState === 'loading' ? (
              <div className="fb-md" style={{ color: 'var(--fg-faint)' }}>
                Yükleniyor…
              </div>
            ) : bodyState === 'error' || !docsPath ? (
              <div className="fb-md" style={{ color: 'var(--fg-faint)' }}>
                Döküman henüz okunamıyor{row.artifactPath ? ` (${row.artifactPath})` : ''}.
              </div>
            ) : (
              <AnnotatableDoc markdown={body} mode="ro" />
            )}
          </div>

          {/* ---- action footer ---- */}
          <div
            style={{
              flexShrink: 0,
              borderTop: '1px solid var(--border)',
              padding: '12px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: 'var(--bg-elev)',
            }}
          >
            {err ? (
              <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>
            ) : null}

            {!canAct ? (
              <span className="metric-sub">
                {row.status === 'approved'
                  ? 'Bu döküman onaylandı.'
                  : row.status === 'waiting'
                    ? 'Revizyon gönderildi — ajan üzerinde çalışıyor.'
                    : 'Henüz aksiyon bekleyen bir soru yok.'}
              </span>
            ) : reviseMode ? (
              <>
                <input
                  className="rb-input"
                  autoFocus
                  value={reason}
                  placeholder="Revizyon nedenini yaz…"
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitRevise();
                  }}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-line btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setReviseMode(false);
                      setReason('');
                    }}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    className="btn btn-pri btn-sm"
                    disabled={busy || !reason.trim()}
                    onClick={() => void submitRevise()}
                  >
                    <PenLine style={{ width: 13, height: 13 }} /> Revize gönder
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-line btn-sm"
                  disabled={busy}
                  onClick={() => setReviseMode(true)}
                >
                  <PenLine style={{ width: 13, height: 13 }} /> Revize
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-approve"
                  disabled={busy}
                  onClick={() => void approve()}
                >
                  <Check style={{ width: 13, height: 13 }} /> Onayla
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

// ──────────────────────────────── small helpers ──────────────────────────────

const short = (h: string | null | undefined): string => (h ?? '?').replace(/^\+/, '');

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Coloured persona circle with its Lucide glyph — mirrors the dashboard avatar. */
function Avatar({ handle, size = 18 }: { handle: string | null; size?: number }) {
  const { color, icon: Icon } = personaPalette(handle);
  const bw = size <= 16 ? 1 : 1.5;
  return (
    <span
      className="avatar"
      title={handle ?? undefined}
      style={{
        width: size,
        height: size,
        background: rgba(color, 0.1),
        border: `${bw}px solid ${rgba(color, 0.65)}`,
        color,
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={size <= 16 ? 1.8 : 2} />
    </span>
  );
}

/** Format an apiPost rejection (ApiPostError-shaped) for a terse inline note. */
function answerErr(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; error?: unknown };
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.error === 'string') return o.error;
  }
  return e instanceof Error ? e.message : String(e);
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      className="work-row"
      style={{ cursor: 'default', color: 'var(--fg-faint)', fontSize: 12.5 }}
    >
      {text}
    </div>
  );
}
