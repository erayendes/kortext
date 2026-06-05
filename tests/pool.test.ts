import { describe, expect, it } from 'vitest';
import { mapWithPool } from '../server/orchestrator/pool.ts';

describe('mapWithPool', () => {
  it('preserves input order in the results regardless of finish order', async () => {
    const out = await mapWithPool([10, 1, 5], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(['0:10', '1:1', '2:5']);
  });

  it('runs independent items concurrently (overlap up to the cap)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithPool([0, 0, 0, 0], 3, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
    });
    // With cap 3 and 4 items, at least 3 ran at once.
    expect(maxInFlight).toBe(3);
  });

  it('never exceeds the concurrency cap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithPool(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
    });
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it('handles an empty list and a cap larger than the list', async () => {
    expect(await mapWithPool([], 5, async () => 1)).toEqual([]);
    expect(await mapWithPool([1, 2], 99, async (n) => n * 2)).toEqual([2, 4]);
  });
});
