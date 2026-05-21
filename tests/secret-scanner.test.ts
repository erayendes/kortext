import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  scanFile,
  scanText,
  scanWorkArea,
  SecretScanner,
} from '../server/safety/secret-scanner.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

function makeRunId(): number {
  return repos.runs.createRun({
    workflow_id: 'wf',
    item_id: null,
    status: 'queued',
    worktree_path: null,
    triggered_by: 'test',
  }).id;
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-secrets-'));
  const bundle = openDb({ path: join(tmpRoot, 'sec.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('scanText (pure)', () => {
  it('detects quoted api_key assignment', () => {
    const findings = scanText('const api_key = "abcdef1234567890"', 'src/foo.ts');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.finding_type).toBe('quoted-assignment');
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.line_number).toBe(1);
  });

  it('detects unquoted env-style assignment', () => {
    const findings = scanText('API_KEY=sk_live_abcdefghijklmnop', 'app.env.local');
    expect(findings.some((f) => f.finding_type === 'env-assignment')).toBe(true);
  });

  it('detects OpenAI sk- format', () => {
    const findings = scanText('use sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA here', 'x.md');
    expect(findings.some((f) => f.finding_type === 'service-token')).toBe(true);
    expect(findings.find((f) => f.finding_type === 'service-token')?.severity).toBe(
      'critical',
    );
  });

  it('detects AWS AKIA tokens', () => {
    const findings = scanText('cred = AKIAIOSFODNN7ABCDEFG', 'x.txt');
    expect(findings.some((f) => f.finding_type === 'service-token')).toBe(true);
  });

  it('detects GitHub ghp_ tokens', () => {
    const findings = scanText(
      'github_token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'cfg.yml',
    );
    expect(findings.some((f) => f.finding_type === 'service-token')).toBe(true);
  });

  it('detects Slack xox tokens', () => {
    const findings = scanText('slack=xoxb-12345-67890-abcdefghij', 'x.txt');
    expect(findings.some((f) => f.finding_type === 'service-token')).toBe(true);
  });

  it('detects Authorization Bearer headers', () => {
    const findings = scanText(
      'headers["Authorization"] = "Bearer abcdefghij1234567890ABCDEFGH"',
      'http.ts',
    );
    expect(findings.some((f) => f.finding_type === 'auth-header')).toBe(true);
  });

  it('ignores process.env reads (placeholder exclusion)', () => {
    const findings = scanText('const key = process.env.API_KEY', 'src/cfg.ts');
    expect(findings).toHaveLength(0);
  });

  it('ignores YOUR_ / PLACEHOLDER / example values', () => {
    const findings = scanText(
      'const api_key = "YOUR_API_KEY_HERE"\nconst tok = "PLACEHOLDER_TOKEN"',
      'README.md',
    );
    expect(findings).toHaveLength(0);
  });

  it('masks the secret in masked_snippet (never returns raw value)', () => {
    const findings = scanText(
      'const api_key = "supersecret-keyvalue-12345"',
      'src/leak.ts',
    );
    expect(findings.length).toBeGreaterThan(0);
    const f = findings[0]!;
    expect(f.masked_snippet).toBeTruthy();
    expect(f.masked_snippet).not.toContain('supersecret-keyvalue-12345');
    expect(f.masked_snippet).toMatch(/\*/);
  });
});

describe('scanFile', () => {
  it('skips .env files (per behaviour rule)', () => {
    const path = join(tmpRoot, '.env');
    writeFileSync(path, 'API_KEY=sk-realsecret-1234567890\n');
    const findings = scanFile(path);
    expect(findings).toHaveLength(0);
  });

  it('does NOT skip .env.example', () => {
    const path = join(tmpRoot, '.env.example');
    writeFileSync(path, 'API_KEY=sk-secret-1234567890123456789012\n');
    const findings = scanFile(path);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('returns empty array for missing file', () => {
    expect(scanFile(join(tmpRoot, 'missing.txt'))).toHaveLength(0);
  });
});

describe('scanWorkArea', () => {
  it('walks a directory and aggregates findings', () => {
    const wa = join(tmpRoot, 'work');
    mkdirSync(join(wa, 'src'), { recursive: true });
    writeFileSync(join(wa, 'clean.md'), '# fine, nothing here\n');
    writeFileSync(
      join(wa, 'src', 'leak.ts'),
      'const aws = AKIAIOSFODNN7ABCDEFG\n',
    );
    const findings = scanWorkArea(wa);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.scanned_path.endsWith('leak.ts')).toBe(true);
  });

  it('skips node_modules and .git', () => {
    const wa = join(tmpRoot, 'work2');
    mkdirSync(join(wa, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(wa, '.git'), { recursive: true });
    writeFileSync(
      join(wa, 'node_modules', 'pkg', 'leak.js'),
      'AKIAIOSFODNN7ABCDEFG',
    );
    writeFileSync(join(wa, '.git', 'config'), 'AKIAIOSFODNN7ABCDEFG');
    const findings = scanWorkArea(wa);
    expect(findings).toHaveLength(0);
  });
});

describe('SecretScanner (DB-backed)', () => {
  it('persists findings to secrets_scan_results, tagged with run id', async () => {
    const wa = join(tmpRoot, 'wa');
    mkdirSync(wa, { recursive: true });
    writeFileSync(join(wa, 'leak.ts'), 'AKIAIOSFODNN7ABCDEFG\n');

    const runId = makeRunId();
    const scanner = new SecretScanner({ secretsRepo: repos.secrets });
    const report = await scanner.scanForRun(runId, wa);

    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.highestSeverity).toBeTruthy();

    const persisted = repos.secrets.list({ severity: null, resolved: false });
    expect(persisted.length).toBeGreaterThan(0);
    expect(persisted[0]?.run_id).toBe(runId);
  });

  it('reports highestSeverity=critical when service token is found', async () => {
    const wa = join(tmpRoot, 'wa2');
    mkdirSync(wa, { recursive: true });
    writeFileSync(join(wa, 'leak.ts'), 'sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAA\n');

    const runId = makeRunId();
    const scanner = new SecretScanner({ secretsRepo: repos.secrets });
    const report = await scanner.scanForRun(runId, wa);
    expect(report.highestSeverity).toBe('critical');
    expect(report.shouldFailRun).toBe(true);
  });

  it('does not fail run when nothing is found', async () => {
    const wa = join(tmpRoot, 'wa3');
    mkdirSync(wa, { recursive: true });
    writeFileSync(join(wa, 'ok.ts'), 'export const x = 1;\n');

    const runId = makeRunId();
    const scanner = new SecretScanner({ secretsRepo: repos.secrets });
    const report = await scanner.scanForRun(runId, wa);
    expect(report.findings).toHaveLength(0);
    expect(report.highestSeverity).toBeNull();
    expect(report.shouldFailRun).toBe(false);
  });
});
