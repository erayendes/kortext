import { describe, it, expect } from 'vitest';
import { normalizeExecutor } from '../server/blueprint/io.ts';

describe('normalizeExecutor', () => {
  it('passes through the executors onboarding offers', () => {
    expect(normalizeExecutor('mock')).toBe('mock');
    expect(normalizeExecutor('claude')).toBe('claude');
    expect(normalizeExecutor('codex')).toBe('codex');
    expect(normalizeExecutor('antigravity')).toBe('antigravity');
  });

  it('falls back to mock for unknown, empty, or non-string values', () => {
    // gemini is engine-supported but not offered via onboarding → mock
    expect(normalizeExecutor('gemini')).toBe('mock');
    expect(normalizeExecutor('gpt')).toBe('mock');
    expect(normalizeExecutor('')).toBe('mock');
    expect(normalizeExecutor(undefined)).toBe('mock');
    expect(normalizeExecutor(null)).toBe('mock');
    expect(normalizeExecutor(42)).toBe('mock');
  });
});
