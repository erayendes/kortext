import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Rules injected into EVERY step's prompt (after the persona body). The
 * behavior contract is the universal "how a Kortext agent must act" rulebook;
 * without it the agent only sees its persona + the per-task description (UAT #7
 * — rules/ used to reach only the dashboard, never the agent).
 */
const UNIVERSAL_RULES = ['behavior.md'];

/** Match a workflow input that points at a `rules/<name>.md` file. */
const RULES_INPUT_RE = /(?:^|\/)rules\/([\w-]+\.md)$/;

/**
 * Build the rules block to inject after the persona body. Composition:
 *   - the UNIVERSAL rules (behavior.md) — every step, always; plus
 *   - any `rules/<name>.md` the step declares in its `inputs` (so the
 *     model-assignment step, which inputs `rules/models.md`, actually receives
 *     the model mapping it is told to follow).
 *
 * Stable per step-type (a pure function of the rule set), so it sits in the
 * cacheable prefix alongside the persona without busting prompt-cache reuse.
 * Returns '' when nothing is available (no rulesDir / no readable files), so an
 * executor can inject it unconditionally.
 */
export function buildRulesBlock(stepInputs: string[], rulesDir: string | undefined): string {
  if (!rulesDir) return '';

  // Preserve order: universal rules first, then declared rules (deduped).
  const names: string[] = [...UNIVERSAL_RULES];
  for (const input of stepInputs) {
    const m = input.match(RULES_INPUT_RE);
    if (m?.[1] && !names.includes(m[1])) names.push(m[1]);
  }

  const blocks: string[] = [];
  for (const name of names) {
    const path = join(rulesDir, name);
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, 'utf8').trim();
      if (content) blocks.push(`# Rule: ${name}\n\n${content}`);
    } catch {
      // Unreadable rule file is non-fatal — skip it.
    }
  }
  return blocks.join('\n\n');
}
