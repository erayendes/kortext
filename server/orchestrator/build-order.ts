import type { BacklogItem } from '../db/schemas.ts';

/**
 * Decide which backlog items the build/drive scheduler may start NOW, in the
 * order Eray requires: **current version → dependency-ready items** (UAT #9 #1).
 *
 * Before this, the driver ran every `to_do` item in parallel, ignoring
 * `blocked_by` and `version` — all items coded from the same `development`
 * base, so all but the first hit a merge conflict and bounced to a permanent
 * stall. This filter is the single authority on build-readiness:
 *
 *   - epics are never built (they complete when their children do);
 *   - only `to_do` (fresh) or `in_progress` (bounced/returned — UAT #9 #2,
 *     retried so a conflicted item gets a fresh dev-cycle from the now-updated
 *     `development`) items are candidates;
 *   - terminal (done/cancelled) and in-flight (test/review) items are excluded;
 *   - an item is dependency-ready only when every `blocked_by` id is terminal
 *     (a dangling blocker is treated as resolved — never a permanent stall);
 *   - version gate: only items of the EARLIEST version that still has open work
 *     run; later versions wait until the current one is fully done. Items with
 *     no version are not version-gated.
 */

const TERMINAL: ReadonlySet<string> = new Set(['done', 'cancelled']);
const CANDIDATE: ReadonlySet<string> = new Set(['to_do', 'in_progress']);

/** Parse "v0.10" → [0, 10], stripping the leading non-digit prefix. Numeric
 *  segment compare so v0.10 > v0.2 (NOT a lexical string sort). */
function versionSegments(v: string): number[] {
  const digits = v.replace(/^[^\d]*/, '');
  if (!digits) return [];
  return digits.split('.').map((s) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  });
}

function compareVersions(a: string, b: string): number {
  const sa = versionSegments(a);
  const sb = versionSegments(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const diff = (sa[i] ?? 0) - (sb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function blockedBy(item: BacklogItem): string[] {
  const bb = item.frontmatter['blocked_by'];
  return Array.isArray(bb) ? bb.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Derived LOCK flag — `blocked` is NOT a status (Eray's model, UAT #10).
 *
 * An item is "locked" when it lists a `blocked_by` dependency that is not yet
 * terminal (done/cancelled). The item keeps its real status (to_do /
 * in_progress / …); this overlay drives the board's 🔒 badge + the scheduler's
 * readiness gate — nothing ever moves into a separate `blocked` column.
 *
 * A dangling blocker (id not present in `byId`) is treated as resolved, so a
 * stale dependency reference can never cause a permanent lock.
 */
export function isBlocked(item: BacklogItem, byId: Map<string, BacklogItem>): boolean {
  return blockedBy(item).some((depId) => {
    const dep = byId.get(depId);
    return dep != null && !TERMINAL.has(dep.status);
  });
}

export function selectBuildableItems(items: BacklogItem[]): BacklogItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));

  // The current version = the smallest version that still has open (non-terminal)
  // non-epic work. Only that version's items may build this pass.
  let currentVersion: string | undefined;
  for (const i of items) {
    if (i.type === 'epic' || TERMINAL.has(i.status) || !i.version) continue;
    if (currentVersion === undefined || compareVersions(i.version, currentVersion) < 0) {
      currentVersion = i.version;
    }
  }

  const depsResolved = (item: BacklogItem): boolean =>
    blockedBy(item).every((depId) => {
      const dep = byId.get(depId);
      return !dep || TERMINAL.has(dep.status); // dangling = resolved
    });

  return items.filter(
    (i) =>
      i.type !== 'epic' &&
      CANDIDATE.has(i.status) &&
      depsResolved(i) &&
      // Version gate: an item with a version only runs in the current version;
      // un-versioned items are never version-gated.
      (!currentVersion || !i.version || i.version === currentVersion),
  );
}
