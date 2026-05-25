import { existsSync, readdirSync, statSync } from 'node:fs';
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

const SLUG_PATTERN = '[a-z0-9][a-z0-9-]*';
const TIMESTAMP_PATTERN = '\\d{4}-\\d{2}-\\d{2}-\\d{4}';

export type ResolvedOutput =
  | { kind: 'static'; absolutePath: string }
  | { kind: 'pattern'; dirAbsolute: string; filenameRegex: RegExp };

export function isPatternedPath(declaredPath: string): boolean {
  return declaredPath.includes('<slug>') || declaredPath.includes('<ts>');
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
