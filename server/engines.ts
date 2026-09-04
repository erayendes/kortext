import { spawnSync } from 'node:child_process';
import type Database from 'better-sqlite3';

// The engine is the user's own installed agent CLI — kortext drives it
// headlessly during Phase A. Args are the battle-tested v3 sets (see
// archive/v3-engine/server/engine/executors/*): prompt goes in over stdin for all.
export interface EngineSpec {
  id: string;
  binary: string;
  args: string[];
  installHint: string;
}

export const ENGINES: EngineSpec[] = [
  {
    id: 'claude',
    binary: 'claude',
    // --print: headless (no REPL); skip-permissions: auto-approve tool use;
    // stdin carries the step prompt.
    args: ['--print', '--dangerously-skip-permissions'],
    installHint: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    binary: 'codex',
    // exec = non-interactive; workspace-write so it can create the output
    // file; skip-git-repo-check: project may not be a git repo (yet).
    args: ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check'],
    installHint: 'npm install -g @openai/codex',
  },
  {
    id: 'gemini',
    binary: 'gemini',
    args: ['--yolo'],
    installHint: 'npm install -g @google/gemini-cli',
  },
];

export function detectEngines(): Array<EngineSpec & { available: boolean }> {
  return ENGINES.map((e) => ({
    ...e,
    available: spawnSync('which', [e.binary], { stdio: 'ignore' }).status === 0,
  }));
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

/**
 * The engine a project runs on. Its own choice wins as long as that CLI is still
 * installed; otherwise anything installed is better than refusing to run — a
 * project whose CLI was uninstalled keeps working, and the panel's dropdown
 * shows what it actually fell back to. A project with no choice of its own
 * (added before the column existed) follows the global setting.
 */
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
