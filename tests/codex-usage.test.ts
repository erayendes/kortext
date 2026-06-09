import { describe, expect, it } from 'vitest';
import { parseCodexUsage } from '../server/engine/executors/codex-cli-executor.ts';

// UAT #10 Faz 1 follow-up — codex usage capture. `codex exec --json` streams
// JSONL events to stdout; each turn ends with a `turn.completed` event carrying
// that turn's usage (verified live, codex-cli 0.137.0):
//   {"type":"turn.completed","usage":{"input_tokens":21503,
//     "cached_input_tokens":2432,"output_tokens":17,"reasoning_output_tokens":10}}
//
// Semantics differ from claude: codex `input_tokens` INCLUDES the cached subset
// (OpenAI convention), claude's excludes it. parseCodexUsage normalizes to the
// claude/UsageMetadata convention (input = uncached only; cache_read separate)
// so rollups are comparable across executors. Multi-turn runs emit one
// turn.completed per turn — they are summed.

const TURN = (input: number, cached: number, output: number) =>
  JSON.stringify({
    type: 'turn.completed',
    usage: {
      input_tokens: input,
      cached_input_tokens: cached,
      output_tokens: output,
      reasoning_output_tokens: 0,
    },
  });

describe('parseCodexUsage', () => {
  it('extracts + normalizes a single turn.completed (cached subtracted from input)', () => {
    const stdout = [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"hi"}}',
      TURN(21503, 2432, 17),
    ].join('\n');
    expect(parseCodexUsage(stdout)).toEqual({
      executor: 'codex-cli',
      input_tokens: 21503 - 2432,
      output_tokens: 17,
      cache_read_input_tokens: 2432,
    });
  });

  it('sums usage across multiple turns', () => {
    const stdout = [TURN(1000, 800, 50), TURN(2000, 1900, 30)].join('\n');
    expect(parseCodexUsage(stdout)).toEqual({
      executor: 'codex-cli',
      input_tokens: 3000 - 2700,
      output_tokens: 80,
      cache_read_input_tokens: 2700,
    });
  });

  it('returns null when stdout has no turn.completed usage (plain-text mode)', () => {
    expect(parseCodexUsage('Codex did things.\nDone.')).toBeNull();
    expect(parseCodexUsage('')).toBeNull();
  });

  it('never returns a negative input count on odd provider numbers', () => {
    // Defensive: if a provider ever reports cached > input, clamp at 0.
    const u = parseCodexUsage(TURN(100, 150, 5));
    expect(u?.input_tokens).toBe(0);
    expect(u?.cache_read_input_tokens).toBe(150);
  });
});
