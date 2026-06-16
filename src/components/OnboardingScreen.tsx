import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Clipboard,
  Eclipse,
  FileCheck,
  FileText,
  FolderKanban,
  FolderOpen,
  GripVertical,
  Moon,
  Plus,
  Rocket,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';

import { apiGet, apiPost, type ApiPostError } from '../lib/api.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import { useTheme } from '../app/theme.ts';
import { Footer } from '../app/Footer.tsx';
import type {
  BlueprintStatusResponse,
  BlueprintSubmitInput,
  BlueprintSubmitResponse,
  ExecutorChoice,
  ExistingProject,
  ProjectType,
} from '../lib/api-types.ts';

const BLUEPRINT_SAMPLE = `# BRD — Acme CRM

## Vision
A lightweight CRM platform for SMB sales teams. Enables contact management, deal tracking, and automated follow-ups without enterprise complexity.

## Target Users
- Sales reps (10–50 person teams)
- Sales managers who need pipeline visibility

## Core Features (MVP)
1. **Contact & company management** — import CSV, manual entry, merge duplicates
2. **Deal pipeline** — kanban board, stages, probability scoring
3. **Activity log** — calls, emails, meetings linked to contacts/deals
4. **Automated reminders** — follow-up nudges based on inactivity
5. **Reporting** — conversion funnel, rep leaderboard, monthly ARR

## Out of Scope (v1)
- Mobile app (web-first)
- Email sync (phase 2)
- Billing / invoicing

## Tech Preferences
- Frontend: Next.js (App Router), Tailwind CSS
- Backend: Node.js / Express, PostgreSQL
- Auth: Auth0
- Hosting: Vercel + Supabase
- Payments: Stripe (subscription)

## Success Metrics
- Signup to first deal created in under 5 min
- < 500ms p95 page load
- Zero data loss guarantee
`;

const PLATFORM_OPTIONS = ['Web', 'iOS', 'Android', 'Desktop', 'API', 'CLI'] as const;
type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

/** The ranked executor chain: index 0 is primary, the rest are ordered fallbacks. */
const EXECUTOR_META: Record<ExecutorChoice, { label: string; handle: string; desc: string }> = {
  antigravity: { label: 'Antigravity', handle: 'agy', desc: 'Google Antigravity' },
  claude: { label: 'Claude', handle: 'claude', desc: 'Anthropic agents' },
  codex: { label: 'Codex', handle: 'codex', desc: 'OpenAI agents' },
  mock: { label: 'Mock', handle: 'mock', desc: 'Demo only — no real work' },
};
const DEFAULT_ORDER: ExecutorChoice[] = ['antigravity', 'claude', 'codex'];

type BrdMode = 'upload' | 'paste';

type FormState = {
  projectName: string;
  projectCode: string;
  projectType: ProjectType;
  platforms: PlatformOption[];
  blueprintFile: File | null;
  blueprintBody: string;
  brdMode: BrdMode;
  executorOrder: ExecutorChoice[];
};

const INITIAL_STATE: FormState = {
  projectName: '',
  projectCode: '',
  projectType: 'new',
  platforms: [],
  blueprintFile: null,
  blueprintBody: '',
  brdMode: 'upload',
  executorOrder: DEFAULT_ORDER,
};

const PROJECT_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;
type Tab = 'initialize' | 'setup';

// ── Setup tab — "Project initializing…" live view ──────────────────────────────
// Mirrors the design-handoff `setup()` two-panel shell: a phase rail (left) and an
// activity stream (right). The data below is illustrative — TODO: wire to the real
// blueprint-phase + activity endpoints once a project's daemon is streaming.
type SetupStatus = 'done' | 'review' | 'running' | 'todo';

const SETUP_PILL: Record<SetupStatus, { label: string; cls: string }> = {
  done: { label: 'approved', cls: 's-green' },
  review: { label: 'pending', cls: 's-blue' },
  running: { label: 'drafting', cls: 's-amber' },
  todo: { label: 'queued', cls: 's-neutral' },
};

const SETUP_PHASES: { group: string; items: { label: string; status: SetupStatus }[] }[] = [
  {
    group: 'Analysis',
    items: [
      { label: 'GROWTH.md', status: 'done' },
      { label: 'LEGAL.md', status: 'review' },
      { label: 'PRD.md', status: 'review' },
      { label: 'API.md', status: 'done' },
      { label: 'SECURITY.md', status: 'running' },
    ],
  },
  {
    group: 'Planning',
    items: [
      { label: 'Creating items', status: 'done' },
      { label: 'Item relations', status: 'running' },
      { label: 'Acceptance criteria', status: 'todo' },
      { label: 'Estimates', status: 'todo' },
    ],
  },
  {
    group: 'Environment',
    items: [
      { label: 'CI provider', status: 'done' },
      { label: 'Cloud target', status: 'running' },
      { label: 'Worktrees', status: 'todo' },
    ],
  },
];

type SetupMeta =
  | { kind: 'dur'; v: string }
  | { kind: 'live' }
  | { kind: 'review'; file: string }
  | { kind: 'approved' };

const SETUP_ACTIVITY: { t: string; who: string; system?: boolean; text: string; meta: SetupMeta }[] = [
  { t: '09:32', who: 'system', system: true, text: 'Operation-manager dispatched — analysis stage started.', meta: { kind: 'dur', v: '1m' } },
  { t: '09:33', who: 'growth-analyst', text: 'GROWTH.md drafted — market sizing + GTM.', meta: { kind: 'approved' } },
  { t: '09:34', who: 'legal-analyst', text: 'LEGAL.md ready for your review.', meta: { kind: 'review', file: 'LEGAL.md' } },
  { t: '09:35', who: 'product-manager', text: 'PRD.md ready for your review.', meta: { kind: 'review', file: 'PRD.md' } },
  { t: '09:36', who: 'api-architect', text: 'API.md drafted — 14 endpoints mapped.', meta: { kind: 'dur', v: '48s' } },
  { t: '09:37', who: 'security-analyst', text: 'SECURITY.md — threat modelling in progress…', meta: { kind: 'live' } },
];

export function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [tab, setTab] = useState<Tab>('initialize');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [projectDir, setProjectDir] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [initializedAt, setInitializedAt] = useState<string | null>(null);
  const [existingProjects, setExistingProjects] = useState<ExistingProject[]>([]);
  const [startingSlug, setStartingSlug] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const { mode, cycle } = useTheme();
  const ThemeIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Eclipse;

  useEffect(() => {
    let alive = true;
    apiGet<{ projects: ExistingProject[] }>('/api/projects')
      .then((res) => alive && setExistingProjects(res.projects ?? []))
      .catch(() => alive && setExistingProjects([]));
    return () => {
      alive = false;
    };
  }, []);

  // Resume a registered project: start (or reuse) its daemon, then hand off.
  const resumeProject = async (slug: string) => {
    if (startingSlug) return;
    setStartingSlug(slug);
    setStartError(null);
    try {
      const res = await apiPost<{ ok: boolean; handoffUrl?: string }>(`/api/projects/${slug}/start`, {});
      if (res.handoffUrl) {
        window.location.href = res.handoffUrl;
        return;
      }
      setStartError('Could not start that project.');
      setStartingSlug(null);
    } catch {
      setStartError('Could not start that project.');
      setStartingSlug(null);
    }
  };

  // Prefill the directory with the daemon's own workspace.
  useEffect(() => {
    let alive = true;
    apiGet<BlueprintStatusResponse>('/api/blueprint/status')
      .then((res) => {
        if (!alive) return;
        const root = (res.blueprintPath ?? '').split('/.kortext/')[0];
        if (root) setProjectDir((cur) => cur || root);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const browseDirectory = async () => {
    setBrowsing(true);
    try {
      const res = await apiPost<{ path: string | null }>('/api/pick-directory', {});
      if (res.path) setProjectDir(res.path);
    } catch {
      /* native picker unavailable — typing still works */
    } finally {
      setBrowsing(false);
    }
  };

  const nameError =
    state.projectName.length > 0 &&
    (state.projectName.trim().length < 2 || state.projectName.trim().length > 60)
      ? 'Use 2–60 characters'
      : null;
  const codeError =
    state.projectCode.length > 0 && !PROJECT_CODE_PATTERN.test(state.projectCode)
      ? 'Use 2–6 uppercase letters or digits'
      : null;

  const canSubmit =
    state.projectName.trim().length >= 2 &&
    state.projectName.trim().length <= 60 &&
    PROJECT_CODE_PATTERN.test(state.projectCode) &&
    state.platforms.length > 0 &&
    state.blueprintBody.trim().length >= 10 &&
    !submitting;

  const togglePlatform = (p: PlatformOption) => {
    setState((s) => ({
      ...s,
      platforms: s.platforms.includes(p) ? s.platforms.filter((x) => x !== p) : [...s.platforms, p],
    }));
  };

  const onFile = async (file: File) => {
    if (!/\.(md|txt)$/i.test(file.name)) {
      setSubmitError('BRD must be a .md or .txt file');
      return;
    }
    if (file.size > 100 * 1024) {
      setSubmitError('BRD file must be ≤ 100KB');
      return;
    }
    const text = await file.text();
    setState((s) => ({ ...s, blueprintFile: file, blueprintBody: text }));
    setSubmitError(null);
  };

  const clearBlueprint = () => {
    setState((s) => ({ ...s, blueprintFile: null, blueprintBody: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Download a sample BRD.md the user can edit and re-upload (no editor opened).
  const downloadSample = () => {
    const blob = new Blob([BLUEPRINT_SAMPLE], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BRD.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setState((s) => ({ ...s, blueprintBody: text, blueprintFile: null, brdMode: 'paste' }));
    } catch {
      /* clipboard read blocked — the user can paste into the textarea manually */
    }
  };

  // Drag-to-reorder the executor chain (handle-driven).
  const onDropAt = (to: number) => {
    if (dragIdx === null || dragIdx === to) return;
    setState((s) => {
      const next = [...s.executorOrder];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(to, 0, moved!);
      return { ...s, executorOrder: next };
    });
    setDragIdx(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    const executors = [...new Set(state.executorOrder)];
    const payload: BlueprintSubmitInput = {
      projectName: state.projectName.trim(),
      projectCode: state.projectCode.trim().toUpperCase(),
      projectType: state.projectType,
      platforms: state.platforms,
      blueprintBody: state.blueprintBody,
      githubRepo: null,
      executor: executors[0]!,
      executors,
      executorBinary: null,
      projectDir: projectDir.trim().length > 0 ? projectDir.trim() : null,
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiPost<BlueprintSubmitResponse>('/api/blueprint', payload);
      if (res.handoffUrl) {
        window.location.href = res.handoffUrl;
        return;
      }
      setSubmitting(false);
      if (res.initializedElsewhere) {
        setInitializedAt(res.projectDir);
        return;
      }
      if (onDone) onDone();
      else {
        window.location.hash = '/';
        window.location.reload();
      }
    } catch (err) {
      const apiErr = err as ApiPostError;
      const detail =
        apiErr && typeof apiErr === 'object' && 'status' in apiErr
          ? Array.isArray(apiErr.details)
            ? apiErr.details.join(', ')
            : apiErr.message ?? apiErr.error
          : err instanceof Error
          ? err.message
          : String(err);
      setSubmitError(`Could not initialize: ${detail}`);
      setSubmitting(false);
    }
  };

  const setCode = (v: string) =>
    setState((s) => ({ ...s, projectCode: v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }));

  if (initializedAt) {
    return (
      <div className="ob-root">
        <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>
          <FileCheck size={32} style={{ color: 'var(--success)', margin: '0 auto 16px', display: 'block' }} />
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: 'var(--fg)' }}>Project created</h2>
          <p style={{ color: 'var(--fg-muted)', fontSize: 14, marginBottom: 20 }}>
            Kortext set up{' '}
            <span className="mono" style={{ color: 'var(--accent-hi)' }}>
              {initializedAt}/.kortext/
            </span>
            . Start Kortext in your project to run it:
          </p>
          <pre className="mono" style={{ fontSize: 13, textAlign: 'left', padding: '12px 16px', borderRadius: 8, margin: 0, background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--fg)' }}>
            {`cd ${initializedAt}\nkortext serve`}
          </pre>
        </div>
      </div>
    );
  }

  const active = existingProjects.filter((p) => p.status !== 'archived');
  const archived = existingProjects.filter((p) => p.status === 'archived');

  const projectRow = (p: ExistingProject, isArchived: boolean) => (
    <button
      key={p.slug}
      type="button"
      disabled={startingSlug !== null}
      onClick={() => void resumeProject(p.slug)}
      className={`ob-proj${isArchived ? ' archived' : ''}`}
      title={p.path}
    >
      <div className="ob-proj-top">
        <FolderKanban style={{ width: 14, height: 14, color: 'var(--fg-muted)', flex: 'none' }} />
        <span className="ob-proj-name">{p.name}</span>
      </div>
      <div className="ob-proj-meta">
        {startingSlug === p.slug ? 'Starting…' : isArchived ? 'archived · restore' : `:${p.port} · ${p.status}`}
      </div>
    </button>
  );

  return (
    <div className="app">
      {/* ── Sidebar: recent projects ─────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="side-logo">
          <span className="side-logo-name">kortext</span>
          <span className="ver-pill side-logo-ver">v3</span>
        </div>
        <div className={`side-scroll kx-scroll${tab === 'setup' ? ' setup-rail' : ''}`}>
          {tab === 'setup' ? (
            <PhaseRail />
          ) : (
            <div className="side-sec">
              <div className="eyebrow">Recent projects</div>
              {active.map((p) => projectRow(p, false))}
              {active.length === 0 && archived.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '6px 2px' }}>No projects yet</div>
              )}
              {archived.length > 0 && (
                <>
                  <div className="eyebrow" style={{ marginTop: 12 }}>
                    Archived
                  </div>
                  {archived.map((p) => projectRow(p, true))}
                </>
              )}
              {startError && <div style={{ fontSize: 12, color: 'var(--red)', padding: '4px 2px' }}>{startError}</div>}
            </div>
          )}
        </div>
        {tab === 'initialize' && (
          <div className="ob-newbtn">
            <button type="button" className="btn btn-secondary" onClick={() => setState(INITIAL_STATE)}>
              <Plus className="ic" />
              New project
            </button>
          </div>
        )}
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

      {/* ── Main: tabs + form ────────────────────────────────────────────── */}
      <div className="main-col">
        <div className="ob-tabbar">
          <button className={`ob-tab${tab === 'initialize' ? ' on' : ''}`} onClick={() => setTab('initialize')}>
            Initialize
          </button>
          <button className={`ob-tab${tab === 'setup' ? ' on' : ''}`} onClick={() => setTab('setup')}>
            Setup
          </button>
        </div>
        <div className="content kx-scroll" id="content" style={{ padding: 0 }}>
          {tab === 'setup' ? (
            <SetupStream />
          ) : (
            <>
              <div className="ob-wrap">
                <div className="ob-head">
                  <h1>Initialize your project</h1>
                  <p>Just enough to dispatch your operation-manager — the rest is automatic.</p>
                </div>

                <div className="ob-cols">
                  {/* left column — project fields (bordered panel, sections divided) */}
                  <div className="ob-panel">
                    <div className="ob-sec">
                      <div className="ob-row2">
                        <Field label="Project Name" error={nameError} grow>
                          <input
                            className="input"
                            value={state.projectName}
                            placeholder="e.g. Acme CRM"
                            onChange={(e) => setState((s) => ({ ...s, projectName: e.target.value }))}
                            maxLength={60}
                          />
                        </Field>
                        <Field label="Code" error={codeError} style={{ width: 130 }}>
                          <input
                            className="input mono"
                            style={{ letterSpacing: '0.08em' }}
                            value={state.projectCode}
                            placeholder="ACME"
                            onChange={(e) => setCode(e.target.value)}
                            maxLength={6}
                          />
                        </Field>
                      </div>
                      <p className="ob-hint">Display name across all views. Code is used in task IDs (e.g. NOT-T-101).</p>
                    </div>

                    <div className="ob-sec">
                      <Field label="Project Type">
                        <div style={{ display: 'flex', gap: 12 }}>
                          <RadioCard
                            checked={state.projectType === 'new'}
                            onClick={() => setState((s) => ({ ...s, projectType: 'new' }))}
                            title="New project"
                            desc="Greenfield — analysis"
                          />
                          <RadioCard
                            checked={state.projectType === 'existing'}
                            onClick={() => setState((s) => ({ ...s, projectType: 'existing' }))}
                            title="Existing code"
                            desc="Adapt — onboarding"
                          />
                        </div>
                      </Field>
                    </div>

                    <div className="ob-sec">
                      <Field label="Project Directory" hint="Where .kortext/ is created.">
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            className="input mono"
                            style={{ flex: 1, fontSize: 13 }}
                            value={projectDir}
                            placeholder="/Users/you/projects/acme"
                            spellCheck={false}
                            onChange={(e) => setProjectDir(e.target.value)}
                          />
                          <button type="button" className="btn btn-secondary" onClick={browseDirectory} disabled={browsing}>
                            <FolderOpen size={14} />
                            {browsing ? 'Opening…' : 'Browse'}
                          </button>
                        </div>
                      </Field>
                    </div>

                    <div className="ob-sec">
                      <Field label="Target Platform" hint="Pick one or more. Stack defaults follow.">
                        <div className="chips">
                          {PLATFORM_OPTIONS.map((p) => (
                            <span
                              key={p}
                              className={`chip${state.platforms.includes(p) ? ' on' : ''}`}
                              onClick={() => togglePlatform(p)}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </Field>
                    </div>

                    <div className="ob-sec">
                      <Field
                        label="AI Executor"
                        hint="Runs top-down — if one is unavailable, kortext falls back to the next."
                        actions={<span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>drag to reorder</span>}
                      >
                        <div className="ob-exec">
                          {state.executorOrder.map((id, i) => {
                            const m = EXECUTOR_META[id];
                            return (
                              <div
                                key={id}
                                className={`ob-exec-row${i === 0 ? ' primary' : ''}${dragIdx === i ? ' drag' : ''}`}
                                draggable
                                onDragStart={() => setDragIdx(i)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => onDropAt(i)}
                                onDragEnd={() => setDragIdx(null)}
                              >
                                <span className="ob-exec-rank">{i + 1}</span>
                                <div className="ob-exec-main">
                                  <div className="ob-exec-name">
                                    {m.label}
                                    <span className="h">{m.handle}</span>
                                  </div>
                                  <div className="ob-exec-desc">{m.desc}</div>
                                </div>
                                <span className="ob-exec-badge">{i === 0 ? 'Primary' : 'Fallback'}</span>
                                <span className="ob-exec-handle" aria-hidden>
                                  <GripVertical size={15} />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </Field>
                    </div>
                  </div>

                  {/* right column — BRD (bordered panel, fills height) */}
                  <div className="ob-brd-col">
                    <div className="ob-panel ob-brd-panel">
                      <div className="ob-brd-head">
                        <span className="lbl">BRD</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={downloadSample} title="Download a sample BRD.md">
                          <FileText size={12} />
                          Sample BRD
                        </button>
                        <div className="ob-seg">
                          <button className={state.brdMode === 'paste' ? 'on' : ''} onClick={() => setState((s) => ({ ...s, brdMode: 'paste' }))}>
                            Paste
                          </button>
                          <button className={state.brdMode === 'upload' ? 'on' : ''} onClick={() => setState((s) => ({ ...s, brdMode: 'upload' }))}>
                            Upload
                          </button>
                        </div>
                      </div>

                      <div className="ob-brd-body">
                        {state.brdMode === 'paste' ? (
                          <div className="ob-paste-wrap">
                            <textarea
                              className="ob-brd-ta"
                              value={state.blueprintBody}
                              spellCheck={false}
                              placeholder="Paste your BRD markdown here…"
                              onChange={(e) => setState((s) => ({ ...s, blueprintBody: e.target.value, blueprintFile: null }))}
                            />
                            <button type="button" className="btn btn-secondary btn-sm ob-paste-btn" onClick={pasteFromClipboard} title="Paste from clipboard">
                              <Clipboard size={12} />
                              Paste
                            </button>
                          </div>
                        ) : state.blueprintFile ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 12px',
                              borderRadius: 10,
                              background: 'rgba(76,183,130,0.10)',
                              border: '1px solid rgba(76,183,130,0.25)',
                            }}
                          >
                            <FileCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                            <span className="mono" style={{ fontSize: 13, flex: 1, color: 'var(--success)' }}>
                              {state.blueprintFile.name} · {(state.blueprintFile.size / 1024).toFixed(1)} KB
                            </span>
                            <button type="button" onClick={clearBlueprint} className="ob-x" aria-label="Remove BRD file">
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`ob-brd-drop${dragOver ? ' over' : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOver(true);
                            }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={async (e) => {
                              e.preventDefault();
                              setDragOver(false);
                              const file = e.dataTransfer.files[0];
                              if (file) await onFile(file);
                            }}
                          >
                            <FileText size={26} style={{ color: 'var(--fg-faint)', margin: '0 auto 10px', display: 'block' }} />
                            <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 4 }}>
                              Drop your <span className="mono">BRD.md</span> here
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
                              or <span style={{ color: 'var(--accent)' }}>browse files</span>
                            </div>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".md,.txt"
                              style={{ display: 'none' }}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) await onFile(file);
                              }}
                            />
                          </div>
                        )}
                        <div className="ob-brd-note">operation-manager derives the backlog from this BRD.</div>
                      </div>
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 16,
                      background: 'rgba(204,107,107,0.10)',
                      border: '1px solid rgba(204,107,107,0.30)',
                      color: 'var(--danger)',
                    }}
                  >
                    {submitError}
                  </div>
                )}

                <button type="button" className="btn btn-primary ob-submit" disabled={!canSubmit} onClick={submit}>
                  <Rocket size={16} />
                  {submitting ? 'Initializing…' : 'Initialize project'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  actions,
  grow,
  style,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  actions?: ReactNode;
  grow?: boolean;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <div style={{ ...(grow ? { flex: 1, minWidth: 0 } : {}), ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {label}
        </label>
        {actions}
      </div>
      {children}
      {error ? (
        <p style={{ fontSize: 12, marginTop: 4, color: 'var(--danger)' }}>{error}</p>
      ) : hint ? (
        <p style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 4 }}>{hint}</p>
      ) : null}
    </div>
  );
}

function RadioCard({
  checked,
  onClick,
  title,
  desc,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        textAlign: 'left',
        padding: '12px 14px',
        borderRadius: 10,
        transition: 'all 0.12s',
        cursor: 'pointer',
        background: checked ? 'var(--accent-soft)' : 'var(--card)',
        border: checked ? '1px solid var(--accent-line)' : '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 14,
            borderRadius: '50%',
            flexShrink: 0,
            border: checked ? '4px solid var(--accent)' : '1px solid var(--border-strong)',
            background: checked ? 'var(--accent)' : 'transparent',
            boxSizing: 'border-box',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)', paddingLeft: 22 }}>{desc}</div>
    </button>
  );
}

// ── Setup tab — left phase rail (mirrors the workspace nav: side-sec + eyebrow) ─
function PhaseRail() {
  return (
    <>
      {SETUP_PHASES.map((p) => (
        <div className="side-sec" key={p.group}>
          <div className="eyebrow">{p.group}</div>
          {p.items.map((it) => {
            const pill = SETUP_PILL[it.status];
            const isFile = /\.md$/.test(it.label);
            return (
              <div className={`nav-item${isFile ? ' setup-file' : ''}`} key={it.label}>
                <span className="grow truncate">{it.label}</span>
                <span className={`st-pill ${pill.cls}`}>{pill.label}</span>
              </div>
            );
          })}
        </div>
      ))}
      <div className="side-sec">
        <div className="setup-rail-note">
          When all stages finish and tasks are created, kortext moves to the Dashboard.
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
        >
          <ArrowRight className="ic" />
          Open dashboard
        </button>
      </div>
    </>
  );
}

// ── Setup tab — right activity stream ("Project initializing…") ───────────────
function SetupStream() {
  const running = SETUP_PHASES.flatMap((p) => p.items).filter((i) => i.status === 'running').length;
  return (
    <div className="ob-wrap ob-setup">
      <div className="pg-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="pg-title">Project initializing…</h1>
          <p className="pg-sub">
            Every stage streams here. Review a file from the stream or pick it on the left when it needs you.
          </p>
        </div>
        <span className="st-pill s-amber" title="Illustrative — live wiring pending" style={{ flex: 'none' }}>
          preview
        </span>
      </div>

      <section className="card setup-activity">
        <div className="panel-head">
          <div className="panel-title">Activity</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge s-amber">
              <span className="dot dot-live" />
              {running} stages running
            </span>
            <span className="mono faint" style={{ fontSize: 11 }}>
              antigravity engine
            </span>
          </div>
        </div>
        <div className="act-list">
          {SETUP_ACTIVITY.map((e, i) => (
            <div className={`act-row${e.meta.kind === 'live' ? ' live' : ''}`} key={i}>
              <span className="mono act-t">{e.t}</span>
              <div className="act-who">
                <SetupAgentToken who={e.who} system={e.system} />
              </div>
              <div className="act-main">
                <div className="act-text">{e.text}</div>
              </div>
              <div className="act-meta">
                {e.meta.kind === 'dur' && <span className="mono act-dur">{e.meta.v}</span>}
                {e.meta.kind === 'live' && <span className="st-pill s-amber">drafting</span>}
                {e.meta.kind === 'approved' && <span className="st-pill s-green">approved</span>}
                {e.meta.kind === 'review' && (
                  <>
                    <span className="st-pill s-blue">pending</span>
                    <button type="button" className="btn btn-primary btn-sm">
                      Review
                      <ArrowRight className="ic" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Activity-stream agent chip — colored dot + handle (matches the dashboard token). */
function SetupAgentToken({ who, system }: { who: string; system?: boolean }) {
  if (system) {
    return (
      <span className="badge badge-square s-neutral" style={{ fontWeight: 500 }}>
        system
      </span>
    );
  }
  const { color } = personaPalette(who);
  return (
    <span className="agent" title={`+${who}`}>
      <span className="adot" style={{ background: color, color }} />
      <span className="truncate">+{who}</span>
    </span>
  );
}
