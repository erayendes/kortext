import { describe, expect, it } from 'vitest';
import { parseClaudeUsage } from '../server/engine/executors/claude-cli-executor.ts';

// FAZ 1 (token/maliyet görünürlüğü): the claude CLI run in `--output-format json`
// prints a single result envelope whose `usage` block + `total_cost_usd` are the
// per-step token/cost we want to capture. `parseClaudeUsage` pulls those out of
// the captured stdout. It must be robust to the 64 KiB tail-truncation the
// spawn helper applies (the `result` text precedes usage in the envelope, so a
// truncated front leaves the usage fields intact but breaks strict JSON.parse).

const FULL_ENVELOPE = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 12345,
  num_turns: 3,
  result: 'Done. Wrote api/health.ts.',
  session_id: 'sess_abc',
  total_cost_usd: 0.0423,
  usage: {
    input_tokens: 2500,
    cache_creation_input_tokens: 100,
    cache_read_input_tokens: 2100,
    output_tokens: 450,
    server_tool_use: { web_search_requests: 0 },
    service_tier: 'standard',
  },
});

describe('parseClaudeUsage', () => {
  it('extracts tokens + cost from a full claude --output-format json envelope', () => {
    const usage = parseClaudeUsage(FULL_ENVELOPE);
    expect(usage).toEqual({
      executor: 'claude-cli',
      input_tokens: 2500,
      output_tokens: 450,
      cache_read_input_tokens: 2100,
      cache_creation_input_tokens: 100,
      total_cost_usd: 0.0423,
    });
  });

  it('still extracts usage when the envelope is front-truncated (tail buffer cap)', () => {
    // The spawn helper keeps only the last 64 KiB of stdout. A long `result`
    // pushes the opening brace out of the buffer, so JSON.parse can't work — but
    // the usage fields (which come after `result`) survive in the tail.
    const truncated = FULL_ENVELOPE.slice(FULL_ENVELOPE.indexOf('"session_id"'));
    const usage = parseClaudeUsage(truncated);
    expect(usage?.input_tokens).toBe(2500);
    expect(usage?.output_tokens).toBe(450);
    expect(usage?.cache_read_input_tokens).toBe(2100);
    expect(usage?.total_cost_usd).toBe(0.0423);
    expect(usage?.executor).toBe('claude-cli');
  });

  it('returns null when stdout carries no usage data (plain confirmation text)', () => {
    expect(parseClaudeUsage('Done. Wrote api/health.ts.')).toBeNull();
  });

  it('returns null for empty stdout', () => {
    expect(parseClaudeUsage('')).toBeNull();
    expect(parseClaudeUsage('   \n')).toBeNull();
  });

  it('reads a scientific-notation cost (Node serializes tiny numbers as 1e-7)', () => {
    // A near-zero per-step cost serializes as an exponent; a mantissa-only regex
    // would read "1e-7" as 1 — off by 7 orders of magnitude.
    const env = '{"type":"result","total_cost_usd":1e-7,"usage":{"input_tokens":5,"output_tokens":2}}';
    const u = parseClaudeUsage(env);
    expect(u?.total_cost_usd).toBeCloseTo(1e-7, 12);
    expect(u?.input_tokens).toBe(5);
  });
});
