import { spawnSync } from 'node:child_process';

/**
 * `kortext init` preflight — verifies the user has the runtimes Kortext
 * needs (node, git) and at least one CLI executor (claude/codex/gemini).
 *
 * Pure data function: no console output, no exit codes. The CLI wrapper
 * formats the report and decides whether to continue or block.
 */

export type ToolCheckOk = {
  name: string;
  ok: true;
  version: string;
  required?: string;
  /** True when the version satisfies `required` (or no requirement set). */
  versionOk: boolean;
};

export type ToolCheckMissing = {
  name: string;
  ok: false;
  reason: 'not-found' | 'version-parse-failed';
  installHint: string;
};

export type ToolCheck = ToolCheckOk | ToolCheckMissing;

export type PreflightReport = {
  node: ToolCheck;
  git: ToolCheck;
  claude: ToolCheck;
  codex: ToolCheck;
  gemini: ToolCheck;
  /** True if node + git are present with versions OK and at least one CLI exists. */
  ready: boolean;
  /** Hard blockers — node or git missing / too old. */
  blockers: string[];
  /** Soft warnings — no CLI installed (mock executor still works). */
  warnings: string[];
};

type ProbeResult = { ok: true; raw: string } | { ok: false };

type ProbeFn = (cmd: string, args: string[]) => ProbeResult;

const DEFAULT_PROBE: ProbeFn = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false });
  if (r.error || r.status !== 0) return { ok: false };
  const raw = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
  if (!raw) return { ok: false };
  return { ok: true, raw };
};

const INSTALL_HINTS: Record<string, string> = {
  node: 'install: https://nodejs.org/ (Node ≥ 22)',
  git: 'install: https://git-scm.com/downloads (Git ≥ 2.30)',
  claude: 'install: https://docs.claude.com/claude-code',
  codex: 'install: https://github.com/openai/codex-cli',
  gemini: 'install: https://github.com/google-gemini/gemini-cli',
};

function parseSemver(raw: string): [number, number, number] | null {
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverGte(have: [number, number, number], want: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    const h = have[i] ?? 0;
    const w = want[i] ?? 0;
    if (h > w) return true;
    if (h < w) return false;
  }
  return true;
}

function checkTool(
  name: string,
  cmd: string,
  args: string[],
  required: [number, number, number] | null,
  probe: ProbeFn,
): ToolCheck {
  const r = probe(cmd, args);
  if (!r.ok) {
    return {
      name,
      ok: false,
      reason: 'not-found',
      installHint: INSTALL_HINTS[name] ?? '',
    };
  }
  const semver = parseSemver(r.raw);
  if (!semver) {
    // Tool runs but we can't read the version — still treat as present.
    return {
      name,
      ok: true,
      version: r.raw.split('\n')[0] ?? '',
      required: required ? required.join('.') : undefined,
      versionOk: required === null,
    };
  }
  return {
    name,
    ok: true,
    version: semver.join('.'),
    required: required ? required.join('.') : undefined,
    versionOk: required === null || semverGte(semver, required),
  };
}

export type PreflightOptions = {
  probe?: ProbeFn;
};

export function runPreflight(opts: PreflightOptions = {}): PreflightReport {
  const probe = opts.probe ?? DEFAULT_PROBE;
  const node = checkTool('node', 'node', ['--version'], [22, 0, 0], probe);
  const git = checkTool('git', 'git', ['--version'], [2, 30, 0], probe);
  const claude = checkTool('claude', 'claude', ['--version'], null, probe);
  const codex = checkTool('codex', 'codex', ['--version'], null, probe);
  const gemini = checkTool('gemini', 'gemini', ['--version'], null, probe);

  const blockers: string[] = [];
  if (!node.ok) blockers.push('node not found');
  else if (!node.versionOk) blockers.push(`node ${node.version} < required ${node.required}`);
  if (!git.ok) blockers.push('git not found');
  else if (!git.versionOk) blockers.push(`git ${git.version} < required ${git.required}`);

  const warnings: string[] = [];
  const cliPresent = [claude, codex, gemini].some((c) => c.ok);
  if (!cliPresent) {
    warnings.push(
      'no agent CLI found (claude / codex / gemini) — runtime will only work with --executor=mock',
    );
  }

  return {
    node,
    git,
    claude,
    codex,
    gemini,
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}

export function formatPreflightForCli(report: PreflightReport): string {
  const lines: string[] = [];
  const order: Array<keyof PreflightReport> = [
    'node',
    'git',
    'claude',
    'codex',
    'gemini',
  ];
  for (const key of order) {
    const tool = report[key] as ToolCheck;
    if (tool.ok) {
      const versionLabel = tool.required
        ? `${tool.version} (≥ ${tool.required} required)`
        : tool.version;
      const mark = tool.versionOk ? '✓' : '⚠';
      lines.push(`  ${mark} ${tool.name} ${versionLabel}`);
    } else {
      lines.push(`  ⚠ ${tool.name} not found — ${tool.installHint}`);
    }
  }
  for (const w of report.warnings) {
    lines.push(`  ℹ ${w}`);
  }
  for (const b of report.blockers) {
    lines.push(`  ✗ ${b}`);
  }
  return lines.join('\n');
}
