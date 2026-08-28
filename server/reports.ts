import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Project } from './db.js';
import { listDocs, readFrontmatter } from './docs.js';

export interface ReportInfo {
  rel: string; // reports/<file>
  name: string;
  type: string | null;
  created_at: string;
}

// The reports directory is the source of truth — whatever the agent (or the
// change generator) writes there shows up in the panel.
export function listReports(project: Project): ReportInfo[] {
  const dir = join(project.repo_path, '.kortext', 'reports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const path = join(dir, f);
      const fm = readFrontmatter(readFileSync(path, 'utf8'));
      return {
        rel: `reports/${f}`,
        name: f.replace(/\.md$/, ''),
        type: fm.type ?? null,
        created_at: statSync(path).mtime.toISOString(),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Deterministic change report: doc status snapshot + recent git history.
// No LLM involved — generated instantly from what the repo already knows.
export function generateChangeReport(
  db: Database.Database,
  project: Project,
  pkgRoot: string,
  now = new Date(),
): ReportInfo {
  const docs = listDocs(db, project, pkgRoot);
  const stamp = now.toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  for (const d of docs) counts[d.status] = (counts[d.status] ?? 0) + 1;

  let gitLog = '';
  try {
    gitLog = execFileSync('git', ['log', '--oneline', '-15'], {
      cwd: project.repo_path,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    gitLog = '(git geçmişi yok — repo değil ya da commit yok)';
  }

  const lines = [
    '---',
    'status: report',
    'type: change',
    '---',
    '',
    `# Değişiklik Raporu — ${stamp}`,
    '',
    '## Belge durumu',
    '',
    '| Belge | Durum | Yazar |',
    '| ----- | ----- | ----- |',
    ...docs.map((d) => `| ${d.rel} | ${d.status}${d.revisionPending ? ' (revizyon bekliyor)' : ''} | ${d.author ?? '-'} |`),
    '',
    '## Özet',
    '',
    ...Object.entries(counts).map(([s, n]) => `- ${s}: ${n}`),
    '',
    '## Son git hareketi',
    '',
    '```',
    gitLog,
    '```',
    '',
  ];

  const dir = join(project.repo_path, '.kortext', 'reports');
  mkdirSync(dir, { recursive: true });
  const file = `change-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`;
  writeFileSync(join(dir, file), lines.join('\n'), 'utf8');
  return {
    rel: `reports/${file}`,
    name: file.replace(/\.md$/, ''),
    type: 'change',
    created_at: now.toISOString(),
  };
}
