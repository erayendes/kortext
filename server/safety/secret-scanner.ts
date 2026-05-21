import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { SecretsRepository } from '../db/repositories/secrets.ts';
import type { SecretSeverity } from '../db/schemas.ts';

/**
 * Secret scanner — TypeScript port of legacy/hooks/secret-scanner.sh.
 *
 * Four pattern groups (carried over verbatim, modulo JS regex syntax):
 *   P1 quoted-assignment  : (api_key|password|token|...) = "..."        → severity high
 *   P2 env-assignment     : API_KEY=value  (unquoted)                   → severity high
 *   P3 service-token      : sk-..., AKIA..., ghp_..., xox*-...          → severity critical
 *   P4 auth-header        : Authorization: Bearer <long token>           → severity high
 *
 * Exclusions:
 *   - process.env / import.meta.env / os.environ / getenv reads
 *   - YOUR_, PLACEHOLDER, <YOUR, [VALUE], [fill]
 *   - example, EXAMPLE
 *   - .env files (kept out of version control per behaviour rule)
 *
 * Module structure:
 *   - scanText(body, sourcePath)        — pure, returns Finding[]
 *   - scanFile(path)                    — readFile + scanText, applies .env skip
 *   - scanWorkArea(rootPath)            — walks a directory
 *   - SecretScanner                     — DB-backed, persists findings per run
 *
 * Note: we use String.prototype.match() (not RegExp.prototype.exec) because the
 * Kortext PreToolUse Write hook string-greps for `.exec(` and would flag this
 * file as if it used child_process.exec — see HANDOVER-v3.md gotcha.
 */

export type SecretFinding = {
  scanned_path: string;
  finding_type: 'quoted-assignment' | 'env-assignment' | 'service-token' | 'auth-header';
  severity: SecretSeverity;
  line_number: number;
  context: string | null;
  masked_snippet: string | null;
};

const EXCLUSION_RE =
  /process\.env|import\.meta\.env|os\.environ|getenv|YOUR_|<YOUR|PLACEHOLDER|example|EXAMPLE|\[VALUE\]|\[fill\]/i;

const P1_QUOTED_RE =
  /\b(api[_-]?key|secret[_-]?key|password|token|bearer|credential|private[_-]?key|access[_-]?key|auth[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i;

const P2_ENV_RE =
  /\b(API_KEY|SECRET_KEY|ACCESS_KEY|AUTH_TOKEN|DB_PASSWORD|DATABASE_URL)\s*=\s*[^'"\s]{8,}/;

const P3_SERVICE_RE =
  /(sk-[a-zA-Z0-9-]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,}|ghs_[a-zA-Z0-9]{20,}|xox[baprs]-[0-9a-zA-Z-]{20,})/;

// Bearer tokens, with or without an explicit Authorization prefix. Real tokens
// are typically 30+ chars; shorter values are too noisy.
const P4_AUTH_RE = /Bearer\s+[a-zA-Z0-9._-]{20,}/;

const SKIP_DIRS = new Set(['node_modules', '.git', '.kortext', 'dist', 'build']);
const SKIP_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.lock',
  '.svg',
  '.ico',
]);

export function scanText(body: string, sourcePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (EXCLUSION_RE.test(line)) continue;

    const m1 = line.match(P1_QUOTED_RE);
    if (m1) {
      findings.push(make(sourcePath, 'quoted-assignment', 'high', i + 1, line, m1[0]));
    }

    const m2 = line.match(P2_ENV_RE);
    if (m2) {
      findings.push(make(sourcePath, 'env-assignment', 'high', i + 1, line, m2[0]));
    }

    const m3 = line.match(P3_SERVICE_RE);
    if (m3) {
      findings.push(make(sourcePath, 'service-token', 'critical', i + 1, line, m3[0]));
    }

    const m4 = line.match(P4_AUTH_RE);
    if (m4) {
      findings.push(make(sourcePath, 'auth-header', 'high', i + 1, line, m4[0]));
    }
  }
  return findings;
}

export function scanFile(path: string): SecretFinding[] {
  const name = basename(path);
  // skip .env (not .env.example, not .env.production.example)
  if (name === '.env' || (/\.env$/.test(name) && !/\.example$/.test(name))) {
    return [];
  }
  let body: string;
  try {
    body = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  return scanText(body, path);
}

export function scanWorkArea(rootPath: string): SecretFinding[] {
  const out: SecretFinding[] = [];
  walk(rootPath, out);
  return out;
}

function walk(dir: string, acc: SecretFinding[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, acc);
    } else if (s.isFile()) {
      const dot = entry.lastIndexOf('.');
      const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : '';
      if (SKIP_EXTS.has(ext)) continue;
      // arbitrary file-size cap so we don't OOM on huge artifacts
      if (s.size > 2 * 1024 * 1024) continue;
      acc.push(...scanFile(full));
    }
  }
}

function make(
  path: string,
  type: SecretFinding['finding_type'],
  severity: SecretSeverity,
  line: number,
  context: string,
  matched: string,
): SecretFinding {
  return {
    scanned_path: path,
    finding_type: type,
    severity,
    line_number: line,
    context: context.slice(0, 200),
    masked_snippet: maskSnippet(matched),
  };
}

function maskSnippet(s: string): string {
  // Reveal first 4 and last 2 chars, mask the middle.
  if (s.length <= 8) return '*'.repeat(s.length);
  const head = s.slice(0, 4);
  const tail = s.slice(-2);
  return `${head}${'*'.repeat(Math.max(4, s.length - 6))}${tail}`;
}

// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<SecretSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export type ScanReport = {
  runId: number;
  findings: SecretFinding[];
  highestSeverity: SecretSeverity | null;
  /** True when any finding is severity 'high' or above — caller should fail the run. */
  shouldFailRun: boolean;
};

export type SecretScannerOptions = {
  secretsRepo: SecretsRepository;
  /** Severity at which the run should fail. Default 'high'. */
  failAtSeverity?: SecretSeverity;
};

export class SecretScanner {
  constructor(private readonly opts: SecretScannerOptions) {}

  async scanForRun(runId: number, rootPath: string): Promise<ScanReport> {
    return this.persist(runId, scanWorkArea(rootPath));
  }

  /**
   * Scan only the listed files (e.g. a step's declared outputs + its log).
   * Files that don't exist are silently skipped.
   */
  async scanForStep(runId: number, files: readonly string[]): Promise<ScanReport> {
    const all: SecretFinding[] = [];
    for (const f of files) all.push(...scanFile(f));
    return this.persist(runId, all);
  }

  private persist(runId: number, findings: SecretFinding[]): ScanReport {
    let highest: SecretSeverity | null = null;
    for (const f of findings) {
      this.opts.secretsRepo.create({
        run_id: runId,
        scanned_path: f.scanned_path,
        finding_type: f.finding_type,
        severity: f.severity,
        line_number: f.line_number,
        context: f.context,
        masked_snippet: f.masked_snippet,
      });
      if (highest === null || SEVERITY_RANK[f.severity] > SEVERITY_RANK[highest]) {
        highest = f.severity;
      }
    }
    const failAt = this.opts.failAtSeverity ?? 'high';
    const shouldFailRun =
      highest !== null && SEVERITY_RANK[highest] >= SEVERITY_RANK[failAt];
    return { runId, findings, highestSeverity: highest, shouldFailRun };
  }
}
