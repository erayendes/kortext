import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Copy,
  Download,
  FileCheck,
  FileText,
  FolderOpen,
  Rocket,
  Sparkles,
  X,
} from 'lucide-react';

import { apiGet, apiPost, type ApiPostError } from '../lib/api.ts';
import type {
  BlueprintStatusResponse,
  BlueprintSubmitInput,
  BlueprintSubmitResponse,
  ExecutorChoice,
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

const BLUEPRINT_PROMPT = `You are a product manager. Generate a Kortext BRD.md (Business Requirements Document) based on the project info below.

The BRD.md must contain these sections:
- # BRD — [Project Name]
- ## Vision (1-2 sentences of product vision)
- ## Target Users (who is it for?)
- ## Core Features (MVP — numbered list, each item bold heading + description)
- ## Out of Scope (what is excluded from v1)
- ## Tech Preferences (stack choices; leave blank if unknown)
- ## Success Metrics (measurable goals)

Project information:
[DESCRIBE YOUR PROJECT — what it does, who uses it, what problem it solves]

Output only the .md content, no extra explanation.`;

const PLATFORM_OPTIONS = ['Web', 'iOS', 'Android', 'Desktop'] as const;
type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

type FormState = {
  projectName: string;
  projectCode: string;
  projectType: ProjectType;
  platforms: PlatformOption[];
  blueprintFile: File | null;
  blueprintBody: string;
  executor: ExecutorChoice | null;
  /**
   * Ordered fallback executors (UAT #10). When the primary recoverably fails
   * (quota / 429 / empty output), the engine falls over to these in order. An
   * empty string means "no fallback at this slot".
   */
  fallbacks: (ExecutorChoice | '')[];
  executorBinary: string;
};

const INITIAL_STATE: FormState = {
  projectName: '',
  projectCode: '',
  projectType: 'new',
  platforms: [],
  blueprintFile: null,
  blueprintBody: '',
  executor: null,
  fallbacks: ['', ''],
  executorBinary: '',
};

const EXECUTOR_OPTIONS: { value: ExecutorChoice; label: string; desc: string }[] = [
  { value: 'antigravity', label: 'Antigravity', desc: 'agy CLI · Google Antigravity' },
  { value: 'claude', label: 'Claude', desc: 'claude CLI · real Anthropic agents' },
  { value: 'codex', label: 'Codex', desc: 'codex CLI · OpenAI agents' },
  { value: 'mock', label: 'Mock', desc: 'Demo only · simulates steps, no real work' },
];

const PROJECT_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;

export function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [showSample, setShowSample] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [sampleCopied, setSampleCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [projectDir, setProjectDir] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [initializedAt, setInitializedAt] = useState<string | null>(null);

  // Prefill with the daemon's own workspace (where .kortext/ goes by default).
  // blueprintPath is "<root>/.kortext/foundation/BRD.md".
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

  // Open a native folder picker (macOS); on other platforms / cancel the user
  // just types the path. The daemon opens the dialog and returns the path.
  const browseDirectory = async () => {
    setBrowsing(true);
    try {
      const res = await apiPost<{ path: string | null }>('/api/pick-directory', {});
      if (res.path) setProjectDir(res.path);
    } catch {
      /* native picker unavailable — typing the path still works */
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
    state.executor !== null &&
    state.blueprintBody.trim().length >= 10 &&
    !submitting;

  const togglePlatform = (p: PlatformOption) => {
    setState((s) => ({
      ...s,
      platforms: s.platforms.includes(p)
        ? s.platforms.filter((x) => x !== p)
        : [...s.platforms, p],
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

  const downloadSample = () => {
    const blob = new Blob([BLUEPRINT_SAMPLE], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BRD.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyTo = async (text: string, setFlag: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (state.executor === null) return;
    setSubmitting(true);
    setSubmitError(null);
    // UAT #10: ordered fallback chain — primary first, then chosen fallbacks,
    // de-duplicated. The server also leads the chain with the primary and
    // validates, but we keep the payload clean.
    const executors: ExecutorChoice[] = [];
    for (const choice of [state.executor, ...state.fallbacks]) {
      if (choice && !executors.includes(choice)) executors.push(choice);
    }
    const payload: BlueprintSubmitInput = {
      projectName: state.projectName.trim(),
      projectCode: state.projectCode.trim().toUpperCase(),
      projectType: state.projectType,
      platforms: state.platforms,
      blueprintBody: state.blueprintBody,
      githubRepo: null,
      executor: state.executor,
      executors,
      executorBinary:
        state.executorBinary.trim().length > 0 ? state.executorBinary.trim() : null,
      projectDir: projectDir.trim().length > 0 ? projectDir.trim() : null,
    };
    try {
      const res = await apiPost<BlueprintSubmitResponse>('/api/blueprint', payload);
      // Bootstrap-wizard handoff: the real project daemon now lives at handoffUrl.
      // Keep the spinner ("Initializing…") on and hard-navigate the browser to it.
      if (res.handoffUrl) {
        setSubmitError(null);
        window.location.href = res.handoffUrl;
        return;
      }
      // Reset the spinner state before navigating — otherwise on slow systems
      // the screen flashes "Initializing…" while the guard re-checks status.
      setSubmitting(false);
      if (res.initializedElsewhere) {
        // Project written to a different folder — the running daemon doesn't
        // serve it, so show "run Kortext there" instead of navigating.
        setInitializedAt(res.projectDir);
        return;
      }
      if (onDone) {
        onDone();
      } else {
        // Direct-URL fallback (/#/onboarding) where the route is mounted
        // without the RootShell guard's onDone. Force a hard reload so the
        // guard re-runs and lands us on the dashboard.
        window.location.hash = '/';
        window.location.reload();
      }
    } catch (err) {
      const apiErr = err as ApiPostError;
      if (apiErr && typeof apiErr === 'object' && 'status' in apiErr) {
        const detailMsg = Array.isArray(apiErr.details)
          ? apiErr.details.join(', ')
          : apiErr.message ?? apiErr.error;
        setSubmitError(`Could not initialize: ${detailMsg}`);
      } else {
        setSubmitError(`Could not initialize: ${err instanceof Error ? err.message : String(err)}`);
      }
      setSubmitting(false);
    }
  };

  // Auto-uppercase project code as user types.
  const setCode = (v: string) => {
    setState((s) => ({ ...s, projectCode: v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }));
  };

  if (initializedAt) {
    return (
      <div className="ob-root">
        <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <FileCheck size={32} style={{ color: 'var(--success)' }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: 'var(--fg)' }}>
            Project created
          </h2>
          <p style={{ color: 'var(--fg-muted)', fontSize: 14, marginBottom: 20 }}>
            Kortext set up{' '}
            <span className="mono" style={{ color: 'var(--accent-hi)' }}>
              {initializedAt}/.kortext/
            </span>
            . The running daemon serves a different folder — start Kortext in your
            project to run it:
          </p>
          <pre
            className="mono"
            style={{
              fontSize: 13,
              textAlign: 'left',
              padding: '12px 16px',
              borderRadius: 6,
              margin: 0,
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
            }}
          >
            {`cd ${initializedAt}\nkortext serve`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="ob-root" style={{ alignItems: 'flex-start' }}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <OnboardingHeader />
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            background: 'var(--card)',
          }}
        >
          <Field label="Project Name" hint="Display name across all views." error={nameError}>
            <input
              className="input"
              value={state.projectName}
              placeholder="e.g. Acme CRM"
              onChange={(e) => setState((s) => ({ ...s, projectName: e.target.value }))}
              maxLength={60}
            />
          </Field>

          <Field label="Project Code" hint="Used in task IDs (e.g. ACME-T-101)." error={codeError}>
            <input
              className="input mono"
              style={{ letterSpacing: '0.08em' }}
              value={state.projectCode}
              placeholder="e.g. ACME"
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
            />
          </Field>

          <Field label="Project Type" hint="New project runs analysis pipeline; existing codebase runs onboarding pipeline.">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <RadioCard
                checked={state.projectType === 'new'}
                onClick={() => setState((s) => ({ ...s, projectType: 'new' }))}
                title="New project"
                desc="Greenfield — analysis pipeline"
              />
              <RadioCard
                checked={state.projectType === 'existing'}
                onClick={() => setState((s) => ({ ...s, projectType: 'existing' }))}
                title="Existing codebase"
                desc="Adapt to Kortext — onboarding pipeline"
              />
            </div>
          </Field>

          <Field
            label="Project Directory"
            hint="Where .kortext/ is created. Browse or type an absolute path — a different folder is set up there (then you run Kortext in it)."
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input mono"
                style={{ flex: 1, fontSize: 13 }}
                value={projectDir}
                placeholder="/Users/you/projects/acme"
                spellCheck={false}
                onChange={(e) => setProjectDir(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-line"
                onClick={browseDirectory}
                disabled={browsing}
              >
                <FolderOpen size={14} />
                {browsing ? 'Opening…' : 'Browse'}
              </button>
            </div>
          </Field>

          <Field label="Target Platform" hint="Pick one or more. Stack defaults and test matrices follow.">
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

          <Field
            label="BRD"
            hint="Upload the product BRD (Business Requirements Document) markdown. operation-manager derives the backlog from it."
            actions={
              <div style={{ display: 'flex', gap: 6 }}>
                <HelperButton
                  active={showSample}
                  icon={<FileText size={11} />}
                  label="Sample .md"
                  onClick={() => {
                    setShowSample((v) => !v);
                    setShowPrompt(false);
                  }}
                />
                <HelperButton
                  active={showPrompt}
                  icon={<Sparkles size={11} />}
                  label="AI Prompt"
                  onClick={() => {
                    setShowPrompt((v) => !v);
                    setShowSample(false);
                  }}
                />
              </div>
            }
          >
            {showSample ? (
              <HelperPanel
                title="BRD.md — sample"
                accent="default"
                actions={
                  <>
                    <ToolbarBtn icon={<Download size={11} />} label="Download" onClick={downloadSample} />
                    <ToolbarBtn
                      icon={<Copy size={11} />}
                      label={sampleCopied ? '✓ Copied' : 'Copy'}
                      onClick={() => copyTo(BLUEPRINT_SAMPLE, setSampleCopied)}
                    />
                    <IconBtn onClick={() => setShowSample(false)} />
                  </>
                }
                content={BLUEPRINT_SAMPLE}
              />
            ) : null}
            {showPrompt ? (
              <HelperPanel
                title="BRD generator prompt"
                accent="accent"
                actions={
                  <>
                    <ToolbarBtn
                      icon={<Copy size={11} />}
                      label={promptCopied ? '✓ Copied' : 'Copy'}
                      onClick={() => copyTo(BLUEPRINT_PROMPT, setPromptCopied)}
                      accent
                    />
                    <IconBtn onClick={() => setShowPrompt(false)} />
                  </>
                }
                content={BLUEPRINT_PROMPT}
              />
            ) : null}
            {state.blueprintFile ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  marginTop: 8,
                  background: 'rgba(76,183,130,0.10)',
                  border: '1px solid rgba(76,183,130,0.25)',
                }}
              >
                <FileCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                <span className="mono" style={{ fontSize: 13, flex: 1, color: 'var(--success)' }}>
                  {state.blueprintFile.name} · {(state.blueprintFile.size / 1024).toFixed(1)} KB · ✓
                </span>
                <button
                  type="button"
                  onClick={clearBlueprint}
                  className="ob-x"
                  aria-label="Remove BRD file"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  borderRadius: 10,
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                  border: dragOver
                    ? '1.5px dashed var(--accent)'
                    : '1.5px dashed var(--border)',
                  background: dragOver ? 'var(--card-hover)' : 'var(--bg)',
                }}
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
                <FileText size={24} style={{ color: 'var(--fg-faint)', margin: '0 auto 8px', display: 'block' }} />
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 4 }}>
                  Drop your{' '}
                  <span
                    className="mono"
                    style={{ padding: '2px 6px', borderRadius: 4, fontSize: 12, background: 'var(--panel)' }}
                  >
                    BRD.md
                  </span>{' '}
                  here
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
          </Field>

          <Field
            label="AI Executor"
            hint={
              state.executor === null
                ? 'Pick how your agents run. Mock is demo-only — no real work.'
                : state.executor === 'mock'
                ? 'Mock = simulation only, no real AI calls. Pick Claude, Codex, or Antigravity for real autonomous work.'
                : state.executor === 'claude'
                ? 'Uses your local `claude` CLI. Make sure you are logged in (claude login).'
                : state.executor === 'codex'
                ? 'Uses your local `codex` CLI. Make sure you are logged in (codex login).'
                : 'Uses your local `agy` CLI (Antigravity). Make sure you are logged in (agy install).'
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {EXECUTOR_OPTIONS.map((opt) => (
                <ExecutorChip
                  key={opt.value}
                  label={opt.label}
                  desc={opt.desc}
                  active={state.executor === opt.value}
                  onClick={() => setState((s) => ({ ...s, executor: opt.value }))}
                />
              ))}
            </div>
            {state.executor !== null && state.executor !== 'mock' && (
              <input
                className="input mono"
                style={{ fontSize: 12, marginTop: 8 }}
                placeholder={
                  state.executor === 'claude'
                    ? 'Optional: binary path (default: claude on PATH)'
                    : state.executor === 'codex'
                    ? 'Optional: binary path (default: codex on PATH)'
                    : 'Optional: binary path (default: agy on PATH)'
                }
                value={state.executorBinary}
                onChange={(e) =>
                  setState((s) => ({ ...s, executorBinary: e.target.value }))
                }
              />
            )}
            {state.executor !== null && state.executor !== 'mock' && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginBottom: 6,
                  }}
                >
                  Fallbacks (optional, in order) — if the one above hits a quota /
                  rate-limit, Kortext automatically tries these next.
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {state.fallbacks.map((fb, idx) => (
                    <select
                      key={idx}
                      className="input"
                      style={{ fontSize: 13 }}
                      value={fb}
                      onChange={(e) =>
                        setState((s) => {
                          const next = [...s.fallbacks];
                          next[idx] = e.target.value as ExecutorChoice | '';
                          return { ...s, fallbacks: next };
                        })
                      }
                    >
                      <option value="">{`Fallback ${idx + 1} — none`}</option>
                      {EXECUTOR_OPTIONS.filter(
                        (opt) =>
                          opt.value !== 'mock' && opt.value !== state.executor,
                      ).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
            )}
          </Field>

          {submitError ? (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 13,
                background: 'rgba(204,107,107,0.10)',
                border: '1px solid rgba(204,107,107,0.30)',
                color: 'var(--danger)',
              }}
            >
              {submitError}
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn-pri"
            disabled={!canSubmit}
            onClick={submit}
            style={{
              height: 'auto',
              padding: 14,
              fontSize: 15,
              borderRadius: 8,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            <Rocket size={16} />
            {submitting ? 'Initializing…' : 'Initialize project'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingHeader() {
  return (
    <div style={{ marginBottom: 28, textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <Sparkles size={20} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600, letterSpacing: '-0.01em', fontSize: 16, color: 'var(--fg)' }}>
          Kortext
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', marginLeft: 4 }}>
          v3
        </span>
      </div>
      <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8, color: 'var(--fg)' }}>
        Initialize your project
      </h2>
      <p style={{ color: 'var(--fg-muted)', fontSize: 14 }}>
        We need just enough to dispatch your operation-manager. The rest is handled automatically.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  actions,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
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
        minWidth: 200,
        textAlign: 'left',
        padding: '12px 16px',
        borderRadius: 8,
        transition: 'all 0.12s',
        cursor: 'pointer',
        background: checked ? 'var(--accent-soft)' : 'var(--panel)',
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

function ExecutorChip({
  label,
  desc,
  active,
  onClick,
}: {
  label: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 8,
        transition: 'all 0.12s',
        cursor: 'pointer',
        background: active ? 'var(--accent-soft)' : 'var(--panel)',
        border: active ? '1px solid var(--accent-line)' : '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: 3,
            flexShrink: 0,
            background: active ? 'var(--accent)' : 'transparent',
            border: active ? '1px solid var(--accent)' : '1px solid var(--border-strong)',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)', paddingLeft: 18 }}>{desc}</div>
    </button>
  );
}

function HelperButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 5,
        transition: 'color 0.12s',
        cursor: 'pointer',
        border: 'none',
        color: active ? 'var(--fg)' : 'var(--fg-faint)',
        background: active ? 'var(--panel)' : 'transparent',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function HelperPanel({
  title,
  actions,
  content,
  accent,
}: {
  title: string;
  actions: ReactNode;
  content: string;
  accent: 'default' | 'accent';
}) {
  return (
    <div
      style={{
        marginBottom: 10,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg)',
        border:
          accent === 'accent'
            ? '1px solid rgba(155,130,206,0.30)'
            : '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom:
            accent === 'accent'
              ? '1px solid rgba(155,130,206,0.20)'
              : '1px solid var(--border)',
          background: accent === 'accent' ? 'rgba(155,130,206,0.08)' : 'var(--panel)',
        }}
      >
        <span
          className="mono"
          style={{ fontSize: 11, color: accent === 'accent' ? 'var(--violet)' : 'var(--fg-faint)' }}
        >
          {title}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{actions}</div>
      </div>
      <pre
        className="mono"
        style={{
          fontSize: 11,
          margin: 0,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          color: 'var(--fg-mid)',
          padding: 14,
          maxHeight: 220,
          lineHeight: 1.6,
        }}
      >
        {content}
      </pre>
    </div>
  );
}

function ToolbarBtn({
  icon,
  label,
  onClick,
  accent,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 5,
        cursor: 'pointer',
        background: accent ? 'rgba(155,130,206,0.15)' : 'transparent',
        color: accent ? 'var(--violet)' : 'var(--fg-faint)',
        border: accent ? '1px solid rgba(155,130,206,0.30)' : 'none',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function IconBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ob-x" aria-label="Close">
      <X size={12} />
    </button>
  );
}
