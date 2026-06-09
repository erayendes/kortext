import { describe, expect, it } from 'vitest';
import {
  isEmptyOutputExitZero,
  isRecoverableCliFailure,
  isTransientCliFailure,
} from '../server/engine/executors/cli-spawn.ts';

// UAT #10: antigravity hit `RESOURCE_EXHAUSTED (code 429): Individual quota
// reached`, returned exit-0 with empty output, and the run hard-failed with a
// misleading "declared outputs not produced". These helpers recognise that
// shape so the FallbackExecutor can fall over to the next executor.

const base = { exitCode: 1, stdoutTail: '', stderrTail: '', aborted: false };

describe('isTransientCliFailure — quota markers', () => {
  it('flags RESOURCE_EXHAUSTED / quota / 429 as transient', () => {
    for (const msg of [
      'RESOURCE_EXHAUSTED (code 429): Individual quota reached',
      'Error: quota exceeded for this model',
      'HTTP 429 Too Many Requests',
    ]) {
      expect(isTransientCliFailure({ ...base, stderrTail: msg }), msg).toBe(true);
    }
  });
});

describe('isEmptyOutputExitZero', () => {
  it('flags an exit-0 run with empty stdout (the agy 429 shape)', () => {
    expect(isEmptyOutputExitZero({ exitCode: 0, stdoutTail: '', aborted: false })).toBe(true);
    expect(
      isEmptyOutputExitZero({ exitCode: 0, stdoutTail: '   \n  ', aborted: false }),
    ).toBe(true);
  });

  it('does NOT flag an exit-0 run that produced real stdout', () => {
    expect(
      isEmptyOutputExitZero({ exitCode: 0, stdoutTail: 'wrote report.md', aborted: false }),
    ).toBe(false);
  });

  it('does NOT flag a non-zero exit (that is the transient path)', () => {
    expect(isEmptyOutputExitZero({ exitCode: 1, stdoutTail: '', aborted: false })).toBe(false);
  });

  it('does NOT flag an aborted run', () => {
    expect(isEmptyOutputExitZero({ exitCode: 0, stdoutTail: '', aborted: true })).toBe(false);
  });
});

describe('isRecoverableCliFailure', () => {
  it('is recoverable for a transient (non-zero + network) failure', () => {
    expect(
      isRecoverableCliFailure({ ...base, stderrTail: 'API Error: socket connection was closed' }),
    ).toBe(true);
  });

  it('is recoverable for the exit-0 empty-output quota shape', () => {
    expect(
      isRecoverableCliFailure({ exitCode: 0, stdoutTail: '', stderrTail: '', aborted: false }),
    ).toBe(true);
  });

  it('is recoverable for an exit-0 run that printed a 429/quota marker', () => {
    expect(
      isRecoverableCliFailure({
        exitCode: 0,
        stdoutTail: 'some noise\nRESOURCE_EXHAUSTED (code 429): Individual quota reached',
        stderrTail: '',
        aborted: false,
      }),
    ).toBe(true);
  });

  it('is NOT recoverable for a deterministic exit-0 success with real output', () => {
    expect(
      isRecoverableCliFailure({
        exitCode: 0,
        stdoutTail: 'wrote report.md — done',
        stderrTail: '',
        aborted: false,
      }),
    ).toBe(false);
  });

  it('is NOT recoverable for a deterministic config failure', () => {
    expect(
      isRecoverableCliFailure({ ...base, stderrTail: 'Error: invalid model "claude-nope"' }),
    ).toBe(false);
  });

  it('is NOT recoverable for an aborted run', () => {
    expect(
      isRecoverableCliFailure({ ...base, aborted: true, stderrTail: 'rate limit exceeded' }),
    ).toBe(false);
  });
});
