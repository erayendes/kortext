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

function GithubMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.31-.54-1.53.12-3.19 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.19.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.21.69.83.57C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
import { apiGet, apiPost, type ApiPostError } from '../lib/api.ts';
import type {
  BlueprintStatusResponse,
  BlueprintSubmitInput,
  BlueprintSubmitResponse,
  ExecutorChoice,
  ProjectType,
} from '../lib/api-types.ts';

const BLUEPRINT_SAMPLE = `# Project Blueprint — Acme CRM

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

const BLUEPRINT_PROMPT = `You are a product manager. Generate a Kortext blueprint.md based on the project info below.

The blueprint.md must contain these sections:
- # Project Blueprint — [Project Name]
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
  githubRepo: string;
  blueprintFile: File | null;
  blueprintBody: string;
  executor: ExecutorChoice | null;
  executorBinary: string;
};

const INITIAL_STATE: FormState = {
  projectName: '',
  projectCode: '',
  projectType: 'new',
  platforms: [],
  githubRepo: '',
  blueprintFile: null,
  blueprintBody: '',
  executor: null,
  executorBinary: '',
};

const EXECUTOR_OPTIONS: { value: ExecutorChoice; label: string; desc: string }[] = [
  { value: 'antigravity', label: 'Antigravity', desc: 'agy CLI · Google Antigravity' },
  { value: 'claude', label: 'Claude', desc: 'claude CLI · real Anthropic agents' },
  { value: 'codex', label: 'Codex', desc: 'codex CLI · OpenAI agents' },
  { value: 'mock', label: 'Mock', desc: 'Demo only · simulates steps, no real work' },
];

const PROJECT_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;
const GITHUB_PATTERN = /^github\.com\/[\w.-]+\/[\w.-]+$/;

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
  const githubError =
    state.githubRepo.trim().length > 0 && !GITHUB_PATTERN.test(state.githubRepo.trim())
      ? 'Format: github.com/org/repo'
      : null;

  const canSubmit =
    state.projectName.trim().length >= 2 &&
    state.projectName.trim().length <= 60 &&
    PROJECT_CODE_PATTERN.test(state.projectCode) &&
    state.platforms.length > 0 &&
    state.executor !== null &&
    state.blueprintBody.trim().length >= 10 &&
    (state.githubRepo.trim().length === 0 || GITHUB_PATTERN.test(state.githubRepo.trim())) &&
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
      setSubmitError('Blueprint must be a .md or .txt file');
      return;
    }
    if (file.size > 100 * 1024) {
      setSubmitError('Blueprint file must be ≤ 100KB');
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
    a.download = 'blueprint.md';
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
    const payload: BlueprintSubmitInput = {
      projectName: state.projectName.trim(),
      projectCode: state.projectCode.trim().toUpperCase(),
      projectType: state.projectType,
      platforms: state.platforms,
      blueprintBody: state.blueprintBody,
      githubRepo: state.githubRepo.trim().length > 0 ? state.githubRepo.trim() : null,
      executor: state.executor,
      executorBinary:
        state.executorBinary.trim().length > 0 ? state.executorBinary.trim() : null,
      projectDir: projectDir.trim().length > 0 ? projectDir.trim() : null,
    };
    try {
      const res = await apiPost<BlueprintSubmitResponse>('/api/blueprint', payload);
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
      <div className="min-h-screen bg-bg-0 text-tx-1 flex items-center justify-center py-12 px-6">
        <div className="w-full max-w-[560px] text-center">
          <div className="flex items-center justify-center mb-4">
            <FileCheck size={32} style={{ color: 'var(--success)' }} />
          </div>
          <h2 className="text-[22px] font-semibold mb-2">Project created</h2>
          <p className="text-tx-2 text-[14px] mb-5">
            Kortext set up{' '}
            <span className="mono" style={{ color: 'var(--accent-soft)' }}>
              {initializedAt}/.kortext/
            </span>
            . The running daemon serves a different folder — start Kortext in your
            project to run it:
          </p>
          <pre
            className="mono text-[13px] text-left px-4 py-3 rounded-md m-0"
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border-default)',
              color: 'var(--tx-1)',
            }}
          >
            {`cd ${initializedAt}\nkortext serve`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-0 text-tx-1 flex items-start justify-center py-12 px-6">
      <div className="w-full max-w-[640px]">
        <Header />
        <div className="border border-border-default rounded-2xl p-8 flex flex-col gap-6" style={{ background: 'var(--bg-1)' }}>
          <Field label="Project Name" hint="Display name across all views." error={nameError}>
            <input
              className="input w-full"
              value={state.projectName}
              placeholder="e.g. Acme CRM"
              onChange={(e) => setState((s) => ({ ...s, projectName: e.target.value }))}
              maxLength={60}
            />
          </Field>

          <Field label="Project Code" hint="Used in task IDs (e.g. ACME-T-101)." error={codeError}>
            <input
              className="input w-full mono"
              style={{ letterSpacing: '0.08em' }}
              value={state.projectCode}
              placeholder="e.g. ACME"
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
            />
          </Field>

          <Field label="Project Type" hint="New project runs analysis pipeline; existing codebase runs onboarding pipeline.">
            <div className="flex gap-3 flex-wrap">
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
            <div className="flex gap-2">
              <input
                className="input flex-1 mono"
                style={{ fontSize: 13 }}
                value={projectDir}
                placeholder="/Users/you/projects/acme"
                spellCheck={false}
                onChange={(e) => setProjectDir(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={browseDirectory}
                disabled={browsing}
              >
                <FolderOpen size={14} />
                {browsing ? 'Opening…' : 'Browse'}
              </button>
            </div>
          </Field>

          <Field label="Target Platform" hint="Pick one or more. Stack defaults and test matrices follow.">
            <div className="flex gap-2 flex-wrap">
              {PLATFORM_OPTIONS.map((p) => (
                <PlatformChip
                  key={p}
                  label={p}
                  active={state.platforms.includes(p)}
                  onClick={() => togglePlatform(p)}
                />
              ))}
            </div>
          </Field>

          <Field
            label="Blueprint"
            hint="Upload the product blueprint markdown. operation-manager derives the backlog from it."
            actions={
              <div className="flex gap-1.5">
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
                title="blueprint.md — sample"
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
                title="Blueprint generator prompt"
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
                className="flex items-center gap-2 px-3 py-2 rounded-md mt-2"
                style={{
                  background: 'rgba(16,185,129,0.10)',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                <FileCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                <span className="mono text-[13px] flex-1" style={{ color: 'var(--success)' }}>
                  {state.blueprintFile.name} · {(state.blueprintFile.size / 1024).toFixed(1)} KB · ✓
                </span>
                <button
                  type="button"
                  onClick={clearBlueprint}
                  className="text-tx-3 hover:text-tx-1"
                  aria-label="Remove blueprint file"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div
                className="rounded-[10px] px-6 py-6 text-center cursor-pointer transition-all"
                style={{
                  border: dragOver
                    ? '1.5px dashed var(--accent)'
                    : '1.5px dashed var(--border-default)',
                  background: dragOver ? 'var(--bg-2)' : 'var(--bg-0)',
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
                <FileText size={24} style={{ color: 'var(--tx-3)', margin: '0 auto 8px', display: 'block' }} />
                <div className="text-[13px] text-tx-2 mb-1">
                  Drop your{' '}
                  <span className="mono px-1.5 py-0.5 rounded text-[12px]" style={{ background: 'var(--bg-3)' }}>
                    blueprint.md
                  </span>{' '}
                  here
                </div>
                <div className="text-[12px] text-tx-3">
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
            <div className="grid grid-cols-2 gap-2">
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
                className="input w-full mono mt-2"
                style={{ fontSize: 12 }}
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
          </Field>

          <Field label="GitHub Repository (optional)" hint="Where agents will commit. Skip for sandbox mode." error={githubError}>
            <div className="relative">
              <GithubMark
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3"
              />
              <input
                className="input w-full"
                style={{ paddingLeft: '36px' }}
                value={state.githubRepo}
                placeholder="github.com/your-org/your-repo"
                onChange={(e) => setState((s) => ({ ...s, githubRepo: e.target.value }))}
              />
            </div>
          </Field>

          {submitError ? (
            <div
              className="px-3 py-2 rounded-md text-[13px]"
              style={{
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.30)',
                color: 'var(--danger)',
              }}
            >
              {submitError}
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={submit}
            style={{
              padding: '14px',
              fontSize: '15px',
              borderRadius: '8px',
              justifyContent: 'center',
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

function Header() {
  return (
    <div className="mb-7 text-center">
      <div className="flex items-center justify-center gap-2 mb-3">
        <Sparkles size={20} style={{ color: 'var(--accent)' }} />
        <span className="font-semibold tracking-tight text-[16px]">Kortext</span>
        <span className="mono text-[10px] text-tx-3 ml-1">v3</span>
      </div>
      <h2 className="text-[28px] font-bold tracking-tight mb-2">Initialize your project</h2>
      <p className="text-tx-2 text-[14px]">
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
      <div className="flex items-center justify-between mb-2">
        <label className="text-[12px] font-semibold text-tx-2 uppercase tracking-[0.04em]">
          {label}
        </label>
        {actions}
      </div>
      {children}
      {error ? (
        <p className="text-[12px] mt-1" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-tx-3 mt-1">{hint}</p>
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
      className="flex-1 min-w-[200px] text-left px-4 py-3 rounded-md transition-all"
      style={{
        background: 'var(--bg-2)',
        border: checked
          ? '1px solid var(--accent)'
          : '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block w-3.5 h-3.5 rounded-full flex-shrink-0"
          style={{
            border: checked ? '4px solid var(--accent)' : '1px solid var(--border-default)',
            background: checked ? 'var(--accent)' : 'transparent',
            boxSizing: 'border-box',
          }}
        />
        <span className="text-[13px] font-medium text-tx-1">{title}</span>
      </div>
      <div className="text-[11px] text-tx-3" style={{ paddingLeft: '22px' }}>
        {desc}
      </div>
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
      className="text-left px-3 py-2.5 rounded-md transition-all"
      style={{
        background: 'var(--bg-2)',
        border: active
          ? '1px solid var(--accent)'
          : '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
          style={{
            background: active ? 'var(--accent)' : 'transparent',
            border: active
              ? '1px solid var(--accent)'
              : '1px solid var(--border-default)',
          }}
        />
        <span className="text-[13px] font-medium text-tx-1">{label}</span>
      </div>
      <div className="text-[11px] text-tx-3" style={{ paddingLeft: '18px' }}>
        {desc}
      </div>
    </button>
  );
}

function PlatformChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] transition-all"
      style={{
        background: 'var(--bg-2)',
        border: active
          ? '1px solid var(--accent)'
          : '1px solid var(--border-default)',
        color: active ? 'var(--tx-1)' : 'var(--tx-2)',
      }}
    >
      <span
        className="inline-block w-3 h-3 rounded-sm"
        style={{
          background: active ? 'var(--accent)' : 'transparent',
          border: active
            ? '1px solid var(--accent)'
            : '1px solid var(--border-default)',
        }}
      />
      {label}
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
      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors"
      style={{
        color: active ? 'var(--tx-1)' : 'var(--tx-3)',
        background: active ? 'var(--bg-2)' : 'transparent',
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
      className="mb-2.5 rounded-lg overflow-hidden"
      style={{
        background: 'var(--bg-0)',
        border:
          accent === 'accent'
            ? '1px solid rgba(168,85,247,0.30)'
            : '1px solid var(--border-default)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderBottom:
            accent === 'accent'
              ? '1px solid rgba(168,85,247,0.20)'
              : '1px solid var(--border-subtle)',
          background:
            accent === 'accent'
              ? 'rgba(168,85,247,0.08)'
              : 'var(--bg-2)',
        }}
      >
        <span
          className="mono text-[11px]"
          style={{ color: accent === 'accent' ? '#D8B4FE' : 'var(--tx-3)' }}
        >
          {title}
        </span>
        <div className="flex gap-1.5 items-center">{actions}</div>
      </div>
      <pre
        className="mono text-[11px] m-0 overflow-auto whitespace-pre-wrap"
        style={{
          color: 'var(--tx-2)',
          padding: '14px',
          maxHeight: '220px',
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
      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded"
      style={{
        background: accent ? 'rgba(168,85,247,0.15)' : 'transparent',
        color: accent ? '#D8B4FE' : 'var(--tx-3)',
        border: accent ? '1px solid rgba(168,85,247,0.30)' : 'none',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function IconBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-5 h-5 flex items-center justify-center rounded text-tx-3 hover:text-tx-1"
      aria-label="Close"
    >
      <X size={12} />
    </button>
  );
}

