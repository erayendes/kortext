import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

// Headless CLI commands. The prompt goes on stdin unless the spec says
// otherwise; every other difference between the CLIs is a field here.
export interface EngineSpec {
  id: string;
  binary: string;
  args: string[];
  /** The flag that names a model; the project's `model` rides after it.
   *  Absent when the CLI takes its model from its own config only. */
  modelFlag?: string;
  /** Or an environment variable that names it. */
  modelEnv?: string;
  /** How reasoning effort travels, when the CLI has the notion: a flag that
   *  takes the level, or a `-c key=` prefix the level is appended to. Absent
   *  when it does not, and the panel shows no effort list. */
  effortFlag?: string;
  effortPrefix?: string;
  /** The levels that CLI accepts, in order. */
  efforts?: string[];
  /** One line per model and per level, for the picker — what the CLI's own
   *  picker says, kept short. Missing means the name alone. */
  about?: Record<string, string>;
  /** Set when the CLI takes the prompt as an argument: the flag it follows,
   *  or '' when it is the last positional argument. */
  promptFlag?: string;
  /** Set when the CLI's workspace is not its cwd and has to be named. */
  cwdFlag?: string;
  /** Environment the CLI needs on top of the server's. */
  env?: Record<string, string>;
  /** What the panel offers after "default". A name that is not here still
   *  works — the list is a convenience, the flag takes any string. */
  models: string[];
  installHint: string;
  /** Written from the CLI's documentation, not from a run on this machine. */
  untested?: boolean;
}

// The first four ran a real project here. The rest are prepared from each
// CLI's own documentation (2026-09) so the panel offers them the day they are
// installed; the first run on a real machine settles the flags.
export const ENGINES: EngineSpec[] = [
  {
    id: 'claude',
    binary: 'claude',
    // --print: headless (no REPL); skip-permissions: auto-approve tool use;
    // stdin carries the step prompt.
    args: ['--print', '--dangerously-skip-permissions'],
    modelFlag: '--model',
    effortFlag: '--effort',
    // The CLI's own picker, in its order.
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    // Aliases the CLI resolves to its latest of each tier, as its picker lists them.
    models: ['opus', 'fable', 'sonnet', 'haiku'],
    about: {
      opus: 'Opus 5 · 1M context · the default',
      fable: 'Fable 5.1 · most capable',
      sonnet: 'Sonnet 5 · efficient',
      haiku: 'Haiku 4.5 · fastest',
      low: 'faster, lighter reasoning',
      medium: 'balanced',
      high: 'deeper reasoning, slower',
      xhigh: 'extra depth for hard problems',
      max: 'everything it has — spends limits fastest',
    },
    installHint: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    binary: 'codex',
    // exec = non-interactive; workspace-write so it can create the output
    // file; skip-git-repo-check: project may not be a git repo (yet).
    args: ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check'],
    modelFlag: '-m',
    // codex has no flag; the config key is overridden on the command line. The
    // levels and models are the CLI's own picker, in its order.
    effortPrefix: '-c model_reasoning_effort=',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    models: ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'],
    about: {
      'gpt-6-astra': 'most capable · complex, demanding work',
      'gpt-5.6-sol': 'reliable agentic workhorse',
      'gpt-5.6-terra': 'balanced agentic coding',
      'gpt-5.6-luna': 'fast and affordable',
      'gpt-5.5': 'previous generation',
      low: 'fast, lighter reasoning',
      medium: 'balanced · the default',
      high: 'greater depth for complex problems',
      xhigh: 'extra depth',
      max: 'more reasoning · spends limits fastest',
    },
    installHint: 'npm install -g @openai/codex',
  },
  {
    id: 'antigravity',
    binary: 'agy',
    // Antigravity's CLI. --print takes the prompt itself, so it rides as an
    // argument; the default print timeout is 5 minutes, too short for a document.
    args: ['--dangerously-skip-permissions', '--print-timeout', '30m'],
    promptFlag: '--print',
    // Without it the workspace is ~/.gemini/antigravity-cli and the agent
    // hunts for the repository with find and ls.
    cwdFlag: '--add-dir',
    modelFlag: '--model',
    // `agy models` prints ids with the level baked in (gemini-3.8-flash-high);
    // the CLI's own picker is a model and an effort apart, and --model takes
    // the base id with --effort beside it — verified with a run.
    effortFlag: '--effort',
    efforts: ['low', 'medium', 'high'],
    models: [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.1-pro',
      'claude-sonnet-4-6',
      'claude-opus-4-6-thinking',
      'gpt-oss-120b',
    ],
    about: {
      'gemini-3.8-flash': 'Gemini 3.8 Flash · the default',
      'gemini-3.7-flash': 'Gemini 3.7 Flash',
      'gemini-3.6-flash': 'Gemini 3.6 Flash',
      'gemini-3.1-pro': 'Gemini 3.1 Pro',
      'claude-sonnet-4-6': 'Claude Sonnet 4.6 · thinking',
      'claude-opus-4-6-thinking': 'Claude Opus 4.6 · thinking',
      'gpt-oss-120b': 'GPT-OSS 120B',
      low: 'fast',
      medium: 'balanced',
      high: 'deepest reasoning · slower but stronger',
    },
    installHint: 'install Antigravity, then run: agy install',
  },
  {
    id: 'gemini',
    binary: 'gemini',
    args: ['--yolo'],
    modelFlag: '-m',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    installHint: 'npm install -g @google/gemini-cli',
  },
  {
    id: 'cursor',
    // Cursor's agent CLI installs as `agent`. -p prints instead of opening
    // the TUI; --force lets it write files in that mode.
    binary: 'agent',
    args: ['--force'],
    promptFlag: '-p',
    modelFlag: '--model',
    models: ['auto', 'composer-2', 'sonnet-4.6', 'opus-4.6', 'gpt-5.4'],
    installHint: 'curl https://cursor.com/install -fsS | bash',
    untested: true,
  },
  {
    id: 'copilot',
    // -p runs one prompt and exits; -s drops the decoration; --yolo is
    // --allow-all-tools plus paths and URLs; --no-ask-user stops it pausing
    // for a human who is not there.
    binary: 'copilot',
    args: ['-s', '--yolo', '--no-ask-user'],
    promptFlag: '-p',
    modelFlag: '--model',
    models: ['gpt-5.4', 'gpt-5.3-codex', 'claude-sonnet-4.6', 'claude-haiku-4.5'],
    installHint: 'npm install -g @github/copilot',
    untested: true,
  },
  {
    id: 'opencode',
    // `opencode run <message>`; --auto approves what is not explicitly denied.
    binary: 'opencode',
    args: ['run', '--auto'],
    promptFlag: '',
    modelFlag: '-m',
    // provider/model.
    models: ['anthropic/claude-sonnet-4-6', 'openai/gpt-5.4', 'google/gemini-3.1-pro'],
    installHint: 'npm install -g opencode-ai',
    untested: true,
  },
  {
    id: 'amp',
    // -x reads the prompt from stdin and exits after one turn. No model flag:
    // Amp picks its own.
    binary: 'amp',
    args: ['--dangerously-allow-all', '-x'],
    models: [],
    installHint: 'npm install -g @sourcegraph/amp',
    untested: true,
  },
  {
    id: 'droid',
    // `droid exec` reads stdin; --auto low is file edits without shell.
    binary: 'droid',
    args: ['exec', '--auto', 'low'],
    modelFlag: '-m',
    models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'gpt-5.3-codex'],
    installHint: 'curl -fsSL https://app.factory.ai/cli | sh',
    untested: true,
  },
  {
    id: 'goose',
    // `goose run -i -` reads stdin; approval and model come from the
    // environment, not flags.
    binary: 'goose',
    args: ['run', '-i', '-'],
    env: { GOOSE_MODE: 'auto' },
    modelEnv: 'GOOSE_MODEL',
    models: [],
    installHint: 'brew install block-goose-cli',
    untested: true,
  },
  {
    id: 'qwen',
    // Qwen Code is a gemini-cli fork: same --yolo, same stdin prompt.
    binary: 'qwen',
    args: ['--yolo'],
    modelFlag: '-m',
    models: ['qwen3-coder-plus', 'qwen3-coder-flash'],
    installHint: 'npm install -g @qwen-code/qwen-code',
    untested: true,
  },
  {
    id: 'cline',
    // The prompt is the last argument; -y skips approvals and exits when the
    // turn ends; provider/model ids.
    binary: 'cline',
    args: ['-y'],
    promptFlag: '',
    modelFlag: '-m',
    models: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-opus-4-6', 'google/gemini-3-pro'],
    installHint: 'npm install -g cline',
    untested: true,
  },
];

/** The CLI's arguments with the project's model, when one is set. */
export function engineArgs(
  engine: EngineSpec,
  project: { model?: string; effort?: string; repo_path?: string },
): string[] {
  const model = (project.model ?? '').trim();
  const effort = (project.effort ?? '').trim();
  const withEffort = effort && engine.efforts?.includes(effort);
  return [
    ...engine.args,
    ...(engine.cwdFlag && project.repo_path ? [engine.cwdFlag, project.repo_path] : []),
    ...(model && engine.modelFlag ? [engine.modelFlag, model] : []),
    ...(withEffort && engine.effortFlag ? [engine.effortFlag, effort] : []),
    // `-c key=value` is two argv entries: the flag, then key=value as one.
    ...(withEffort && engine.effortPrefix
      ? (() => {
          const [flag, ...rest] = engine.effortPrefix.split(' ');
          return [flag!, `${rest.join(' ')}${effort}`];
        })()
      : []),
  ];
}

/** The CLI's environment: the server's, the spec's, and the model when it
 *  travels as a variable. */
export function engineEnv(
  engine: EngineSpec,
  project: { model?: string },
): NodeJS.ProcessEnv | undefined {
  const model = (project.model ?? '').trim();
  if (!engine.env && !(model && engine.modelEnv)) return undefined;
  return {
    ...process.env,
    ...engine.env,
    ...(model && engine.modelEnv ? { [engine.modelEnv]: model } : {}),
  };
}

/**
 * Check PATH with which on POSIX and where on Windows.
 * Windows support is experimental and has not been runtime-tested.
 */
/** Where the CLI is, or null: the bare name when PATH has it, else the one
 *  place a server started from an app rather than a shell tends to miss —
 *  ~/.local/bin, where agy lands. */
export function binaryPath(binary: string): string | null {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  if (spawnSync(lookup, [binary], { stdio: 'ignore' }).status === 0) return binary;
  const local = join(homedir(), '.local', 'bin', binary);
  return existsSync(local) ? local : null;
}

export function onPath(binary: string): boolean {
  return binaryPath(binary) !== null;
}

// Cache blocking PATH lookups briefly to avoid spawning a lookup on every panel poll.
const DETECT_TTL_MS = 5000;
let detected: { at: number; engines: Array<EngineSpec & { available: boolean }> } | null = null;

export function detectEngines(): Array<EngineSpec & { available: boolean }> {
  if (detected && Date.now() - detected.at < DETECT_TTL_MS) return detected.engines;
  const engines = ENGINES.map((e) => {
    const path = binaryPath(e.binary);
    return { ...e, binary: path ?? e.binary, available: path !== null };
  });
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
