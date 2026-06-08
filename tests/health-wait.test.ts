import { describe, it, expect } from 'vitest';
import { waitForHealthy } from '../server/registry/health-wait.ts';

describe('waitForHealthy', () => {
  it('returns true as soon as the probe succeeds', async () => {
    let calls = 0;
    const probe = async () => {
      calls++;
      return calls >= 3; // fails twice, then healthy
    };
    const result = await waitForHealthy({
      url: 'http://localhost:3200/api/health',
      timeoutMs: 10_000,
      intervalMs: 10,
      probe,
      sleep: async () => {},
    });
    expect(result).toBe(true);
    expect(calls).toBe(3);
  });

  it('returns false when the probe never succeeds before the timeout', async () => {
    let clock = 0;
    let calls = 0;
    const result = await waitForHealthy({
      url: 'http://localhost:3200/api/health',
      timeoutMs: 50,
      intervalMs: 10,
      probe: async () => {
        calls++;
        return false;
      },
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    expect(result).toBe(false);
    expect(calls).toBeGreaterThan(1); // it actually retried, not a single shot
  });

  it('returns true on the very first probe without sleeping', async () => {
    let slept = false;
    const result = await waitForHealthy({
      url: 'http://localhost:3200/api/health',
      probe: async () => true,
      sleep: async () => {
        slept = true;
      },
    });
    expect(result).toBe(true);
    expect(slept).toBe(false);
  });
});
