import { spawnSync } from 'node:child_process';
import type Database from 'better-sqlite3';

// Headless CLI commands; prompts are supplied through stdin.
export interface EngineSpec {
  id: string;
  binary: string;
  args: string[];
  /** The flag that names a model; the project's `model` rides after it. */
  modelFlag: string;
  /** What the panel offers after "default". A name that is not here still
   *  works — the list is a convenience, the flag takes any string. */
  models: string[];
  installHint: string;
}

export const ENGINES: EngineSpec[] = [
  {
    id: 'claude',
    binary: 'claude',
    // --print: headless (no REPL); skip-permissions: auto-approve tool use;
    // stdin carries the step prompt.
    args: ['--print', '--dangerously-skip-permissions'],
    modelFlag: '--model',
    // Aliases the CLI resolves to its latest of each tier.
    models: ['fable', 'opus', 'sonnet', 'haiku'],
    installHint: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    binary: 'codex',
    // exec = non-interactive; workspace-write so it can create the output
    // file; skip-git-repo-check: project may not be a git repo (yet).
    args: ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check'],
    modelFlag: '-m',
    models: ['gpt-6-astra', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.4-mini'],
    installHint: 'npm install -g @openai/codex',
  },
  {
    id: 'gemini',
    binary: 'gemini',
    args: ['--yolo'],
    modelFlag: '-m',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    installHint: 'npm install -g @google/gemini-cli',
  },
];

/** The CLI's arguments with the project's model, when one is set. */
export function engineArgs(engine: EngineSpec, project: { model?: string }): string[] {
  const model = (project.model ?? '').trim();
  return model ? [...engine.args, engine.modelFlag, model] : engine.args;
}

/**
 * Check PATH with which on POSIX and where on Windows.
 * Windows support is experimental and has not been runtime-tested.
 */
export function onPath(binary: string): boolean {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(lookup, [binary], { stdio: 'ignore' }).status === 0;
}

// Cache blocking PATH lookups briefly to avoid spawning a lookup on every panel poll.
const DETECT_TTL_MS = 5000;
let detected: { at: number; engines: Array<EngineSpec & { available: boolean }> } | null = null;

export function detectEngines(): Array<EngineSpec & { available: boolean }> {
  if (detected && Date.now() - detected.at < DETECT_TTL_MS) return detected.engines;
  const engines = ENGINES.map((e) => ({
    ...e,
    available: onPath(e.binary),
  }));
  detected = { at: Date.now(), engines };
  return engines;
}

/** Forget the cache — the user just told us the installed set may have changed. */
export function forgetDetectedEngines(): void {
  detected = null;
}

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

/** Prefer the project CLI when installed; otherwise use the global selection or first available CLI. */
export function engineFor(
  db: Database.Database,
  project: { engine?: string },
): (EngineSpec & { available: boolean }) | null {
  const detected = detectEngines();
  return detected.find((e) => e.id === project.engine && e.available) ?? selectedEngine(db);
}

// Selected engine: explicit setting if still installed, else first available.
export function selectedEngine(
  db: Database.Database,
): (EngineSpec & { available: boolean }) | null {
  const detected = detectEngines();
  const chosen = getSetting(db, 'engine');
  return (
    detected.find((e) => e.id === chosen && e.available) ??
    detected.find((e) => e.available) ??
    null
  );
}
