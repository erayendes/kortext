import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveScheduler } from '../server/orchestrator/drive-scheduler.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('DriveScheduler', () => {
  it('starts disabled (not running, no interval)', () => {
    const s = new DriveScheduler({ tick: () => {} });
    expect(s.running).toBe(false);
    expect(s.intervalMs).toBe(0);
  });

  it('ticks every interval once started', () => {
    let n = 0;
    const s = new DriveScheduler({ tick: () => { n++; } });
    s.start(1000);
    expect(s.running).toBe(true);
    expect(s.intervalMs).toBe(1000);
    vi.advanceTimersByTime(3500);
    expect(n).toBe(3);
  });

  it('stop() halts ticks and resets state', () => {
    let n = 0;
    const s = new DriveScheduler({ tick: () => { n++; } });
    s.start(1000);
    vi.advanceTimersByTime(2000);
    expect(n).toBe(2);
    s.stop();
    expect(s.running).toBe(false);
    expect(s.intervalMs).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(n).toBe(2); // no further ticks
  });

  it('start() replaces a previous interval (no double-fire)', () => {
    let n = 0;
    const s = new DriveScheduler({ tick: () => { n++; } });
    s.start(1000);
    s.start(2000); // replaces
    expect(s.intervalMs).toBe(2000);
    vi.advanceTimersByTime(2000);
    expect(n).toBe(1); // only the 2000ms interval fired once
  });

  it('a throwing tick does not stop the scheduler', () => {
    let n = 0;
    const s = new DriveScheduler({
      tick: () => { n++; if (n === 1) throw new Error('boom'); },
      log: () => {},
    });
    s.start(1000);
    vi.advanceTimersByTime(3000);
    expect(n).toBe(3); // kept ticking past the throw
  });
});
