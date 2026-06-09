import yaml from 'js-yaml';

/**
 * Machine-readable gate verdict (#4 — strict gates).
 *
 * A gate persona writes a report whose YAML frontmatter carries a `verdict`
 * (`pass` | `fail`) and `ac_results` (per-criterion judgments), with human
 * findings in the body or a `findings:` field. This parser is the gate's
 * single source of truth: the agent merely running clean is NOT a pass — only
 * an explicit `verdict: pass` is. Anything missing/invalid is a STRICT fail so
 * an item never sails through a gate that did not actually render a verdict.
 */

export type AcResult = { text: string; status: 'met' | 'unmet' };

export type GateVerdict = {
  pass: boolean;
  findings: string | null;
  acResults: AcResult[];
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/;

/** Parse `ac_results:` (a list of `{ text, status }`) into a typed list. */
function parseAcResults(raw: unknown): AcResult[] {
  if (!Array.isArray(raw)) return [];
  const out: AcResult[] = [];
  for (const el of raw) {
    if (typeof el !== 'object' || el === null) continue;
    const o = el as { text?: unknown; status?: unknown };
    const status = o.status === 'met' ? 'met' : 'unmet';
    out.push({ text: String(o.text ?? ''), status });
  }
  return out;
}

/**
 * Parse a gate report into a strict verdict.
 *
 * Rules:
 *   - `verdict: fail` → `pass: false`.
 *   - `verdict: pass` → `pass: true`.
 *   - missing/invalid verdict (incl. no frontmatter) → `pass: false` with
 *     findings `"gate report missing a verdict"`.
 *   - `acResults` from `ac_results` (default `[]`).
 *   - `findings` = a `findings:` frontmatter field if present, else the body.
 */
export function parseGateVerdict(reportText: string): GateVerdict {
  const match = FRONTMATTER_RE.exec(reportText.trim());
  if (!match) {
    return { pass: false, findings: 'gate report missing a verdict', acResults: [] };
  }

  let fm: Record<string, unknown>;
  try {
    const loaded = yaml.load(match[1] ?? '', { schema: yaml.JSON_SCHEMA });
    fm = typeof loaded === 'object' && loaded !== null ? (loaded as Record<string, unknown>) : {};
  } catch {
    return { pass: false, findings: 'gate report missing a verdict', acResults: [] };
  }

  const acResults = parseAcResults(fm.ac_results);
  const body = (match[2] ?? '').trim();
  const findingsField = typeof fm.findings === 'string' ? fm.findings.trim() : '';
  const findings = findingsField || body || null;

  const verdict = fm.verdict;
  if (verdict === 'pass') return { pass: true, findings, acResults };
  if (verdict === 'fail') return { pass: false, findings, acResults };

  return { pass: false, findings: 'gate report missing a verdict', acResults };
}
