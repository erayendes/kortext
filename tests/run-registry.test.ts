import { describe, expect, it } from 'vitest';
import { RunRegistry } from '../server/engine/run-registry.ts';

describe('RunRegistry — cancellation registry (§5.9 #9)', () => {
  it('cancel(runId) aborts the registered controller and returns true', () => {
    const reg = new RunRegistry();
    const ac = new AbortController();
    reg.register(1, 'ITEM-1', ac);
    expect(ac.signal.aborted).toBe(false);

    const cancelled = reg.cancel(1);
    expect(cancelled).toBe(true);
    expect(ac.signal.aborted).toBe(true);
  });

  it('cancel(unknown runId) → false', () => {
    const reg = new RunRegistry();
    expect(reg.cancel(999)).toBe(false);
  });

  it("cancelForItem aborts all of an item's runs, leaving other items untouched", () => {
    const reg = new RunRegistry();
    const a = new AbortController();
    const b = new AbortController();
    const other = new AbortController();
    reg.register(1, 'ITEM-1', a);
    reg.register(2, 'ITEM-1', b);
    reg.register(3, 'ITEM-2', other);

    const cancelled = reg.cancelForItem('ITEM-1');
    expect(cancelled.sort()).toEqual([1, 2]);
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false); // ITEM-2 untouched
    expect(reg.cancel(1)).toBe(false); // forgotten after cancelForItem
  });
});
