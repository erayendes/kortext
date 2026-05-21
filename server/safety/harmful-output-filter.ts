/**
 * Harmful output filter — placeholder.
 *
 * v3.0 ships an extension point only. The real implementation (v3.1+) will
 * incorporate a curated bad-word list, prompt-injection signature matching,
 * and policy-based classifiers. For now this module exposes the contract so
 * downstream callers (worker-pool integration, dashboard) can wire it up
 * without churn later.
 */

export type HarmfulOutputFinding = {
  kind: 'banned-phrase' | 'policy-violation';
  message: string;
  line_number: number | null;
  /** Snippet around the match. */
  context: string | null;
};

export type HarmfulOutputReport = {
  findings: HarmfulOutputFinding[];
  shouldFailRun: boolean;
};

export type HarmfulOutputFilterOptions = {
  /**
   * Phrases to block, lowercased. Default: empty (filter is a no-op).
   * Real lists will be loaded from `rules/banned-phrases.md` or a runtime
   * config table in v3.1+.
   */
  bannedPhrases?: readonly string[];
};

export class HarmfulOutputFilter {
  private readonly phrases: string[];

  constructor(opts: HarmfulOutputFilterOptions = {}) {
    this.phrases = (opts.bannedPhrases ?? []).map((p) => p.toLowerCase());
  }

  /**
   * Scan a chunk of output text. Returns an empty finding list when no
   * banned phrases are configured.
   */
  scanText(body: string): HarmfulOutputReport {
    const findings: HarmfulOutputFinding[] = [];
    if (this.phrases.length === 0) return { findings, shouldFailRun: false };

    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const lower = (lines[i] ?? '').toLowerCase();
      for (const phrase of this.phrases) {
        if (lower.includes(phrase)) {
          findings.push({
            kind: 'banned-phrase',
            message: `output contains banned phrase '${phrase}'`,
            line_number: i + 1,
            context: (lines[i] ?? '').slice(0, 200),
          });
        }
      }
    }
    return { findings, shouldFailRun: findings.length > 0 };
  }
}
