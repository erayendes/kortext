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

  it('re-ingest of identical items creates 0, updates existing (no skip), data unchanged', () => {
    const { items } = parseBacklogYaml(SAMPLE);

    // first call
    ingestBacklogItems(repos, items);
    const before = repos.backlog.get('T-1');

    // second call — same items: an upsert re-applies them as updates, never
    // silently dropping a later enrichment pass.
    const second = ingestBacklogItems(repos, items);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(0);
    expect(second.updated).toEqual(expect.arrayContaining(['T-1', 'T-3']));

    // Identical input → row content unchanged.
    const after = repos.backlog.get('T-1');
    expect(after!.review_gates).toEqual(before!.review_gates);
    expect(after!.frontmatter.priority).toBe('P0');
  });

  it('upserts: a later enrichment pass updates gates/version/model/parent on existing rows', () => {
    // The multi-step planning pipeline rewrites the WHOLE backlog.yaml each
    // enrichment step. The ingester must merge a later pass onto an existing
    // item instead of skipping it — otherwise security/version/model markings
    // (added after the EM's first skeleton write) never reach the DB.
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: AUTH-001\n    type: task\n    title: Login\n').items,
    );
    const skeleton = repos.backlog.get('AUTH-001')!;
    expect(skeleton.review_gates).toEqual([]);
    expect(skeleton.version).toBeNull();
    expect(skeleton.parent_id).toBeNull();

    const enriched = `items:
  - id: AUTH-EPIC
    type: epic
    title: Authentication
  - id: AUTH-001
    type: task
    title: Login
    parent_epic: AUTH-EPIC
    version: v0.1
    model: high-reasoning
    review_gates: [security_control]
    acceptance_criteria: [user can log in]
`;
    const result = ingestBacklogItems(repos, parseBacklogYaml(enriched).items);
    expect(result.created).toContain('AUTH-EPIC'); // brand-new epic
    expect(result.updated).toContain('AUTH-001'); // existing task enriched

    const row = repos.backlog.get('AUTH-001')!;
    expect(row.parent_id).toBe('AUTH-EPIC');
    expect(row.version).toBe('v0.1');
    expect(row.model).toBe('high-reasoning');
    expect(row.review_gates).toEqual(['security_control']);
    expect(row.frontmatter.acceptance_criteria).toEqual(['user can log in']);
  });

  it('upsert never downgrades engine-owned status (planning fields only)', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: W-1\n    type: task\n    title: Work\n').items,
    );
    // Engine moves the item forward, as the driver would.
    repos.backlog.transitionStatus('W-1', 'in_progress');

    // A re-ingest of the planning file must NOT reset it back to to_do.
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: W-1\n    type: task\n    title: Work\n    version: v0.1\n').items,
    );
    const row = repos.backlog.get('W-1')!;
    expect(row.status).toBe('in_progress'); // status untouched
    expect(row.version).toBe('v0.1'); // planning field still applied
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

  it('derives real epics from a flat `epic:` label when the agent omits epic items', () => {
    // What the live run actually produced: a flat list of tasks, each tagged
    // with a human-readable `epic:` LABEL (not a parent_epic id), and NO
    // `type: epic` container items at all. Result on the Board: the epic column
    // was empty. The ingester should synthesize one epic per distinct label and
    // link the labelled tasks to it so the hierarchy column is populated.
    const FLAT = `items:
  - id: INFRA-001
    type: task
    title: Setup CI
    epic: Infrastructure
  - id: INFRA-002
    type: task
    title: Dockerize
    epic: Infrastructure
  - id: AUTH-001
    type: task
    title: Login
    epic: Authentication
`;
    const { items, errors } = parseBacklogYaml(FLAT);
    expect(errors).toHaveLength(0);
    const result = ingestBacklogItems(repos, items);

    // The three tasks plus two synthesized epics are created.
    expect(result.created).toEqual(
      expect.arrayContaining(['INFRA-001', 'INFRA-002', 'AUTH-001']),
    );
    expect(result.skipped).toHaveLength(0);

    // Both INFRA tasks point at the SAME synthesized epic, titled by the label.
    const i1 = repos.backlog.get('INFRA-001')!;
    const i2 = repos.backlog.get('INFRA-002')!;
    expect(i1.parent_id).not.toBeNull();
    expect(i1.parent_id).toBe(i2.parent_id);
    const infraEpic = repos.backlog.get(i1.parent_id!)!;
    expect(infraEpic.type).toBe('epic');
    expect(infraEpic.title).toBe('Infrastructure');

    // The AUTH task points at a different epic.
    const a1 = repos.backlog.get('AUTH-001')!;
    expect(a1.parent_id).not.toBe(i1.parent_id);
    expect(repos.backlog.get(a1.parent_id!)!.title).toBe('Authentication');

    // The label is consumed structurally — it does not also leak to frontmatter.
    expect(i1.frontmatter.epic).toBeUndefined();
  });

  it('does NOT synthesize an epic when an explicit parent_epic id is given', () => {
    // Regression guard: the proper shape (parent_epic id + a real epic item)
    // must not trigger label-derivation. Here the label and the id coexist;
    // the explicit id wins and no extra epic is invented.
    const PROPER = `items:
  - id: AUTH-EPIC
    type: epic
    title: Authentication
  - id: AUTH-001
    type: task
    title: Login
    parent_epic: AUTH-EPIC
    epic: Authentication
`;
    const { items } = parseBacklogYaml(PROPER);
    const result = ingestBacklogItems(repos, items);
    // Exactly two rows — no synthesized third epic.
    expect(result.created.sort()).toEqual(['AUTH-001', 'AUTH-EPIC']);
    expect(repos.backlog.get('AUTH-001')!.parent_id).toBe('AUTH-EPIC');
  });

  it('is idempotent across runs when epics are synthesized from labels', () => {
    const FLAT = `items:
  - id: INFRA-001
    type: task
    title: Setup CI
    epic: Infrastructure
`;
    const { items } = parseBacklogYaml(FLAT);
    ingestBacklogItems(repos, items);
    const second = ingestBacklogItems(repos, items);
    // Stable synthetic epic id → second run re-creates nothing.
    expect(second.created).toHaveLength(0);
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
