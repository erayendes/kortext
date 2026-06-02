import { describe, it, expect } from 'vitest';
import {
  readAcceptanceCriteria,
  setCriterionDone,
} from '../server/engine/acceptance-criteria.ts';

describe('readAcceptanceCriteria', () => {
  it('reads the new [{text, done}] shape directly', () => {
    expect(
      readAcceptanceCriteria({
        acceptance_criteria: [
          { text: 'a', done: false },
          { text: 'b', done: true },
        ],
      }),
    ).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: true },
    ]);
  });

  it('reads the legacy string[] + ac_done count (first N done)', () => {
    expect(
      readAcceptanceCriteria({ acceptance_criteria: ['a', 'b', 'c'], ac_done: 2 }),
    ).toEqual([
      { text: 'a', done: true },
      { text: 'b', done: true },
      { text: 'c', done: false },
    ]);
  });

  it('returns [] when absent, empty, or not an array', () => {
    expect(readAcceptanceCriteria({})).toEqual([]);
    expect(readAcceptanceCriteria({ acceptance_criteria: [] })).toEqual([]);
    expect(readAcceptanceCriteria({ acceptance_criteria: 'x' })).toEqual([]);
  });
});

describe('setCriterionDone', () => {
  it('marks a criterion done in the new shape, leaving the others untouched', () => {
    const fm = {
      acceptance_criteria: [
        { text: 'a', done: false },
        { text: 'b', done: false },
      ],
    };
    expect(setCriterionDone(fm, 1, true)).toEqual({
      acceptance_criteria: [
        { text: 'a', done: false },
        { text: 'b', done: true },
      ],
    });
  });

  it('unmarks a criterion', () => {
    const fm = { acceptance_criteria: [{ text: 'a', done: true }] };
    expect(setCriterionDone(fm, 0, false)).toEqual({
      acceptance_criteria: [{ text: 'a', done: false }],
    });
  });

  it('migrates a legacy string[] + ac_done item to the new shape, applying the toggle', () => {
    // legacy: ac_done=1 means only 'a' is done; now also mark index 2 ('c').
    const fm = { acceptance_criteria: ['a', 'b', 'c'], ac_done: 1, ac_total: 3 };
    expect(setCriterionDone(fm, 2, true)).toEqual({
      acceptance_criteria: [
        { text: 'a', done: true },
        { text: 'b', done: false },
        { text: 'c', done: true },
      ],
    });
  });

  it('drops the legacy ac_done/ac_total counters and preserves other frontmatter', () => {
    const fm = {
      acceptance_criteria: ['a', 'b'],
      ac_done: 0,
      ac_total: 2,
      priority: 'high',
      blocks: ['T01'],
    };
    const out = setCriterionDone(fm, 0, true);
    expect(out).toEqual({
      acceptance_criteria: [
        { text: 'a', done: true },
        { text: 'b', done: false },
      ],
      priority: 'high',
      blocks: ['T01'],
    });
    expect('ac_done' in out).toBe(false);
    expect('ac_total' in out).toBe(false);
  });

  it('does not mutate the input frontmatter', () => {
    const fm = { acceptance_criteria: [{ text: 'a', done: false }] };
    const snapshot = JSON.parse(JSON.stringify(fm));
    setCriterionDone(fm, 0, true);
    expect(fm).toEqual(snapshot);
  });
});
