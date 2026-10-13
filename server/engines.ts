import { execFile, spawnSync } from 'node:child_process';
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
  /** Models that accept fewer levels than `efforts` — none at all is `[]`.
   *  The CLI refuses the whole run over a level its model lacks. */
  modelEfforts?: Record<string, string[]>;
  /** One line per model and per level, for the picker — what the CLI's own
   *  picker says, kept short. Missing means the name alone. */
  about?: Record<string, string>;
  /** What the picker shows for an id, when the CLI's own picker shows
   *  something other than the id — `gemini-3.8-flash` reads "Gemini 3.8 Flash". */
  label?: Record<string, string>;
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
  /** How the CLI lists what the user's own plan offers. Its answer replaces
   *  `models` (and the fields that describe them); the lists above are what the
   *  panel shows until it arrives, or when the CLI cannot be asked. */
  listModels?: { args: string[]; parse: (out: string) => LiveModels | null };
}

/** What a CLI says it offers. */
export type LiveModels = Pick<EngineSpec, 'models'> &
  Partial<Pick<EngineSpec, 'efforts' | 'modelEfforts' | 'label' | 'about'>>;

// The first four ran a real project here. The rest are prepared from each
// CLI's own documentation (2026-09) so the panel offers them the day they are
// installed; the first run on a real machine settles the flags.
export const ENGINES: EngineSpec[] = [
  {
    id: 'claude',
    binary: 'claude',
    // --print: headless (no REPL); stdin carries the step prompt. Nobody is
    // there to answer a permission prompt, so instead of skipping them all the
    // agent gets a fence: edits inside the project pass (acceptEdits), shell
    // commands run in Claude Code's own sandbox — they read, and write only
    // inside the project, with no network — and web search stays open. Anything
    // else is refused. The agent does use the shell (ls, grep, head) to read a
    // codebase; without it, it read whole lockfiles and ran out of context.
    // ponytail: the sandbox is macOS Seatbelt / Linux bubblewrap. Windows has
    // neither, and its spawn goes through cmd, which would mangle the JSON — it
    // keeps skipping permissions until someone runs Kortext there.
    args:
      process.platform === 'win32'
        ? ['--print', '--dangerously-skip-permissions']
        : [
            '--print',
            '--permission-mode',
            'acceptEdits',
            '--allowedTools',
            'WebSearch',
            '--settings',
            '{"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":true,"allowUnsandboxedCommands":false}}',
          ],
    modelFlag: '--model',
    effortFlag: '--effort',
    // The CLI's own slider, in its order; ultracode is xhigh plus workflows.
    efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'],
    // The aliases, as the CLI's own picker lists them. Opus 5.5 has a 1M context
    // of its own, so `opus[1m]` is plain `opus` now; a project that picked it
    // still runs, since the flag takes any name.
    models: ['opus', 'fable', 'sonnet', 'haiku'],
    label: { opus: 'Opus', fable: 'Fable', sonnet: 'Sonnet', haiku: 'Haiku' },
    about: {
      opus: 'Opus 5.5 · 1M context · recommended',
      fable: 'Fable 5.1 · most capable',
      sonnet: 'Sonnet 5.5 · efficient',
      haiku: 'Haiku 5.5 · fastest',
      low: 'faster',
      medium: 'the CLI default on Opus, Sonnet and Haiku',
      high: 'the CLI default on Fable',
      xhigh: 'smarter',
      max: 'smarter · spends limits fastest',
      ultracode: 'xhigh + workflows',
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
    // The picker's "More reasoning…" opens ultra and max; both take on the command line.
    efforts: ['low', 'medium', 'high', 'xhigh', 'ultra', 'max'],
    // The Luna models stop at max (`codex debug models`).
    modelEfforts: {
      'gpt-6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
      'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    models: [
      'gpt-6.1-sol',
      'gpt-6-astra',
      'gpt-6-sol',
      'gpt-6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ],
    label: { xhigh: 'extra high' },
    // What the CLI's own picker says, in its order and words. The default level
    // differs per model now (low on Sol and Astra, medium elsewhere), so no level
    // is marked as the CLI default.
    about: {
      'gpt-6.1-sol': 'Latest workhorse model for coding and everyday work',
      'gpt-6-astra': 'Frontier intelligence for the most demanding work',
      'gpt-6-sol': 'Previous generation workhorse model',
      'gpt-6-luna': 'Fast and affordable model for easier tasks',
      'gpt-5.6-sol': 'Older generation workhorse model',
      'gpt-5.6-terra': 'Older balanced model for straightforward work',
      'gpt-5.6-luna': 'Older fast and efficient model',
      low: 'Fast responses with lighter reasoning',
      medium: 'Balances speed and reasoning depth for everyday tasks',
      high: 'Greater reasoning depth for complex problems',
      xhigh: 'Extra high reasoning depth for complex problems',
      ultra: 'More reasoning',
      max: 'More reasoning · consumes usage limits faster',
    },
    // The catalog the CLI ships, the same one its picker reads.
    listModels: { args: ['debug', 'models'], parse: parseCodexModels },
    installHint: 'npm install -g @openai/codex',
  },
  {
    id: 'antigravity',
    binary: 'agy',
    // Antigravity's CLI. --print takes the prompt itself, so it rides as an
    // argument; the default print timeout is 5 minutes, too short for a document.
    // --sandbox: its shell commands may read but change nothing, not even in the
    // project; the document goes in through its own write tool.
    args: ['--dangerously-skip-permissions', '--sandbox', '--print-timeout', '30m'],
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
    // Verified with a run each: the CLI names what the model takes when refused.
    modelEfforts: {
      'gpt-oss-120b': ['medium'],
    },
    models: ['gemini-3.8-flash', 'claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-oss-120b'],
    label: {
      'gemini-3.8-flash': 'Gemini 3.8 Flash',
      'claude-opus-5-5': 'Claude Opus 5.5',
      'claude-sonnet-5-5': 'Claude Sonnet 5.5',
      'gpt-oss-120b': 'GPT-OSS 120B (Medium)',
    },
    // What the CLI's own picker says, in its order and words.
    about: {
      'gemini-3.8-flash': 'current default',
      low: 'Fastest, lightest reasoning',
      medium: 'Balanced',
      high: 'Deepest reasoning for complex problems — slower but stronger · the CLI default',
    },
    // Which models a user gets depends on their Google plan (Gemini 4 Argon on
    // Ultra, Gemini 3.1 Pro on Enterprise…), so the list comes from the CLI.
    listModels: { args: ['models'], parse: parseAgyModels },
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

/** The levels a model accepts: its own list when the spec gives one, else the CLI's. */
export function effortsFor(engine: EngineSpec | undefined, model = ''): string[] {
  return engine?.modelEfforts?.[model.trim()] ?? engine?.efforts ?? [];
}

/** The CLI's arguments with the project's model, when one is set. */
export function engineArgs(
  engine: EngineSpec,
  project: { model?: string; effort?: string; repo_path?: string },
): string[] {
  const model = (project.model ?? '').trim();
  const effort = (project.effort ?? '').trim();
  const withEffort = effort && effortsFor(engine, model).includes(effort);
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
    if (path) refreshModels(e, path);
    return { ...withLiveModels(e), binary: path ?? e.binary, available: path !== null };
  });
  detected = { at: Date.now(), engines };
  return engines;
}

/** The spec as the panel sees it: the CLI's own model list where it gave one. */
export function engineSpec(id: string | undefined): EngineSpec | undefined {
  const e = ENGINES.find((x) => x.id === id);
  return e && withLiveModels(e);
}

/** Forget the cache — the user just told us the installed set may have changed. */
export function forgetDetectedEngines(): void {
  detected = null;
  live.clear();
}

// Asking a CLI for its models takes a second or two and may go to the network,
// so it runs in the background, at most hourly per CLI; the panel shows the
// spec's own list until the answer lands. A failed ask keeps the last answer.
const MODELS_TTL_MS = 3600_000;
const live = new Map<string, { at: number; models: LiveModels | null }>();

function refreshModels(e: EngineSpec, path: string): void {
  if (!e.listModels) return;
  const known = live.get(e.id);
  if (known && Date.now() - known.at < MODELS_TTL_MS) return;
  live.set(e.id, { at: Date.now(), models: known?.models ?? null }); // one ask at a time
  const { args, parse } = e.listModels;
  execFile(path, args, { timeout: 15_000, maxBuffer: 16 << 20 }, (err, out) => {
    let models: LiveModels | null = null;
    try {
      models = err ? null : parse(out);
    } catch {
      /* an answer we cannot read is no answer */
    }
    if (!models?.models.length) return;
    live.set(e.id, { at: Date.now(), models });
    detected = null;
  });
}

function withLiveModels(e: EngineSpec): EngineSpec {
  const m = live.get(e.id)?.models;
  if (!m) return e;
  return {
    ...e,
    models: m.models,
    efforts: m.efforts ?? e.efforts,
    modelEfforts: m.modelEfforts ?? e.modelEfforts,
    label: { ...e.label, ...m.label },
    about: { ...e.about, ...m.about },
  };
}

const LEVEL_ORDER = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const byLevel = (a: string, b: string) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b);

/** A model's levels, kept only where they differ from the CLI's full list. */
function narrower(efforts: string[], perModel: Map<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [model, levels] of perModel) {
    if (levels.join() !== efforts.join()) out[model] = levels;
  }
  return out;
}

/** `agy models`: one line per model and level, `<id>-<level>\t<Name> (<Level>)`.
 *  A model with no level in its name (`Claude Opus 4.6 (Thinking)`) takes none. */
export function parseAgyModels(out: string): LiveModels | null {
  const order: string[] = [];
  const levels = new Map<string, string[]>();
  const label: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const [id, name] = line.split('\t').map((x) => x?.trim());
    if (!id || !name) continue;
    const m = /^(.*) \(([^)]+)\)$/.exec(name);
    const level = m?.[2]?.toLowerCase() ?? '';
    const leveled = LEVEL_ORDER.includes(level) && id.endsWith(`-${level}`);
    const base = leveled ? id.slice(0, -(level.length + 1)) : id;
    if (!levels.has(base)) {
      order.push(base);
      levels.set(base, []);
      label[base] = leveled ? m![1]! : name;
    }
    if (leveled) levels.get(base)!.push(level);
  }
  if (!order.length) return null;
  for (const l of levels.values()) l.sort(byLevel);
  const efforts = [...new Set([...levels.values()].flat())].sort(byLevel);
  return { models: order, efforts, modelEfforts: narrower(efforts, levels), label };
}

/** `codex debug models`: the bundled catalog; only what its picker lists. */
export function parseCodexModels(out: string): LiveModels | null {
  const catalog = JSON.parse(out) as {
    models?: Array<{
      slug: string;
      description?: string;
      visibility?: string;
      priority?: number;
      supported_reasoning_levels?: Array<{ effort: string; description?: string }>;
    }>;
  };
  const listed = (catalog.models ?? [])
    .filter((m) => m.visibility === 'list')
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  if (!listed.length) return null;
  const about: Record<string, string> = {};
  const levels = new Map<string, string[]>();
  for (const m of listed) {
    if (m.description) about[m.slug] = m.description.replace(/\.$/, '');
    const own = (m.supported_reasoning_levels ?? []).map((l) => l.effort);
    levels.set(m.slug, own);
    for (const l of m.supported_reasoning_levels ?? []) {
      if (l.description && !about[l.effort]) about[l.effort] = l.description;
    }
  }
  // The CLI's order, not ours: the first model that knows every level sets it.
  const efforts = [...new Set([...levels.values()].flat())];
  for (const [m, l] of levels)
    levels.set(
      m,
      efforts.filter((e) => l.includes(e)),
    );
  return {
    models: listed.map((m) => m.slug),
    efforts,
    modelEfforts: narrower(efforts, levels),
    about,
  };
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
