import { describe, expect, it } from 'vitest';
import { resolveExecutorBinary } from '../server/cli/binary-resolver.ts';

// A non-coder runs `kortext start` and must NOT have to export
// KORTEXT_CLAUDE_BIN=$(which claude). The resolver finds the binary itself:
// an explicit env override wins, otherwise it resolves the command to an
// ABSOLUTE path (so a detached daemon with a thin PATH still finds it), and
// only as a last resort returns the bare command name. (UAT 2026-06-08 #3.)
describe('resolveExecutorBinary', () => {
  it('returns undefined for the mock executor (no binary needed)', () => {
    expect(resolveExecutorBinary('mock')).toBeUndefined();
  });

  it('honors an explicit env override verbatim', () => {
    const env = { KORTEXT_CLAUDE_BIN: '/custom/path/claude' };
    expect(resolveExecutorBinary('claude', { env, lookupPath: () => null })).toBe(
      '/custom/path/claude',
    );
  });

  it('treats an empty/whitespace env override as unset', () => {
    const env = { KORTEXT_CLAUDE_BIN: '   ' };
    const lookupPath = (cmd: string) => `/opt/homebrew/bin/${cmd}`;
    expect(resolveExecutorBinary('claude', { env, lookupPath })).toBe('/opt/homebrew/bin/claude');
  });

  it('resolves the command to an absolute path when no override is set', () => {
    const lookupPath = (cmd: string) => (cmd === 'claude' ? '/opt/homebrew/bin/claude' : null);
    expect(resolveExecutorBinary('claude', { env: {}, lookupPath })).toBe(
      '/opt/homebrew/bin/claude',
    );
  });

  it('maps antigravity to the `agy` command and its env var', () => {
    const env = { KORTEXT_ANTIGRAVITY_BIN: '/x/agy' };
    expect(resolveExecutorBinary('antigravity', { env, lookupPath: () => null })).toBe('/x/agy');
    const lookupPath = (cmd: string) => (cmd === 'agy' ? '/usr/local/bin/agy' : null);
    expect(resolveExecutorBinary('antigravity', { env: {}, lookupPath })).toBe(
      '/usr/local/bin/agy',
    );
  });

  it('falls back to the bare command name when the lookup finds nothing', () => {
    expect(resolveExecutorBinary('codex', { env: {}, lookupPath: () => null })).toBe('codex');
  });
});
