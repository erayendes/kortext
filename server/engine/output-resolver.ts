import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';

/**
 * Per-file report output paths (v3.1 spec §6 / Faz 13) use placeholders in
 * the filename so workflow .md authors don't have to invent slugs/timestamps:
 *
 *   outputs: .kortext/reports/product-requirements_<slug>_<ts>.md
 *
 * Engine resolves <slug>/<ts> at runtime when matching files the executor
 * produced. Placeholder grammar mirrors `markdown-sync.REPORT_FILENAME_PATTERN`
 * so a file produced via `writeReport` matches a workflow-declared template.
 */

// The <slug> segment carries the project id (project.json.code, e.g. `NOT`) or
// a lowercase scope — accept BOTH cases + digits + hyphen. Must not include `_`
// (underscores separate the report-type / slug / ts segments) and must not start
// with a hyphen.
const SLUG_PATTERN = '[A-Za-z0-9][A-Za-z0-9-]*';
// Canonical timestamp is YYYY-MM-DD_HH-MM-SS (markdown-sync.formatReportTimestamp),
// but headless agents write report files via the raw Write tool and invent the
// filename — they routinely emit looser, still date-shaped forms (compact
// `20260605`, date-only `2026-06-05`, `20260605-1959`, and the underscore form
// `20260608_174649` / `2026-06-08_17-46-49` that crashed the UAT #5 planning
// run). Match a date with optional separators and an optional time, allowing
// `-`, `_`, `:`, `T`, or space between/within the parts, so a file that
// genuinely exists on disk is never dropped as "not produced" over a
// timestamp-format nicety — while still rejecting non-date junk (e.g. `draft`).
const TIMESTAMP_PATTERN =
  '\\d{4}[-_]?\\d{2}[-_]?\\d{2}(?:[-_T ]?\\d{2}[-_:]?\\d{2}(?:[-_:]?\\d{2})?)?';

export type ResolvedOutput =
  | { kind: 'static'; absolutePath: string }
  | { kind: 'pattern'; dirAbsolute: string; filenameRegex: RegExp };

export function isPatternedPath(declaredPath: string): boolean {
  return declaredPath.includes('<slug>') || declaredPath.includes('<ts>');
}

/**
 * Distinguish a FILE output from a logical SIGNAL/marker output. Workflow steps
 * declare both: real files (`.kortext/foundation/backlog.yaml`) and bare-token
 * completion signals consumed by the next step's `inputs:` for DAG ordering
 * (`backlog-drafted`, `staging-approved`, `item-in-test`). A signal has no file
 * on disk — verifying it as one wrongly fails the step ("declared outputs not
 * produced"), which crashed planning step-1 on the codex executor (UAT #7).
 *
 * Rule (per the workflow authoring convention): an output that contains a path
 * separator `/` or a `.` (extension) is a file; anything else is a signal.
 */
export function isFileOutput(declaredOutput: string): boolean {
  return declaredOutput.includes('/') || declaredOutput.includes('.');
}

/**
 * Given a step's declared outputs, return the FILE outputs that were not
 * produced on disk. Signal/marker outputs are exempt (their "production" is the
 * step running to completion; DAG ordering already handles their availability).
 * Shared by every CLI executor's "declared outputs not produced" check.
 */
export function findMissingFileOutputs(outputs: string[], worktreePath: string): string[] {
  return outputs
    .filter(isFileOutput)
    .filter((rel) => findActualOutputFiles(rel, worktreePath).length === 0);
}

/**
 * After a step, move any file an agent wrote into the worktree root that is
 * named after a SIGNAL output (bare-token marker like `backlog-drafted`,
 * `item-in-test`) into `.kortext/temp/`. Agents create these despite signals
 * being verification-exempt (UAT #8); they must never clutter the user's
 * project root (UAT #9 #7). Best-effort: a failure to move one never throws.
 * Returns the names actually moved.
 */
export function sweepSignalMarkers(outputs: string[], worktreePath: string): string[] {
  const moved: string[] = [];
  const tempDir = join(worktreePath, '.kortext', 'temp');
  for (const out of outputs) {
    if (isFileOutput(out)) continue; // only bare-token signals
    const src = join(worktreePath, out);
    try {
      if (!existsSync(src) || !statSync(src).isFile()) continue;
      mkdirSync(tempDir, { recursive: true });
      renameSync(src, join(tempDir, out));
      moved.push(out);
    } catch {
      // Best-effort cleanup — never fail a step over a stray marker.
    }
  }
  return moved;
}

/**
 * Resolve a workflow-declared output path.
 *
 * - Static (no placeholders) → absolute path for direct lookup.
 * - Patterned (contains <slug> and/or <ts>) → directory + regex matching
 *   the filenames a run may produce. Placeholders translate to:
 *     <slug> → [a-z0-9][a-z0-9-]*
 *     <ts>   → \d{4}-\d{2}-\d{2}-\d{4}
 *
 * Placeholders are filename-only (v3.1 spec §6). A directory-level placeholder
 * is a workflow authoring error and throws — caller surfaces it as a parse
 * failure rather than scanning the whole filesystem.
 */
export function resolveDeclaredOutput(
  declaredPath: string,
  worktreePath: string,
): ResolvedOutput {
  const absolute = isAbsolute(declaredPath)
    ? declaredPath
    : join(worktreePath, declaredPath);

  if (!isPatternedPath(declaredPath)) {
    return { kind: 'static', absolutePath: absolute };
  }

  const dirAbsolute = dirname(absolute);
  const filenameTemplate = basename(absolute);
  if (isPatternedPath(dirAbsolute)) {
    throw new Error(
      `output-resolver: placeholders are only allowed in the filename: ${declaredPath}`,
    );
  }

  const escapedTemplate = filenameTemplate
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/<slug>/g, `(?:${SLUG_PATTERN})`)
    .replace(/<ts>/g, `(?:${TIMESTAMP_PATTERN})`);

  return {
    kind: 'pattern',
    dirAbsolute,
    filenameRegex: new RegExp(`^${escapedTemplate}$`),
  };
}

/**
 * Resolve a workflow-declared output to the absolute file paths that
 * actually exist on disk under `worktreePath`.
 *
 * - Static declared path → 0 or 1 result (existence check).
 * - Patterned declared path → 0..N results (every filename match in dir).
 *
 * Used by:
 *   - CLI executors' "declared outputs not produced" check — an entry with
 *     zero matches is reported as missing.
 *   - worker-pool safety guards — secret-scanner / harmful-filter / output
 *     indexer iterate over the resolved set.
 */
export function findActualOutputFiles(
  declaredPath: string,
  worktreePath: string,
): string[] {
  const resolved = resolveDeclaredOutput(declaredPath, worktreePath);

  if (resolved.kind === 'static') {
    return existsSync(resolved.absolutePath) ? [resolved.absolutePath] : [];
  }

  let entries: string[];
  try {
    entries = readdirSync(resolved.dirAbsolute);
  } catch {
    return [];
  }

  const matches: string[] = [];
  for (const name of entries) {
    if (!resolved.filenameRegex.test(name)) continue;
    const full = join(resolved.dirAbsolute, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    matches.push(full);
  }
  return matches;
}
