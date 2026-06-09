import { describe, expect, it } from 'vitest';
import { parseGeminiUsage } from '../server/engine/executors/gemini-cli-executor.ts';

// UAT #10 Faz 1 follow-up — gemini usage capture. `gemini --output-format json`
// (GA since gemini-cli v0.6.0) prints ONE JSON object:
//   { "response": "...", "stats": { "models": { "<model>": { "api": {...},
//       "tokens": { input, prompt, candidates, total, cached, thoughts, tool },
//       "roles": {...} } }, "tools": {...}, "files": {...} }, "error"?: {...} }
// (shape verified against google-gemini/gemini-cli docs/cli/headless.md +
// packages/core/src/telemetry/uiTelemetry.ts — the gemini binary is not
// installed on this machine, so a live probe is pending.)
//
// Mapping: `tokens.input` is already prompt-minus-cached (claude convention) →
// no normalization needed; output = candidates + thoughts (both billed output).
// Multiple models (e.g. flash + pro in one run) are summed. `roles` repeats the
// same token shape per role — it must NOT be double-counted.

const ENVELOPE = JSON.stringify({
  response: 'Done. Wrote api/health.ts.',
  stats: {
    models: {
      'gemini-2.5-pro': {
        api: { totalRequests: 2, totalErrors: 0, totalLatencyMs: 5000 },
        tokens: { input: 1200, prompt: 4200, candidates: 300, total: 4700, cached: 3000, thoughts: 200, tool: 0 },
        roles: {
          main: { tokens: { input: 1200, prompt: 4200, candidates: 300, total: 4700, cached: 3000, thoughts: 200, tool: 0 } },
        },
      },
      'gemini-2.5-flash': {
        api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 800 },
        tokens: { input: 100, prompt: 100, candidates: 20, total: 120, cached: 0, thoughts: 0, tool: 0 },
        roles: {},
      },
    },
    tools: {},
    files: { totalLinesAdded: 10, totalLinesRemoved: 0 },
  },
});

describe('parseGeminiUsage', () => {
  it('sums per-model tokens from the stats envelope (roles NOT double-counted)', () => {
    expect(parseGeminiUsage(ENVELOPE)).toEqual({
      executor: 'gemini-cli',
      input_tokens: 1300, // Σ tokens.input (already cached-excluded)
      output_tokens: 520, // Σ (candidates + thoughts)
      cache_read_input_tokens: 3000,
    });
  });

  it('returns null for plain-text stdout (no stats envelope)', () => {
    expect(parseGeminiUsage('Gemini did things.\nDone.')).toBeNull();
    expect(parseGeminiUsage('')).toBeNull();
  });

  it('returns null when the envelope has no models (e.g. hard error before any call)', () => {
    expect(parseGeminiUsage('{"response":"","stats":{"models":{}},"error":{"message":"boom"}}')).toBeNull();
  });
});
