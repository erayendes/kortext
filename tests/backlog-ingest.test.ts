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

  it('reports (does not silently drop) a malformed fenced block', () => {
    const mixed = [
      '# Backlog',
      '```yaml',
      '- id: GOOD-1',
      '  type: task',
      '  title: Fine',
      '```',
      '```yaml',
      '- id: BAD-1',
      '   type: task', // bad indentation → block fails to parse
      ' title: broken',
      '```',
    ].join('\n');
    const result = parseBacklogYaml(mixed);
    expect(result.items.map((i) => i.id)).toEqual(['GOOD-1']); // good block survives
    expect(result.errors.length).toBeGreaterThan(0); // bad block surfaced, not silent
    expect(result.errors.some((e) => /fenced block/i.test(e))).toBe(true);
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
  it('coerces an out-of-enum type to task (preserving original) instead of dropping', () => {
    const { items } = parseBacklogYaml(SAMPLE);
    const result = ingestBacklogItems(repos, items);

    // All three are created — T-2's bogus type 'nonsense' is coerced, not dropped.
    expect(result.created).toEqual(expect.arrayContaining(['T-1', 'T-2', 'T-3']));
    expect(result.skipped).toHaveLength(0);

    const t2 = repos.backlog.get('T-2');
    expect(t2!.type).toBe('task');
    expect(t2!.frontmatter.original_type).toBe('nonsense');
  });

  it('maps a domain-ish type by keyword (e.g. "tech-debt" → debt)', () => {
    const { items } = parseBacklogYaml(
      'items:\n  - id: D-1\n    type: tech-debt\n    title: cleanup\n',
    );
    ingestBacklogItems(repos, items);
    expect(repos.backlog.get('D-1')!.type).toBe('debt');
  });

  it('preserves agent-added fields (phase, references) into frontmatter', () => {
    const { items } = parseBacklogYaml(
      'items:\n  - id: P-1\n    type: task\n    title: t\n    phase: 1\n    references: [TRD §2.1]\n',
    );
    ingestBacklogItems(repos, items);
    const row = repos.backlog.get('P-1');
    expect(row!.frontmatter.phase).toBe(1);
    expect(row!.frontmatter.references).toEqual(['TRD §2.1']);
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

// The planning pipeline emits a real Epic → Version → Task hierarchy plus a
// per-item model. These must land in the dedicated columns (parent_id, version,
// model), NOT be dumped into frontmatter.
const HIERARCHY = `items:
  - id: AUTH-EPIC
    type: epic
    title: Authentication
    version: v0.1
    model: high-reasoning
  - id: AUTH-001
    type: task
    title: Login form
    parent_epic: AUTH-EPIC
    version: v0.1
    model: high-reasoning
    acceptance_criteria: [user can log in]
    review_gates: [security_control]
  - id: AUTH-002
    type: task
    title: Logout
    parent: AUTH-EPIC
    version: v0.2
    model: fast-reasoning
    cost_center: infra
`;

describe('ingestBacklogItems — epic/version/parent/model columns', () => {
  it('ingests an epic + child tasks into the right columns', () => {
    const { items, errors } = parseBacklogYaml(HIERARCHY);
    expect(errors).toHaveLength(0);
    const result = ingestBacklogItems(repos, items);
    expect(result.created).toEqual(
      expect.arrayContaining(['AUTH-EPIC', 'AUTH-001', 'AUTH-002']),
    );
    expect(result.skipped).toHaveLength(0);

    const epic = repos.backlog.get('AUTH-EPIC');
    expect(epic!.type).toBe('epic');
    expect(epic!.version).toBe('v0.1');
    expect(epic!.model).toBe('high-reasoning');
    expect(epic!.parent_id).toBeNull();

    const t1 = repos.backlog.get('AUTH-001');
    expect(t1!.parent_id).toBe('AUTH-EPIC'); // parent_epic → parent_id column
    expect(t1!.version).toBe('v0.1');
    expect(t1!.model).toBe('high-reasoning');

    const t2 = repos.backlog.get('AUTH-002');
    expect(t2!.parent_id).toBe('AUTH-EPIC'); // `parent` alias also works
    expect(t2!.version).toBe('v0.2');
    expect(t2!.model).toBe('fast-reasoning');
  });

  it('does NOT leak hierarchy/model fields into frontmatter, but keeps unknown ones', () => {
    const { items } = parseBacklogYaml(HIERARCHY);
    ingestBacklogItems(repos, items);

    const t2 = repos.backlog.get('AUTH-002');
    // mapped fields are columns, not frontmatter
    expect(t2!.frontmatter.version).toBeUndefined();
    expect(t2!.frontmatter.parent).toBeUndefined();
    expect(t2!.frontmatter.parent_epic).toBeUndefined();
    expect(t2!.frontmatter.model).toBeUndefined();
    // genuinely unknown field still preserved (no silent loss)
    expect(t2!.frontmatter.cost_center).toBe('infra');
  });

  it('links children even when the epic appears after them in the file', () => {
    // Child listed before its epic — epic-first ordering must still satisfy the FK.
    const reordered = `items:
  - id: X-001
    type: task
    title: Child first
    parent_epic: X-EPIC
  - id: X-EPIC
    type: epic
    title: Epic second
`;
    const { items } = parseBacklogYaml(reordered);
    const result = ingestBacklogItems(repos, items);
    expect(result.skipped).toHaveLength(0);
    expect(repos.backlog.get('X-001')!.parent_id).toBe('X-EPIC');
  });

  it('still surfaces a broken fenced block as an error (no silent loss)', () => {
    const mixed = [
      '# Backlog',
      '```yaml',
      '- id: OK-1',
      '  type: epic',
      '  title: Good epic',
      '  version: v1.0',
      '```',
      '```yaml',
      '- id: BAD-1',
      '   type: task', // bad indentation → block fails to parse
      ' title: broken',
      '```',
    ].join('\n');
    const result = parseBacklogYaml(mixed);
    expect(result.items.map((i) => i.id)).toEqual(['OK-1']);
    expect(result.errors.some((e) => /fenced block/i.test(e))).toBe(true);
    const ingested = ingestBacklogItems(repos, result.items);
    expect(ingested.created).toEqual(['OK-1']);
    expect(repos.backlog.get('OK-1')!.version).toBe('v1.0');
  });
});
