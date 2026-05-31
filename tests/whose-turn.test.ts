import { describe, expect, it } from 'vitest';
import { whoseTurn } from '../server/orchestrator/whose-turn.ts';
import type { BacklogItem } from '../server/db/schemas.ts';

/** Build a valid BacklogItem with defaults; whoseTurn only reads status/owner/review_gates. */
function item(overrides: Partial<BacklogItem>): BacklogItem {
  return {
    id: 'X',
    type: 'task',
    title: 'X',
    status: 'to_do',
    owner: null,
    parent_id: null,
    version: null,
    review_gates: [],
    frontmatter: {},
    body_md: '',
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('whoseTurn — §5.9 #5 board derivation', () => {
  it('in_progress → the owner (developer building)', () => {
    expect(whoseTurn(item({ status: 'in_progress', owner: '+backend-developer' }))).toEqual([
      '+backend-developer',
    ]);
  });

  it("test → the selected test gates' personas (parallel badges), not the owner", () => {
    const result = whoseTurn(
      item({
        status: 'test',
        owner: '+backend-developer',
        review_gates: ['code_review', 'security_control'],
      }),
    );
    expect(result).toEqual(['+engineering-manager', '+security-engineer']);
  });

  it('review + uat → +prime (prime approves, owner not overwritten)', () => {
    const result = whoseTurn(
      item({ status: 'review', owner: '+backend-developer', review_gates: ['uat'] }),
    );
    expect(result).toEqual(['+prime']);
  });

  it('review without uat → nobody (transient; engine auto-closes)', () => {
    const result = whoseTurn(
      item({ status: 'review', owner: '+backend-developer', review_gates: ['code_review'] }),
    );
    expect(result).toEqual([]);
  });

  it('done → nobody (terminal), even though owner stays set', () => {
    expect(whoseTurn(item({ status: 'done', owner: '+backend-developer' }))).toEqual([]);
  });

  it('cancelled → nobody (terminal)', () => {
    expect(whoseTurn(item({ status: 'cancelled', owner: '+backend-developer' }))).toEqual([]);
  });

  it('blocked → +prime (prime resolves the block; §5.9 #9 intent)', () => {
    expect(whoseTurn(item({ status: 'blocked', owner: '+backend-developer' }))).toEqual(['+prime']);
  });

  // Characterization: lock the interpretive/edge contracts Eray approved.
  it('to_do assigned → the owner (waiting to start)', () => {
    expect(whoseTurn(item({ status: 'to_do', owner: '+backend-developer' }))).toEqual([
      '+backend-developer',
    ]);
  });

  it('to_do unassigned → nobody', () => {
    expect(whoseTurn(item({ status: 'to_do', owner: null }))).toEqual([]);
  });

  it('test with no test-gates selected → nobody (engine vacuously passes)', () => {
    expect(whoseTurn(item({ status: 'test', owner: '+backend-developer', review_gates: [] }))).toEqual(
      [],
    );
  });
});
