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
import { ArrowRight, Check, PenLine, X, Sparkles, Sun, Moon, Eclipse, Bell, Search, SlidersHorizontal, FileText } from 'lucide-react';
import { apiGet, apiPost, apiPut, usePolling, useProjectMeta } from '../lib/api.ts';
import type { SetupView, SetupStep, SetupStepStatus, SetupPipeline } from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import { useTheme } from '../app/theme.ts';
import { Footer } from '../app/Footer.tsx';
import { ShellMenus } from '../app/ShellMenus.tsx';
import { Terminal } from '../app/Terminal.tsx';
import { Drawer } from './v6/Drawer.tsx';
import { AnnotatableDoc } from './v6/AnnotatableDoc.tsx';
import { docsPathFor, artifactFilename } from '../routes/initializing.tsx';

// Canonical status vocabulary (Eray): queued=not started · drafting=being
// written · pending=awaiting approval · approved=done. Mirrors FileBrowser's
// STATUS_PILL so every screen reads the same.
const PILL: Record<SetupStepStatus, { label: string; cls: string }> = {
  approved: { label: 'approved', cls: 's-green' }, // human passed a +prime gate
  done: { label: 'done', cls: 's-neutral' }, // gate-less completion
  review: { label: 'pending', cls: 's-blue' },
  running: { label: 'drafting', cls: 's-amber' },
  queued: { label: 'queued', cls: 's-neutral' },
  failed: { label: 'failed', cls: 's-red' },
};

const short = (h: string | null | undefined): string => (h ?? '?').replace(/^\+/, '');
const isMd = (label: string): boolean => /\.md$/i.test(label);

/**
 * Activity-feed text, conjugated from the step's status (approach (i)):
 *   drafting → "<label> hazırlanıyor…" · pending → "<label> hazır — onayını
 *   bekliyor" · approved → the workflow's result sentence (`activity`).
 */
function activityText(step: SetupStep): string {
  switch (step.status) {
    case 'running':
      return `${step.label} hazırlanıyor…`;
    case 'review':
      return `${step.label} hazır — onayını bekliyor`;
    case 'failed':
      return `${step.label} başarısız oldu`;
    case 'done':
    default:
      return step.activity ?? step.label;
  }
}

/** HH:MM from a Unix-ms timestamp; em-dash while the step hasn't started. */
function clock(ms: number | null): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Compact elapsed label: "12s" · "2m 03s" · "1h 04m". null inputs → null. */
export function formatDuration(fromMs: number | null, toMs: number | null): string | null {
  if (fromMs == null || toMs == null) return null;
  const sec = Math.max(0, Math.round((toMs - fromMs) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Render YAML/non-markdown artifacts as a fenced code block so the markdown
 *  renderer shows them verbatim (a `<pre class=md-code>`) instead of mangling
 *  `- key:` lines into list items. `.md` passes through untouched. */
function asMarkdown(artifactPath: string | null, body: string): string {
  if (artifactPath && /\.ya?ml$/i.test(artifactPath)) {
    return `\`\`\`yaml\n${body.replace(/\n+$/, '')}\n\`\`\``;
  }
  return body;
}

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
          <PhaseRail pipelines={pipelines} onReview={(s) => setOpenKey(s.key)} />
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

      {/* Footer popovers (Agents / Worktrees / Review up-panels) + Terminal —
          event-driven chrome, mounted so the footer is functional during setup
          too (AppShell mounts the same set for the dashboard). */}
      <ShellMenus />
      <Terminal />
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
function PhaseRail({
  pipelines,
  onReview,
}: {
  pipelines: SetupPipeline[];
  onReview: (s: SetupStep) => void;
}) {
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
            // Openable when the step has an artifact to read (a review gate, or
            // an already-approved/done file) — same rule as the activity rows.
            const openable = s.artifactPath != null || s.questionId != null;
            return (
              <div
                className={`nav-item${isMd(s.label) ? ' setup-file' : ''}${openable ? ' setup-file-open' : ''}`}
                key={s.key}
                title={s.label}
                role={openable ? 'button' : undefined}
                tabIndex={openable ? 0 : undefined}
                onClick={openable ? () => onReview(s) : undefined}
                onKeyDown={
                  openable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onReview(s);
                        }
                      }
                    : undefined
                }
              >
                {isMd(s.label) && <FileText className="ic" />}
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
            <div className="act-empty">Waiting for the first stage to start…</div>
          ) : (
            activity.map(({ step }) => {
              const pill = PILL[step.status];
              // The whole row is selectable when there's an artifact to open
              // (review or approved) — mirrors the dashboard's clickable rows.
              const openable = step.artifactPath != null || step.questionId != null;
              return (
                <div
                  className={`act-row${step.status === 'running' ? ' live' : ''}${openable ? ' act-link' : ''}`}
                  key={step.key}
                  role={openable ? 'button' : undefined}
                  tabIndex={openable ? 0 : undefined}
                  onClick={openable ? () => onReview(step) : undefined}
                  onKeyDown={
                    openable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onReview(step);
                          }
                        }
                      : undefined
                  }
                >
                  <span className="mono act-t">{clock(step.startedAt)}</span>
                  <div className="act-who">
                    <SetupAgentToken who={step.persona} />
                  </div>
                  <div className="act-main">
                    <div className="act-text">{activityText(step)}</div>
                  </div>
                  <div className="act-meta">
                    {/* How long the step took — shown once it has finished. */}
                    {(step.status === 'done' || step.status === 'approved') &&
                      formatDuration(step.startedAt, step.endedAt) && (
                        <span className="mono act-dur">{formatDuration(step.startedAt, step.endedAt)}</span>
                      )}
                    {step.status === 'review' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReview(step);
                        }}
                      >
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

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Icon-only persona circle (no name) — used in the drawer header so the persona
 * isn't duplicated next to the file title. Mirrors the initializing Avatar. */
function Avatar({ handle, size = 24 }: { handle: string | null; size?: number }) {
  const { color, icon: Icon } = personaPalette(handle);
  return (
    <span
      className="avatar"
      title={handle ?? undefined}
      style={{
        width: size,
        height: size,
        background: rgba(color, 0.1),
        border: `1.5px solid ${rgba(color, 0.65)}`,
        color,
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={2} />
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
  // Open for an active gate (approve/revise) OR just to READ an already
  // approved/done artifact (no actions, read-only) — sidebar files open both.
  const isGate = step?.questionId != null;
  const open = !!step && (step.questionId != null || step.artifactPath != null);
  const docsPath = step ? docsPathFor(step.artifactPath) : null;

  const [body, setBody] = useState('');
  const [bodyState, setBodyState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [reloadNonce, setReloadNonce] = useState(0);
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
  }, [loadKey, open, reloadNonce]);

  const [busy, setBusy] = useState(false);
  const [reviseMode, setReviseMode] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // "Ask AI" line-annotation (references clarify system): select a line, ask the
  // owning agent, propose a full revision, apply it back to the doc.
  const [annotating, setAnnotating] = useState(false);

  useEffect(() => {
    setReviseMode(false);
    setReason('');
    setErr(null);
    setBusy(false);
    setAnnotating(false);
  }, [step?.key]);

  // Clarify handlers — same endpoints the References reader uses, scoped to this
  // artifact's path (e.g. /api/docs/references/LEGAL.md/explain).
  const onAsk = useCallback(
    async (q: { lines: number[]; quote: string; question: string; history: { role: 'prime' | 'agent'; text: string }[] }) => {
      const r = await apiPost<{ answer: string }>(`${docsPath}/explain`, {
        question: q.question,
        quote: q.quote,
        history: q.history,
      });
      return r.answer;
    },
    [docsPath],
  );
  const onPropose = useCallback(
    async (q: { line: number; quote: string; instruction: string; history: { role: 'prime' | 'agent'; text: string }[] }) => {
      const r = await apiPost<{ proposal: string }>(`${docsPath}/propose`, {
        instruction: q.instruction,
        quote: q.quote,
        history: q.history,
      });
      return r.proposal;
    },
    [docsPath],
  );
  const onApply = useCallback(
    async (newBody: string) => {
      if (!docsPath) return;
      await apiPut(docsPath, { body: newBody });
      setBody(newBody);
      setAnnotating(false);
      setReloadNonce((n) => n + 1); // re-read so the canonical file content shows
    },
    [docsPath],
  );

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

  const title =
    artifactFilename(step?.artifactPath) === '—' ? (step?.label ?? '') : artifactFilename(step?.artifactPath);

  return (
    <Drawer open={open} onClose={onClose} width={920}>
      {step && (
        <>
          {/* Header — icon-only Avatar (persona name lives in the subtitle, not
              duplicated) + action buttons at the TOP, like the references reader. */}
          <div className="dr-head">
            <Avatar handle={step.persona} size={24} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="page-title mono" style={{ fontSize: 14 }}>
                {title}
              </span>
              <span className="metric-sub">
                {short(step.persona)}
                {step.phase ? ` · ${step.phase}` : ''}
              </span>
            </div>
            <span className={`st-pill ${PILL[step.status].cls}`} style={{ marginLeft: 'auto' }}>
              {PILL[step.status].label}
            </span>
            {/* Ask AI — line-level clarify/revise (references system). Toggles the
                annotation affordance on the doc below. */}
            {bodyState === 'ready' && docsPath && !reviseMode && (
              annotating ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setAnnotating(false)}>
                  <Check style={{ width: 13, height: 13 }} /> Bitti
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAnnotating(true)}>
                  <Sparkles style={{ width: 13, height: 13 }} /> Ask AI
                </button>
              )
            )}
            {isGate && !reviseMode && !annotating && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setReviseMode(true)}>
                  <PenLine style={{ width: 13, height: 13 }} /> Revize
                </button>
                <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => void answer('approve')}>
                  <Check style={{ width: 13, height: 13 }} /> Onayla
                </button>
              </>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} style={{ marginLeft: 6 }}>
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>

          {/* Inline revise — appears just under the header (references pattern). */}
          {reviseMode && (
            <div className="dr-revise">
              <input
                className="rb-input"
                autoFocus
                value={reason}
                placeholder="Revizyon nedenini yaz…"
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && reason.trim()) void answer(reason.trim());
                }}
                style={{ flex: 1 }}
              />
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
                <PenLine style={{ width: 13, height: 13 }} /> Gönder
              </button>
            </div>
          )}
          {err ? <div className="dr-err">{err}</div> : null}

          <div className="dr-body setup-doc-mono" style={{ padding: 0 }}>
            {bodyState === 'loading' ? (
              <div className="fb-md" style={{ color: 'var(--fg-faint)' }}>
                Yükleniyor…
              </div>
            ) : bodyState === 'error' || !docsPath ? (
              <div className="fb-md" style={{ color: 'var(--fg-faint)' }}>
                Döküman henüz okunamıyor{step.artifactPath ? ` (${step.artifactPath})` : ''}.
              </div>
            ) : (
              // Reading: yaml wrapped as a clean code block. Annotating: raw body
              // so each line is individually selectable for Ask AI / revise.
              <AnnotatableDoc
                markdown={annotating ? body : asMarkdown(step.artifactPath, body)}
                mode="clarify"
                annotating={annotating}
                onAsk={onAsk}
                onPropose={onPropose}
                onApply={onApply}
              />
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
