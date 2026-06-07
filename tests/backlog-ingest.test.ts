import { describe, expect, it, beforeEach } from 'vitest';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  parseBacklogYaml,
  ingestBacklogItems,
  deriveSyntheticEpics,
  enforceSymmetricDeps,
  patchBacklogItems,
  serializeBacklogToYaml,
} from '../server/engine/backlog-ingest.ts';

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

  it('accepts `depends_on` as an alias for `blocked_by` (live-run calibration)', () => {
    // Real planning agents reach for `depends_on` instead of `blocked_by`.
    const yaml = [
      'items:',
      '  - id: A-1',
      '    title: root',
      '    type: task',
      '  - id: A-2',
      '    title: dependent',
      '    type: task',
      '    depends_on: [A-1]',
    ].join('\n');
    const result = parseBacklogYaml(yaml);
    expect(result.errors).toHaveLength(0);
    const a2 = result.items.find((i) => i.id === 'A-2')!;
    expect(a2.blocked_by).toEqual(['A-1']);
    // Explicit blocked_by wins over depends_on when both are present.
    const both = parseBacklogYaml(
      'items:\n  - id: B-1\n    title: t\n    type: task\n    blocked_by: [X]\n    depends_on: [Y]',
    );
    expect(both.items[0]!.blocked_by).toEqual(['X']);
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

// A full backlog can run to ~100 items; making each enrichment persona rewrite
// the whole file is pathologically slow (the agent re-emits ~80 KB per step).
// Patches let a step write ONLY the items+fields it changed; the ingester merges
// them field-by-field onto the existing rows.
describe('patch mode (delta enrichment)', () => {
  it('parses patch items needing only an id (no type/title required)', () => {
    const { items, errors } = parseBacklogYaml(
      'items:\n  - id: T-1\n    review_gates: [security_control]\n',
      { mode: 'patch' },
    );
    expect(errors).toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('T-1');
    expect(items[0]!.review_gates).toEqual(['security_control']);
  });

  it('full mode still rejects an item with only an id (no regression)', () => {
    const { items, errors } = parseBacklogYaml('items:\n  - id: T-1\n');
    expect(items).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('unions a gate onto an existing item without clobbering other fields', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: T-1\n    type: task\n    title: X\n    review_gates: [code_review]\n    version: v0.1\n',
      ).items,
    );
    const { items } = parseBacklogYaml(
      'items:\n  - id: T-1\n    review_gates: [security_control]\n',
      { mode: 'patch' },
    );
    const res = patchBacklogItems(repos, items);
    expect(res.updated).toContain('T-1');
    const row = repos.backlog.get('T-1')!;
    expect([...row.review_gates].sort()).toEqual(['code_review', 'security_control']); // union
    expect(row.version).toBe('v0.1'); // untouched
    expect(row.type).toBe('task'); // untouched
  });

  it('sets version via patch without wiping gates/model', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: T-2\n    type: task\n    title: Y\n    review_gates: [code_review]\n    model: high-reasoning\n',
      ).items,
    );
    patchBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: T-2\n    version: v1.0\n', { mode: 'patch' }).items,
    );
    const row = repos.backlog.get('T-2')!;
    expect(row.version).toBe('v1.0');
    expect(row.review_gates).toEqual(['code_review']); // preserved
    expect(row.model).toBe('high-reasoning'); // preserved
  });

  it('skips a patch for an unknown id (patches only update, never create)', () => {
    const res = patchBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOPE\n    version: v1.0\n', { mode: 'patch' }).items,
    );
    expect(res.updated).toHaveLength(0);
    expect(res.skipped.find((s) => s.id === 'NOPE')).toBeTruthy();
    expect(repos.backlog.get('NOPE')).toBeNull();
  });

  it('merges patch frontmatter keys (acceptance_criteria) onto existing', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: T-3\n    type: task\n    title: Z\n    priority: P0\n').items,
    );
    patchBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: T-3\n    acceptance_criteria: [works]\n', { mode: 'patch' })
        .items,
    );
    const row = repos.backlog.get('T-3')!;
    expect(row.frontmatter.acceptance_criteria).toEqual(['works']);
    expect(row.frontmatter.priority).toBe('P0'); // preserved
  });
});

// After a patch updates the DB, the engine re-serializes backlog.yaml from the
// DB so the NEXT persona reads the current, fully-enriched state — not the stale
// step-1 skeleton. The serializer must round-trip every column the pipeline sets.
describe('serializeBacklogToYaml', () => {
  it('round-trips epic + enriched task back into parseable YAML', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: AUTH-EPIC\n    type: epic\n    title: Auth\n  - id: AUTH-001\n    type: task\n    title: Login\n    parent_epic: AUTH-EPIC\n',
      ).items,
    );
    // enrich via patches like the real pipeline
    patchBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: AUTH-001\n    review_gates: [security_control]\n    version: v0.1\n    model: high-reasoning\n    acceptance_criteria: [user logs in]\n',
        { mode: 'patch' },
      ).items,
    );

    const yamlText = serializeBacklogToYaml(repos);
    // It must be valid, parseable backlog YAML (no prose/fences).
    const reparsed = parseBacklogYaml(yamlText);
    expect(reparsed.errors).toHaveLength(0);

    // Re-ingest into a clean DB → every field survived the round-trip.
    const repos2 = openDb({ path: ':memory:' }).repositories;
    ingestBacklogItems(repos2, reparsed.items);
    const t = repos2.backlog.get('AUTH-001')!;
    expect(t.type).toBe('task');
    expect(t.title).toBe('Login');
    expect(t.parent_id).toBe('AUTH-EPIC');
    expect(t.version).toBe('v0.1');
    expect(t.model).toBe('high-reasoning');
    expect(t.review_gates).toEqual(['security_control']);
    expect(t.frontmatter.acceptance_criteria).toEqual(['user logs in']);
    expect(repos2.backlog.get('AUTH-EPIC')!.type).toBe('epic');
  });

  it('produces pure YAML (a top-level items array, no markdown)', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: X-1\n    type: task\n    title: T\n').items,
    );
    const yamlText = serializeBacklogToYaml(repos);
    expect(yamlText.trimStart().startsWith('items:')).toBe(true);
    expect(yamlText).not.toContain('```');
  });
});

// ---------------------------------------------------------------------------
// A1 — Coded epic ids (<CODE>-E0N)
// ---------------------------------------------------------------------------

describe('A1: deriveSyntheticEpics — coded epic ids', () => {
  it('uses TF-E01 when code="TF" and a single epic label is present', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    epic: Auth
`);
    const result = deriveSyntheticEpics(items, 'TF');
    const epic = result.find((i) => i.type === 'epic');
    expect(epic).toBeDefined();
    expect(epic!.id).toBe('TF-E01');
    const child = result.find((i) => i.id === 'TF-001');
    expect(child!.parent_id).toBe('TF-E01');
  });

  it('assigns TF-E01 and TF-E02 for two distinct labels in stable (insertion) order', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    epic: Auth
  - id: TF-002
    type: task
    title: Task Two
    epic: Infrastructure
`);
    const result = deriveSyntheticEpics(items, 'TF');
    const epics = result.filter((i) => i.type === 'epic');
    expect(epics).toHaveLength(2);
    expect(epics[0]!.id).toBe('TF-E01');
    expect(epics[1]!.id).toBe('TF-E02');
    // Children correctly linked
    const child1 = result.find((i) => i.id === 'TF-001');
    const child2 = result.find((i) => i.id === 'TF-002');
    expect(child1!.parent_id).toBe('TF-E01');
    expect(child2!.parent_id).toBe('TF-E02');
  });

  it('is idempotent: re-running deriveSyntheticEpics on same input yields same ids', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    epic: Auth
`);
    const first = deriveSyntheticEpics(items, 'TF');
    const epicId = first.find((i) => i.type === 'epic')!.id;
    // Run again on original input
    const second = deriveSyntheticEpics(items, 'TF');
    expect(second.find((i) => i.type === 'epic')!.id).toBe(epicId);
  });

  it('falls back to epic-${slug} when code is absent', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    epic: Auth
`);
    const result = deriveSyntheticEpics(items);
    const epic = result.find((i) => i.type === 'epic');
    expect(epic!.id).toBe('epic-auth');
    expect(result.find((i) => i.id === 'TF-001')!.parent_id).toBe('epic-auth');
  });

  it('ingestBacklogItems passes code through and creates coded epic rows', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    epic: Auth
  - id: TF-002
    type: task
    title: Task Two
    epic: Auth
`);
    const result = ingestBacklogItems(repos, items, { code: 'TF' });
    expect(result.created).toContain('TF-E01');
    const epic = repos.backlog.get('TF-E01')!;
    expect(epic.type).toBe('epic');
    expect(repos.backlog.get('TF-001')!.parent_id).toBe('TF-E01');
    expect(repos.backlog.get('TF-002')!.parent_id).toBe('TF-E01');
  });

  it('re-ingest with same code is idempotent (no new epics created)', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    epic: Auth
`);
    ingestBacklogItems(repos, items, { code: 'TF' });
    const second = ingestBacklogItems(repos, items, { code: 'TF' });
    expect(second.created).toHaveLength(0);
    expect(second.updated).toContain('TF-E01');
  });
});

// ---------------------------------------------------------------------------
// A3 — Symmetric dependency enforcement
// ---------------------------------------------------------------------------

describe('A3: enforceSymmetricDeps — symmetric dependency enforcement', () => {
  it('adds blocked_by to TF-002 when TF-001 blocks:[TF-002] and TF-002 has no blocked_by', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    blocks: [TF-002]
  - id: TF-002
    type: task
    title: Task Two
`);
    const result = enforceSymmetricDeps(items);
    const tf002 = result.find((i) => i.id === 'TF-002')!;
    expect(tf002.blocked_by).toContain('TF-001');
  });

  it('does not duplicate entries when input is already symmetric', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    blocks: [TF-002]
  - id: TF-002
    type: task
    title: Task Two
    blocked_by: [TF-001]
`);
    const result = enforceSymmetricDeps(items);
    const tf002 = result.find((i) => i.id === 'TF-002')!;
    expect(tf002.blocked_by!.filter((id) => id === 'TF-001')).toHaveLength(1);
  });

  it('adds blocks to TF-001 when TF-002 blocked_by:[TF-001] and TF-001 has no blocks', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
  - id: TF-002
    type: task
    title: Task Two
    blocked_by: [TF-001]
`);
    const result = enforceSymmetricDeps(items);
    const tf001 = result.find((i) => i.id === 'TF-001')!;
    expect(tf001.blocks).toContain('TF-002');
  });

  it('ingestBacklogItems stores symmetric deps in frontmatter', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    blocks: [TF-002]
  - id: TF-002
    type: task
    title: Task Two
`);
    ingestBacklogItems(repos, items);
    const tf002 = repos.backlog.get('TF-002')!;
    expect(tf002.frontmatter.blocked_by).toContain('TF-001');
  });
});

// ---------------------------------------------------------------------------
// A4 — Dangling-reference warning (warn-only, no mutation)
// ---------------------------------------------------------------------------

describe('A4: dangling-reference audit log warnings', () => {
  it('writes an audit_log warning when blocked_by references a non-existent id', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    blocked_by: [TF-999]
`);
    ingestBacklogItems(repos, items);
    const logs = repos.auditLog.list({ action: 'backlog.ingest.dangling_ref' });
    expect(logs.length).toBeGreaterThan(0);
    const entry = logs.find(
      (l) =>
        (typeof l.payload['ref_id'] === 'string' && l.payload['ref_id'].includes('TF-999')) ||
        (typeof l.payload['message'] === 'string' && l.payload['message'].includes('TF-999')) ||
        l.resource_id === 'TF-999' ||
        (typeof l.payload['dangling'] === 'string' && l.payload['dangling'].includes('TF-999'))
    );
    expect(entry).toBeDefined();
  });

  it('does NOT mutate the item — the dangling ref stays in frontmatter', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    blocked_by: [TF-999]
`);
    ingestBacklogItems(repos, items);
    const row = repos.backlog.get('TF-001')!;
    expect(row.frontmatter.blocked_by).toContain('TF-999');
  });

  it('also warns for dangling blocks references', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    blocks: [TF-888]
`);
    ingestBacklogItems(repos, items);
    const logs = repos.auditLog.list({ action: 'backlog.ingest.dangling_ref' });
    const entry = logs.find(
      (l) =>
        (typeof l.payload['ref_id'] === 'string' && l.payload['ref_id'].includes('TF-888')) ||
        (typeof l.payload['message'] === 'string' && l.payload['message'].includes('TF-888')) ||
        l.resource_id === 'TF-888' ||
        (typeof l.payload['dangling'] === 'string' && l.payload['dangling'].includes('TF-888'))
    );
    expect(entry).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// A5 — Auto-block on ingest
// ---------------------------------------------------------------------------

describe('A5: auto-block on ingest', () => {
  it('TF-002 blocked_by:[TF-001] (TF-001 is to_do) → TF-002 becomes blocked', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
  - id: TF-002
    type: task
    title: Task Two
    blocked_by: [TF-001]
`);
    ingestBacklogItems(repos, items);

    expect(repos.backlog.get('TF-001')!.status).toBe('to_do');
    expect(repos.backlog.get('TF-002')!.status).toBe('blocked');

    // Audit log entry written
    const logs = repos.auditLog.list({ action: 'backlog.auto_blocked' });
    expect(logs.length).toBeGreaterThan(0);
    const entry = logs.find((l) => l.resource_id === 'TF-002');
    expect(entry).toBeDefined();
    expect((entry!.payload['blockedBy'] as string[])).toContain('TF-001');
  });

  it('item with all-terminal deps (done blocker) → stays to_do', () => {
    // Ingest TF-001 first and mark it done via direct write
    ingestBacklogItems(
      repos,
      parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
`).items,
    );
    repos.backlog.transitionStatus('TF-001', 'done');

    // Now ingest TF-002 blocked_by TF-001 (which is done → terminal)
    ingestBacklogItems(
      repos,
      parseBacklogYaml(`items:
  - id: TF-002
    type: task
    title: Task Two
    blocked_by: [TF-001]
`).items,
    );

    expect(repos.backlog.get('TF-002')!.status).toBe('to_do');
  });

  it('dangling blocker (dep not in DB) treated as terminal → item stays to_do', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-002
    type: task
    title: Task Two
    blocked_by: [TF-GHOST]
`);
    ingestBacklogItems(repos, items);
    // TF-GHOST doesn't exist → treated as terminal → TF-002 not blocked
    expect(repos.backlog.get('TF-002')!.status).toBe('to_do');
  });

  it('epic is never auto-blocked even with an unresolved blocked_by', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
  - id: TF-E01
    type: epic
    title: My Epic
    blocked_by: [TF-001]
`);
    ingestBacklogItems(repos, items);
    // TF-001 is to_do (non-terminal), but TF-E01 is epic → must NOT be blocked
    expect(repos.backlog.get('TF-E01')!.status).toBe('to_do');
  });

  it('same-batch blocker: TF-001 blocks TF-002, both ingested together', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    blocks: [TF-002]
  - id: TF-002
    type: task
    title: Task Two
`);
    // enforceSymmetricDeps will add blocked_by:[TF-001] to TF-002
    ingestBacklogItems(repos, items);
    expect(repos.backlog.get('TF-002')!.status).toBe('blocked');
  });
});
