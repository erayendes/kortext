/**
 * Acceptance-criteria helpers (server side).
 *
 * AC is stored in an item's frontmatter. Two shapes exist (this mirrors the
 * frontend reader `acChecklist` in src/lib/board-drawer.ts — keep the two in
 * sync):
 *   - NEW    `acceptance_criteria: [{ text, done }]`
 *   - LEGACY `acceptance_criteria: string[]` + `ac_done` (a count)
 *
 * The mark/unmark endpoint reads through `readAcceptanceCriteria()` and persists
 * via `setCriterionDone()`, which always writes the NEW shape — so toggling a
 * legacy item migrates it on write (and retires the ac_done/ac_total counters).
 */
import type { Repositories } from '../db/repositories/index.ts';
import type { BacklogItem } from '../db/schemas.ts';

export type AcItem = { text: string; done: boolean };

/** Read an item's acceptance criteria (either stored shape) into a canonical list. */
export function readAcceptanceCriteria(fm: Record<string, unknown>): AcItem[] {
  const raw = fm.acceptance_criteria;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  // New shape: an array of { text, done } objects → per-item flags.
  if (typeof raw[0] === 'object' && raw[0] !== null) {
    return raw.map((el) => {
      const o = el as { text?: unknown; done?: unknown };
      return { text: String(o.text ?? ''), done: Boolean(o.done) };
    });
  }

  // Legacy shape: an array of strings + an `ac_done` count → mark first N done.
  const done = typeof fm.ac_done === 'number' ? fm.ac_done : 0;
  const checked = Math.max(0, Math.min(done, raw.length));
  return raw.map((text, i) => ({ text: String(text), done: i < checked }));
}

/**
 * Return a NEW frontmatter object with criterion `index` set to `done`. The
 * acceptance_criteria are normalized to the new [{ text, done }] shape and the
 * legacy ac_done/ac_total counters are dropped; all other keys are preserved.
 * The input is not mutated. An out-of-range index is a no-op on the list (the
 * route validates bounds before calling).
 */
export function setCriterionDone(
  fm: Record<string, unknown>,
  index: number,
  done: boolean,
): Record<string, unknown> {
  const list = readAcceptanceCriteria(fm);
  const next = list.map((c, i) => (i === index ? { text: c.text, done } : c));

  const out: Record<string, unknown> = { ...fm };
  delete out.ac_done;
  delete out.ac_total;
  out.acceptance_criteria = next;
  return out;
}

export type ToggleCriterionResult =
  | { ok: true; item: BacklogItem }
  | { ok: false; error: 'not_found' | 'index_out_of_range'; message: string };

/**
 * Apply a single acceptance-criterion toggle end to end: read the item,
 * bounds-check the index, persist the new [{text, done}] frontmatter, and
 * append one `item_ac_toggle` audit entry. Both entry points — the HTTP route
 * (human override, +prime) and the MCP tool (agent, +persona) — go through
 * here, so their marks share one activity feed and can't drift on the audit
 * shape. Input-type validation (index is an int, done is a bool) belongs to
 * each entry point; this owns the domain rules + the write.
 */
export function applyCriterionToggle(
  repos: Repositories,
  args: { id: string; index: number; done: boolean; by: string },
): ToggleCriterionResult {
  const item = repos.backlog.get(args.id);
  if (!item) {
    return { ok: false, error: 'not_found', message: `backlog item not found: ${args.id}` };
  }

  const criteria = readAcceptanceCriteria(item.frontmatter);
  if (args.index >= criteria.length) {
    return {
      ok: false,
      error: 'index_out_of_range',
      message: `index ${args.index} is out of range (item has ${criteria.length} criteria)`,
    };
  }

  const nextFrontmatter = setCriterionDone(item.frontmatter, args.index, args.done);
  const updated = repos.backlog.updateFrontmatter(args.id, nextFrontmatter);
  repos.auditLog.append({
    actor: args.by,
    action: 'item_ac_toggle',
    resource_type: 'backlog_item',
    resource_id: args.id,
    payload: { index: args.index, text: criteria[args.index]!.text, done: args.done },
  });

  return { ok: true, item: updated };
}
