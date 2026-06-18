/**
 * SetupScreen — the live "Project initializing…" screen shown between onboarding
 * and the dashboard. It renders the user's two-panel Setup design wired to real
 * data from `GET /api/setup` (polled): the left rail lists the three pipelines
 * (analysis → planning → environment) with every step + live status; the right
 * stream shows what's happening and surfaces review gates for +prime.
 *
 * Lifecycle: RootGate mounts this while the project is initializing
 * (setup phase ≠ 'development'); once all three pipelines finish, this calls
 * `onOpenDashboard` and the app hands off to the dashboard.
 *
 * Review wiring reuses the proven approve/revise path: a gate step carries a
 * `questionId`, answered via `POST /api/questions/:id/answer` (the same
 * queue.answer path the initializing timeline uses).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, PenLine, X, Sparkles, Sun, Moon, Eclipse, Bell, Search, SlidersHorizontal } from 'lucide-react';
import { apiGet, apiPost, usePolling, useProjectMeta } from '../lib/api.ts';
import type { SetupView, SetupStep, SetupStepStatus, SetupPipeline } from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import { useTheme } from '../app/theme.ts';
import { Footer } from '../app/Footer.tsx';
import { Drawer } from './v6/Drawer.tsx';
import { AnnotatableDoc } from './v6/AnnotatableDoc.tsx';
import { docsPathFor, artifactFilename } from '../routes/initializing.tsx';

const PILL: Record<SetupStepStatus, { label: string; cls: string }> = {
  done: { label: 'done', cls: 's-green' },
  review: { label: 'review', cls: 's-blue' },
  running: { label: 'drafting', cls: 's-amber' },
  queued: { label: 'queued', cls: 's-neutral' },
  failed: { label: 'failed', cls: 's-red' },
};

const short = (h: string | null | undefined): string => (h ?? '?').replace(/^\+/, '');
const isMd = (label: string): boolean => /\.md$/i.test(label);

export function SetupScreen({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  const { data, refresh } = usePolling<SetupView>('/api/setup', 2000);
  const { mode, cycle } = useTheme();
  const ThemeIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Eclipse;

  const pipelines = useMemo(() => data?.pipelines ?? [], [data]);
  const allDone = data?.phase === 'development';

  // Once every pipeline is done, hand off to the dashboard (lifecycle step 3).
  useEffect(() => {
    if (allDone) onOpenDashboard();
  }, [allDone, onOpenDashboard]);

  // The step currently open in the review drawer (kept fresh as polling reconciles).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openStep = useMemo(() => {
    if (!openKey) return null;
    for (const p of pipelines) {
      const s = p.steps.find((st) => st.key === openKey);
      if (s) return s;
    }
    return null;
  }, [openKey, pipelines]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-logo">
          <span className="side-logo-name">kortext</span>
          <span className="ver-pill side-logo-ver">v3</span>
        </div>
        <div className="side-scroll kx-scroll setup-rail">
          <PhaseRail pipelines={pipelines} />
          <div className="side-sec">
            <div className="setup-rail-note">
              When all stages finish and tasks are created, kortext moves to the Dashboard.
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              disabled={!allDone}
              onClick={onOpenDashboard}
            >
              <ArrowRight className="ic" />
              Open dashboard
            </button>
          </div>
        </div>
        <div className="side-foot">
          <span className="kx-settings">
            <Sparkles className="ic" />
            <span className="kx-set-t">kortext</span>
          </span>
          <button className="icon-btn" onClick={cycle} title={`Theme: ${mode}`} aria-label="Cycle theme">
            <ThemeIcon className="ic" style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </aside>

      <div className="main-col">
        <SetupTopbar />
        <div className="content kx-scroll" id="content" style={{ padding: 0 }}>
          <SetupStream pipelines={pipelines} onReview={(s) => setOpenKey(s.key)} />
        </div>
      </div>

      <Footer />

      <ReviewDrawer
        step={openStep}
        onClose={() => setOpenKey(null)}
        onAnswered={() => {
          refresh();
          setOpenKey(null);
        }}
      />
    </div>
  );
}

// ── Header — mirrors the app topbar (no router Links: this renders outside the
// RouterProvider, so the project name is a plain label, not a dashboard Link) ──
function SetupTopbar() {
  const project = useProjectMeta();
  return (
    <header className="topbar">
      <span className="ws-switcher" title="Project">
        <span className="ws-name">{project?.name ?? 'Project'}</span>
      </span>
      <div className="tb-search">
        <div className="input-group">
          <Search className="ic-lead" />
          <input className="input" placeholder="Search items, epics, or go to…" readOnly />
          <span className="kbd" style={{ position: 'absolute', right: 8 }}>
            ⌘K
          </span>
        </div>
      </div>
      <div className="tb-right">
        <button className="icon-btn" title="Tweaks" disabled>
          <SlidersHorizontal className="ic" />
        </button>
        <button className="icon-btn" title="Notifications" disabled>
          <Bell className="ic" />
        </button>
      </div>
    </header>
  );
}

// ── Left rail — one section per pipeline, one row per step ────────────────────
function PhaseRail({ pipelines }: { pipelines: SetupPipeline[] }) {
  if (pipelines.length === 0) {
    return (
      <div className="side-sec">
        <div className="eyebrow">Setup</div>
        <div className="nav-item">
          <span className="grow truncate" style={{ color: 'var(--fg-faint)' }}>
            Loading…
          </span>
        </div>
      </div>
    );
  }
  return (
    <>
      {pipelines.map((p) => (
        <div className="side-sec" key={p.key}>
          <div className="eyebrow">{p.title}</div>
          {p.steps.map((s) => {
            const pill = PILL[s.status];
            return (
              <div className={`nav-item${isMd(s.label) ? ' setup-file' : ''}`} key={s.key} title={s.label}>
                <span className="grow truncate">{s.label}</span>
                <span className={`st-pill ${pill.cls}`}>{pill.label}</span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ── Right stream — live activity + review gates ───────────────────────────────
function SetupStream({
  pipelines,
  onReview,
}: {
  pipelines: SetupPipeline[];
  onReview: (s: SetupStep) => void;
}) {
  // Activity = steps that have started or need attention, in pipeline order.
  const allSteps = pipelines.flatMap((p) => p.steps);
  const activity = pipelines.flatMap((p) =>
    p.steps.filter((s) => s.status !== 'queued').map((s) => ({ pipeline: p.title, step: s })),
  );
  const drafting = allSteps.filter((s) => s.status === 'running').length;
  const reviewing = allSteps.filter((s) => s.status === 'review').length;
  // Surface whatever needs attention: reviews first (the human's turn), else
  // what's being drafted, else idle. "0 stages running" hid pending reviews.
  const badge =
    reviewing > 0
      ? { cls: 's-blue', live: false, text: `${reviewing} awaiting review` }
      : drafting > 0
        ? { cls: 's-amber', live: true, text: `${drafting} drafting` }
        : { cls: 's-neutral', live: false, text: 'idle' };

  return (
    <div className="ob-wrap ob-setup">
      <div className="pg-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="pg-title">Project initializing…</h1>
          <p className="pg-sub">
            Every stage streams here. Review a file from the stream or pick it on the left when it needs you.
          </p>
        </div>
      </div>

      <section className="card setup-activity">
        <div className="panel-head">
          <div className="panel-title">Activity</div>
          <span className={`badge ${badge.cls}`}>
            {badge.live && <span className="dot dot-live" />}
            {badge.text}
          </span>
        </div>
        <div className="act-list">
          {activity.length === 0 ? (
            <div className="act-row">
              <div className="act-main">
                <div className="act-text" style={{ color: 'var(--fg-faint)' }}>
                  Waiting for the first stage to start…
                </div>
              </div>
            </div>
          ) : (
            activity.map(({ step }) => {
              const pill = PILL[step.status];
              return (
                <div className={`act-row${step.status === 'running' ? ' live' : ''}`} key={step.key}>
                  <div className="act-who">
                    <SetupAgentToken who={step.persona} />
                  </div>
                  <div className="act-main">
                    <div className="act-text">{step.label}</div>
                  </div>
                  <div className="act-meta">
                    {step.status === 'review' ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onReview(step)}>
                        Review
                        <ArrowRight className="ic" />
                      </button>
                    ) : (
                      <span className={`st-pill ${pill.cls}`}>{pill.label}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function SetupAgentToken({ who }: { who: string | null }) {
  if (!who) {
    return (
      <span className="badge badge-square s-neutral" style={{ fontWeight: 500 }}>
        system
      </span>
    );
  }
  const { color } = personaPalette(who);
  return (
    <span className="agent" title={who}>
      <span className="adot" style={{ background: color, color }} />
      <span className="truncate">{short(who)}</span>
    </span>
  );
}

// ── Review drawer — load the artifact, approve or revise the gate ─────────────
function ReviewDrawer({
  step,
  onClose,
  onAnswered,
}: {
  step: SetupStep | null;
  onClose: () => void;
  onAnswered: () => void;
}) {
  const open = !!step && step.questionId != null;
  const docsPath = step ? docsPathFor(step.artifactPath) : null;

  const [body, setBody] = useState('');
  const [bodyState, setBodyState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const loadKey = step?.artifactPath ?? null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, open]);

  const [busy, setBusy] = useState(false);
  const [reviseMode, setReviseMode] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setReviseMode(false);
    setReason('');
    setErr(null);
    setBusy(false);
  }, [step?.key]);

  const answer = useCallback(
    async (value: string) => {
      if (!step?.questionId || busy) return;
      setBusy(true);
      setErr(null);
      try {
        await apiPost(`/api/questions/${step.questionId}/answer`, {
          answer: value,
          answered_by: 'prime',
        });
        onAnswered();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setBusy(false);
      }
    },
    [step, busy, onAnswered],
  );

  return (
    <Drawer open={open} onClose={onClose} width={620}>
      {step && (
        <>
          <div className="dr-head">
            <SetupAgentToken who={step.persona} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="page-title mono" style={{ fontSize: 14 }}>
                {artifactFilename(step.artifactPath) === '—' ? step.label : artifactFilename(step.artifactPath)}
              </span>
              <span className="metric-sub">
                {short(step.persona)}
                {step.phase ? ` · ${step.phase}` : ''}
              </span>
            </div>
            <span className="tag tag-warn" style={{ marginLeft: 'auto' }}>
              review
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} style={{ marginLeft: 6 }}>
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>

          <div className="dr-body" style={{ padding: 0 }}>
            {bodyState === 'loading' ? (
              <div className="fb-md" style={{ color: 'var(--fg-faint)' }}>
                Yükleniyor…
              </div>
            ) : bodyState === 'error' || !docsPath ? (
              <div className="fb-md" style={{ color: 'var(--fg-faint)' }}>
                Döküman henüz okunamıyor{step.artifactPath ? ` (${step.artifactPath})` : ''}.
              </div>
            ) : (
              <AnnotatableDoc markdown={body} mode="ro" />
            )}
          </div>

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
            {err ? <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span> : null}
            {reviseMode ? (
              <>
                <input
                  className="rb-input"
                  autoFocus
                  value={reason}
                  placeholder="Revizyon nedenini yaz…"
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && reason.trim()) void answer(reason.trim());
                  }}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
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
                    className="btn btn-primary btn-sm"
                    disabled={busy || !reason.trim()}
                    onClick={() => void answer(reason.trim())}
                  >
                    <PenLine style={{ width: 13, height: 13 }} /> Revize gönder
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setReviseMode(true)}>
                  <PenLine style={{ width: 13, height: 13 }} /> Revize
                </button>
                <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => void answer('approve')}>
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
