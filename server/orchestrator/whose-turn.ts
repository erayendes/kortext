import type { BacklogItem } from '../db/schemas.ts';
import { GATE_PERSONA, TEST_GATES } from './test-cycle.ts';

/**
 * Derive "whose turn is it" for an item — the personas who must act now (§5.9 #5).
 *
 * Pure read over the item's column + flags (`status`, `owner`, `review_gates`);
 * NEVER consults live gate_runs and NEVER mutates `owner`. The owner (assignee)
 * is fixed for the item's life (§5.4); this is a display derivation for the board,
 * not an assignment. Returns the acting personas (0..N); empty = nobody.
 */
export function whoseTurn(item: BacklogItem): string[] {
  if (item.status === 'test') {
    // Parallel gate badges: the personas of the selected test gates (§5.4).
    return item.review_gates
      .filter((g) => TEST_GATES.includes(g))
      .map((g) => GATE_PERSONA[g]);
  }
  if (item.status === 'review') {
    // uat selected → prime approves; otherwise transient (engine auto-closes) → nobody.
    return item.review_gates.includes('uat') ? [GATE_PERSONA.uat] : [];
  }
  if (item.status === 'done' || item.status === 'cancelled') {
    return []; // terminal — owner stays set for history, but nobody acts.
  }
  if (item.status === 'blocked') {
    return ['+prime']; // prime resolves the block (§5.9 #9 routes blocks to prime).
  }
  // to_do / in_progress → the owner (waiting to start / building).
  return item.owner ? [item.owner] : [];
}
