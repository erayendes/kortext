import { describe, expect, it, beforeEach } from 'vitest';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseBacklogYaml, ingestBacklogItems } from '../server/engine/backlog-ingest.ts';

let repos: Repositories;
beforeEach(() => {
  repos = openDb({ path: ':memory:' }).repositories;
});

const SAMPLE = `items:
  - id: T-1
    type: task
    title: First
    priority: P0
    description: do the thing
    acceptance_criteria: [works, tested]
    review_gates: [code_review, bogus_gate]
    blocks: [T-2]
    blocked_by: []
  - id: T-2
    type: nonsense
    title: Bad type
  - id: T-3
    type: bug
    title: A bug
`;

// The shape the model naturally emits: markdown prose + per-section ```yaml
// fenced blocks, each holding a list of items. The parser must handle this too.
const MARKDOWN_WITH_FENCES = [
  '---',
  'workflow: planning-pipeline',
  '---',
  '',
  '# HydroFlow — Backlog',
  '',
  '## INFRA',
  '',
  '```yaml',
  '- id: INFRA-001',
  '  type: task',
  '  title: "Project setup"',
  '  review_gates: [code_review]',
  '```',
  '',
  '## AUTH',
  '',
  '```yaml',
  '- id: AUTH-001',
  '  type: task',
  '  title: "Login"',
  '  review_gates: [security_control]',
  '```',
  '',
].join('\n');

describe('parseBacklogYaml', () => {
  it('parses items from markdown ```yaml fenced blocks (model-natural shape)', () => {
    const result = parseBacklogYaml(MARKDOWN_WITH_FENCES);
    expect(result.items.map((i) => i.id).sort()).toEqual(['AUTH-001', 'INFRA-001']);
    const created = ingestBacklogItems(repos, result.items).created.sort();
    expect(created).toEqual(['AUTH-001', 'INFRA-001']);
  });

  it('parses all 3 entries with no parse errors', () => {
    const result = parseBacklogYaml(SAMPLE);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]!.id).toBe('T-1');
    expect(result.items[1]!.id).toBe('T-2');
    expect(result.items[2]!.id).toBe('T-3');
  });

  it('returns empty items and error when no "items" array found', () => {
    const result = parseBacklogYaml('just: a string');
    expect(result.items).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/items/i);
  });

  it('returns empty items and a parse error on invalid YAML', () => {
    // genuinely invalid YAML
    const result = parseBacklogYaml('items:\n  - [unclosed');
    expect(result.items).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/yaml parse failed/i);
  });

  it('skips entries missing id, title, or type and records errors', () => {
    const bad = `items:
  - title: No id
    type: task
  - id: X-1
    type: task
`;
    const result = parseBacklogYaml(bad);
    // second entry has id+type but no title — skipped; first has title+type but no id — skipped
    expect(result.items).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('ingestBacklogItems', () => {
  it('creates T-1 and T-3, skips T-2 with invalid type reason', () => {
    const { items } = parseBacklogYaml(SAMPLE);
    const result = ingestBacklogItems(repos, items);

    expect(result.created).toContain('T-1');
    expect(result.created).toContain('T-3');
    expect(result.created).not.toContain('T-2');

    const t2skip = result.skipped.find((s) => s.id === 'T-2');
    expect(t2skip).toBeDefined();
    expect(t2skip!.reason).toMatch(/invalid type/i);
  });

  it('T-1 row has correct review_gates, body_md, and frontmatter', () => {
    const { items } = parseBacklogYaml(SAMPLE);
    ingestBacklogItems(repos, items);

    const row = repos.backlog.get('T-1');
    expect(row).not.toBeNull();
    expect(row!.review_gates).toEqual(['code_review']); // bogus_gate dropped
    expect(row!.body_md).toBe('do the thing');
    expect(row!.frontmatter.priority).toBe('P0');
    expect(row!.frontmatter.acceptance_criteria).toEqual(['works', 'tested']);
    expect(row!.frontmatter.blocks).toEqual(['T-2']);
  });

  it('is idempotent: second ingest creates 0 and marks existing as skipped', () => {
    const { items } = parseBacklogYaml(SAMPLE);

    // first call
    ingestBacklogItems(repos, items);

    // second call — same items
    const second = ingestBacklogItems(repos, items);
    expect(second.created).toHaveLength(0);

    const t1skip = second.skipped.find((s) => s.id === 'T-1');
    const t3skip = second.skipped.find((s) => s.id === 'T-3');
    expect(t1skip).toBeDefined();
    expect(t1skip!.reason).toMatch(/already exists/i);
    expect(t3skip).toBeDefined();
    expect(t3skip!.reason).toMatch(/already exists/i);
  });
});
