import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  parseBacklogYaml,
  ingestBacklogItems,
  deriveSyntheticEpics,
  enforceSymmetricDeps,
  patchBacklogItems,
  synthesizeMissingEpics,
  ensureBacklogStructure,
  serializeBacklogToYaml,
  ingestBacklogFile,
  ingestBacklogPatchFile,
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
// A5 — Dependency lock is DERIVED, never a status (UAT #10)
// ---------------------------------------------------------------------------
// `blocked` is no longer a status. An item with an unresolved `blocked_by`
// dependency STAYS in `to_do` (a never-started item) — the lock is a derived
// flag (build-order.ts `isBlocked`) the board overlays as 🔒, not a column the
// item moves into. Ingest must therefore never change status on dependency.

describe('A5: dependency lock is derived (no `blocked` status)', () => {
  it('TF-002 blocked_by:[TF-001] (TF-001 is to_do) → TF-002 STAYS to_do', () => {
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
    // Locked, but the status is untouched — it waits in To Do.
    expect(repos.backlog.get('TF-002')!.status).toBe('to_do');

    // The defunct auto-block audit action is never emitted.
    const logs = repos.auditLog.list({ action: 'backlog.auto_blocked' });
    expect(logs.length).toBe(0);
  });

  it('item with all-terminal deps (done blocker) → stays to_do', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
`).items,
    );
    repos.backlog.transitionStatus('TF-001', 'done');

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

  it('dangling blocker (dep not in DB) → item stays to_do', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-002
    type: task
    title: Task Two
    blocked_by: [TF-GHOST]
`);
    ingestBacklogItems(repos, items);
    expect(repos.backlog.get('TF-002')!.status).toBe('to_do');
  });

  it('epic with an unresolved blocked_by also stays to_do', () => {
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
    expect(repos.backlog.get('TF-E01')!.status).toBe('to_do');
  });

  it('same-batch blocker: TF-001 blocks TF-002 → TF-002 stays to_do', () => {
    const { items } = parseBacklogYaml(`items:
  - id: TF-001
    type: task
    title: Task One
    blocks: [TF-002]
  - id: TF-002
    type: task
    title: Task Two
`);
    // enforceSymmetricDeps adds blocked_by:[TF-001] to TF-002, but no status change.
    ingestBacklogItems(repos, items);
    expect(repos.backlog.get('TF-002')!.status).toBe('to_do');
  });
});

// ---------------------------------------------------------------------------
// Critical-#1 (UAT 2026-06-08): planning enrichment silently lost
// ---------------------------------------------------------------------------

// A — the agent wrote a patch under a non-`items` top-level key
// (`dependency_patches:`) → parser said "no items array found" → the whole
// patch (and all enrichment) was dropped. The parser must accept the first
// top-level array of id-bearing objects regardless of the key name.
describe('Critical-#1 A: generic top-level array key (LLM uses a non-`items` key)', () => {
  it('accepts a top-level array of id-bearing objects under any key (dependency_patches)', () => {
    const { items, errors } = parseBacklogYaml(
      'dependency_patches:\n  - id: NOT-001\n    blocked_by: [NOT-002]\n  - id: NOT-002\n    blocks: [NOT-001]\n',
      { mode: 'patch' },
    );
    expect(errors).toHaveLength(0);
    expect(items.map((i) => i.id).sort()).toEqual(['NOT-001', 'NOT-002']);
    expect(items.find((i) => i.id === 'NOT-001')!.blocked_by).toEqual(['NOT-002']);
  });

  it('still prefers a canonical `items:` array when another array key is also present', () => {
    const { items } = parseBacklogYaml(
      'items:\n  - id: REAL-1\n    review_gates: [code_review]\nextra_patches:\n  - id: DECOY-1\n',
      { mode: 'patch' },
    );
    expect(items.map((i) => i.id)).toEqual(['REAL-1']);
  });

  it('does NOT grab a non-item array (plain strings, no id field)', () => {
    const { items, errors } = parseBacklogYaml('versions:\n  - v0.1\n  - v0.2\n', { mode: 'patch' });
    expect(items).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// B — workflow tells the planning agent to write `assignee`, but the column is
// `owner`. The alias must reach the owner column so the SQL-backed assignee
// filter/aggregate works — without ever nulling an owner the engine already set.
describe('Critical-#1 B: assignee→owner alias persists to the owner column', () => {
  it('writes `assignee` to the owner column on full ingest', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: NOT-001\n    type: task\n    title: X\n    assignee: +backend-developer\n',
      ).items,
    );
    expect(repos.backlog.get('NOT-001')!.owner).toBe('+backend-developer');
  });

  it('accepts the `owner` key directly too', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-002\n    type: task\n    title: Y\n    owner: +prime\n').items,
    );
    expect(repos.backlog.get('NOT-002')!.owner).toBe('+prime');
  });

  it('sets owner via a later enrichment patch (the real pipeline shape)', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-003\n    type: task\n    title: Z\n').items,
    );
    expect(repos.backlog.get('NOT-003')!.owner).toBeNull();
    patchBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-003\n    assignee: +frontend-developer\n', {
        mode: 'patch',
      }).items,
    );
    expect(repos.backlog.get('NOT-003')!.owner).toBe('+frontend-developer');
  });

  it('a step-1 re-ingest with no assignee does NOT null an owner already set', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-004\n    type: task\n    title: A\n').items,
    );
    patchBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-004\n    assignee: +qa-engineer\n', { mode: 'patch' })
        .items,
    );
    // step-1 rewrites the whole backlog.yaml (no assignee yet) → upsert update
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-004\n    type: task\n    title: A\n').items,
    );
    expect(repos.backlog.get('NOT-004')!.owner).toBe('+qa-engineer'); // preserved
  });
});

// B (UAT #5 regression) — the antigravity run wrote a correct enrichment patch
// (`items:` carrying parent_epic + version + assignee + model + blocks) but the
// summary showed `updated: 0` and owner stayed empty. Pin the full chain: one
// realistic patch must update the row AND land the assignee in the owner column.
describe('Critical-#1 B (UAT #5): a full enrichment patch persists owner + updates', () => {
  it('updates the row and writes assignee→owner from a realistic patch', () => {
    // step-1 skeleton: epic + a bare task.
    ingestBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: NOT-E01\n    type: epic\n    title: Altyapı\n  - id: NOT-005\n    type: task\n    title: Veritabanı şeması\n',
      ).items,
    );
    expect(repos.backlog.get('NOT-005')!.owner).toBeNull();

    // enrichment patch (the exact shape the antigravity agent produced).
    const { items, errors } = parseBacklogYaml(
      'items:\n' +
        '  - id: NOT-005\n' +
        '    parent_epic: NOT-E01\n' +
        '    version: v0.1\n' +
        '    assignee: +backend-developer\n' +
        '    model: high-reasoning\n' +
        '    blocks: []\n' +
        '    blocked_by: []\n',
      { mode: 'patch' },
    );
    expect(errors).toHaveLength(0);
    const res = patchBacklogItems(repos, items);

    expect(res.updated).toContain('NOT-005'); // NOT updated:0
    const row = repos.backlog.get('NOT-005')!;
    expect(row.owner).toBe('+backend-developer'); // assignee→owner persisted
    expect(row.parent_id).toBe('NOT-E01');
    expect(row.version).toBe('v0.1');
    expect(row.model).toBe('high-reasoning');
  });
});

// UAT #5 (real antigravity run): step-1 created only tasks (0 epics), and the
// agent defined the epic containers in a LATER enrichment patch. patchBacklogItems
// only UPDATED existing rows → the epics were skipped, so every task's
// `parent_epic: NOT-E01` hit a FOREIGN KEY violation → owner/version/parent_id
// for ALL tasks were silently dropped. A patch that carries a full epic
// definition must CREATE it (epics first) so the tasks that reference it link.
describe('Critical-#1 (UAT #5): patch creates missing epic containers (FK cascade fix)', () => {
  it('creates a type:epic entry referenced by a task delta, then links + enriches', () => {
    // The antigravity reality: step-1 made tasks only, no epic rows.
    ingestBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: NOT-001\n    type: task\n    title: Setup\n  - id: NOT-002\n    type: task\n    title: API\n',
      ).items,
    );
    // Consolidation patch: defines the epics AND links/enriches the tasks.
    const patch =
      'items:\n' +
      '  - id: NOT-E01\n    type: epic\n    title: Altyapı\n    version: v0.1\n' +
      '  - id: NOT-001\n    parent_epic: NOT-E01\n    version: v0.1\n    assignee: +backend-developer\n' +
      '  - id: NOT-002\n    parent_epic: NOT-E01\n    version: v0.2\n    assignee: +frontend-developer\n';
    const res = patchBacklogItems(repos, parseBacklogYaml(patch, { mode: 'patch' }).items);

    // The epic must exist now (created from the patch).
    expect(repos.backlog.get('NOT-E01')?.type).toBe('epic');
    // No FK failures — the tasks linked successfully.
    expect(res.skipped.filter((s) => /FOREIGN KEY/.test(s.reason))).toHaveLength(0);
    expect(res.updated).toContain('NOT-001');

    const t1 = repos.backlog.get('NOT-001')!;
    expect(t1.parent_id).toBe('NOT-E01'); // linked
    expect(t1.version).toBe('v0.1');
    expect(t1.owner).toBe('+backend-developer');
  });
});

// UAT #10 (real Claude run): the agent skipped the epic container ENTIRELY and
// wrote a BARE `parent_epic: NOT-E01` reference on every task — no `type:epic`
// item defined anywhere. The #6 pre-pass only created epics that the patch
// declares as `type:epic` items, so the bare reference had no FK target → all 14
// tasks hit `FOREIGN KEY constraint failed` → owner/version/parent_id ALL
// dropped atomically. Fix: synthesize the epic from the bare reference too, and
// never let one bad FK drop the rest of an item's enrichment.
describe('Critical (UAT #10): bare parent_epic ref auto-creates the epic + field-level FK resilience', () => {
  it('creates an epic for a bare parent_epic reference defined nowhere', () => {
    // step-1: tasks only, NO epic, NO type:epic item anywhere.
    ingestBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: NOT-001\n    type: task\n    title: A\n  - id: NOT-002\n    type: task\n    title: B\n',
      ).items,
    );
    // enrichment patch: BARE parent_epic ref (no type:epic NOT-E01) + version + assignee + model.
    const patch =
      'items:\n' +
      '  - id: NOT-001\n    parent_epic: NOT-E01\n    version: v0.1\n    assignee: +backend-developer\n    model: high-reasoning\n' +
      '  - id: NOT-002\n    parent_epic: NOT-E01\n    version: v0.2\n    assignee: +frontend-developer\n    model: fast-reasoning\n';
    const res = patchBacklogItems(repos, parseBacklogYaml(patch, { mode: 'patch' }).items);

    // The epic is synthesized from the bare reference.
    expect(repos.backlog.get('NOT-E01')?.type).toBe('epic');
    // NO FK failures → nothing dropped.
    expect(res.skipped.filter((s) => /FOREIGN KEY/.test(s.reason))).toHaveLength(0);

    const t1 = repos.backlog.get('NOT-001')!;
    expect(t1.parent_id).toBe('NOT-E01'); // linked
    expect(t1.version).toBe('v0.1');
    expect(t1.owner).toBe('+backend-developer');
    expect(t1.model).toBe('high-reasoning');
    const t2 = repos.backlog.get('NOT-002')!;
    expect(t2.parent_id).toBe('NOT-E01');
    expect(t2.version).toBe('v0.2');
    expect(t2.owner).toBe('+frontend-developer');
  });

  it('does NOT re-create an epic that already exists in the backlog', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml(
        'items:\n  - id: NOT-E01\n    type: epic\n    title: Real Epic\n  - id: NOT-001\n    type: task\n    title: A\n',
      ).items,
    );
    patchBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-001\n    parent_epic: NOT-E01\n    version: v0.1\n', {
        mode: 'patch',
      }).items,
    );
    expect(repos.backlog.get('NOT-E01')!.title).toBe('Real Epic'); // untouched, not clobbered
    expect(repos.backlog.get('NOT-001')!.parent_id).toBe('NOT-E01');
  });
});

// ---------------------------------------------------------------------------
// KRİTİK UAT #10h — BASE full-mode ingest must auto-create missing epics too.
// Live UAT (antigravity→codex→claude): the agent wrote 8 tasks with a BARE
// `parent_epic: <id>` and NO type:epic container, sent through full-mode
// ingestBacklog (backlog-tanm.1, NOT a patch) → every task hit FOREIGN KEY
// constraint failed → created 0 → backlog DB empty. The #10 epic-auto-create
// pre-pass only ran in patchBacklogItems; full-mode never synthesized the epic.
// ---------------------------------------------------------------------------

describe('synthesizeMissingEpics (shared base/patch pre-pass)', () => {
  it('creates a placeholder epic for a bare parent_id defined nowhere', () => {
    const { items } = parseBacklogYaml(
      'items:\n  - id: T-1\n    type: task\n    title: A\n    parent_epic: GHOST-E01\n',
    );
    const res = synthesizeMissingEpics(repos, items);
    expect(res.created).toEqual(['GHOST-E01']);
    expect(repos.backlog.get('GHOST-E01')?.type).toBe('epic');
  });

  it('does NOT synthesize when the parent is a type:epic item in the same batch', () => {
    const { items } = parseBacklogYaml(
      'items:\n  - id: E01\n    type: epic\n    title: Real\n  - id: T-1\n    type: task\n    title: A\n    parent_epic: E01\n',
    );
    const res = synthesizeMissingEpics(repos, items);
    expect(res.created).toEqual([]); // the real epic will be created by the insert loop
    expect(repos.backlog.get('E01')).toBeNull(); // pre-pass did not pre-empt it
  });

  it('does NOT synthesize when the parent already exists in the DB', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: E01\n    type: epic\n    title: Real\n').items,
    );
    const { items } = parseBacklogYaml(
      'items:\n  - id: T-1\n    type: task\n    title: A\n    parent_epic: E01\n',
    );
    const res = synthesizeMissingEpics(repos, items);
    expect(res.created).toEqual([]);
    expect(repos.backlog.get('E01')!.title).toBe('Real'); // untouched
  });
});

describe('KRİTİK UAT #10h: base full-mode ingest auto-creates the missing epic', () => {
  it('creates a synthesized epic for bare parent_epic refs → backlog NOT empty', () => {
    // The exact live shape: tasks only, bare parent_epic, NO type:epic container.
    const yaml =
      'items:\n' +
      '  - id: NOT-001\n    type: task\n    title: A\n    parent_epic: NOT-E01\n    version: v0.1\n    assignee: +backend-developer\n    model: high\n' +
      '  - id: NOT-002\n    type: task\n    title: B\n    parent_epic: NOT-E01\n    version: v0.1\n    assignee: +frontend-developer\n';
    const res = ingestBacklogItems(repos, parseBacklogYaml(yaml).items);

    // The epic is synthesized; both tasks land WITHOUT a FK failure.
    expect(repos.backlog.get('NOT-E01')?.type).toBe('epic');
    expect(res.skipped.filter((s) => /FOREIGN KEY/.test(s.reason))).toHaveLength(0);
    expect(res.created).toEqual(expect.arrayContaining(['NOT-E01', 'NOT-001', 'NOT-002']));

    const t1 = repos.backlog.get('NOT-001')!;
    expect(t1.parent_id).toBe('NOT-E01'); // linked, not dropped
    expect(t1.version).toBe('v0.1');
    expect(t1.owner).toBe('+backend-developer');
    expect(t1.model).toBe('high');
    // Backlog is NOT empty — the whole point of the fix.
    expect(repos.backlog.list({ limit: 100 }).length).toBeGreaterThan(0);
  });

  it('uses the real epic when a type:epic container IS present (no duplicate synth)', () => {
    const yaml =
      'items:\n' +
      '  - id: NOT-E01\n    type: epic\n    title: Real Epic\n' +
      '  - id: NOT-001\n    type: task\n    title: A\n    parent_epic: NOT-E01\n';
    ingestBacklogItems(repos, parseBacklogYaml(yaml).items);
    expect(repos.backlog.get('NOT-E01')!.title).toBe('Real Epic'); // not a placeholder
    expect(repos.backlog.get('NOT-001')!.parent_id).toBe('NOT-E01');
  });

  it('never drops a child when its epic container is unwritable — links to a synthesized epic', () => {
    // A type:epic container with NO title is dropped at parse; the child must
    // NOT be lost. Synthesis re-creates the epic from the bare reference so the
    // child lands linked (backlog NEVER empty), no FK failure.
    const yaml =
      'items:\n' +
      '  - id: BROKE-E01\n    type: epic\n' + // no title → dropped at parse
      '  - id: BROKE-001\n    type: task\n    title: Orphan\n    parent_epic: BROKE-E01\n    version: v0.2\n';
    const res = ingestBacklogItems(repos, parseBacklogYaml(yaml).items);

    const child = repos.backlog.get('BROKE-001');
    expect(child).not.toBeNull(); // NOT dropped
    expect(child!.version).toBe('v0.2'); // enrichment kept
    expect(child!.parent_id).toBe('BROKE-E01'); // linked to the synthesized epic
    expect(repos.backlog.get('BROKE-E01')?.type).toBe('epic'); // placeholder epic exists
    expect(res.skipped.filter((s) => /FOREIGN KEY/.test(s.reason))).toHaveLength(0);
  });
});

// C — acceptance_criteria has an existing home (frontmatter, rendered by
// acChecklist). The only reason it vanished in UAT was that the patch under a
// non-`items` key never parsed (A). With A fixed, AC delivered via any top-key
// must land in frontmatter.
describe('Critical-#1 C: acceptance_criteria survives a generic top-key patch', () => {
  it('lands AC in frontmatter when delivered under a non-`items` key', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-010\n    type: task\n    title: X\n').items,
    );
    const { items } = parseBacklogYaml(
      'acceptance_patches:\n  - id: NOT-010\n    acceptance_criteria: ["kullanici giris yapar", "hatali sifre reddedilir"]\n',
      { mode: 'patch' },
    );
    patchBacklogItems(repos, items);
    expect(repos.backlog.get('NOT-010')!.frontmatter.acceptance_criteria).toEqual([
      'kullanici giris yapar',
      'hatali sifre reddedilir',
    ]);
  });
});

// D — a patch that yields zero updates because of parse errors used to be
// swallowed (only a low-signal `…summary parse_errors:1`). A total drop must
// emit a loud, distinct audit event so the dashboard surfaces it.
describe('Critical-#1 D: a totally-dropped patch emits a distinct, visible audit event', () => {
  it('emits backlog.patch.dropped when parse errors yield zero updates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kx-patch-'));
    const file = join(dir, 'backlog.patch.yaml');
    // No id-bearing array anywhere → 0 updates + a parse error.
    writeFileSync(file, 'note: this is not a backlog patch\nmeta:\n  foo: bar\n', 'utf8');
    try {
      const res = ingestBacklogPatchFile(repos, file);
      expect(res.parseErrors.length).toBeGreaterThan(0);
      expect(res.updated).toHaveLength(0);
      const dropped = repos.auditLog.list({ action: 'backlog.patch.dropped' });
      expect(dropped.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT emit the dropped event when the patch applies cleanly', () => {
    ingestBacklogItems(
      repos,
      parseBacklogYaml('items:\n  - id: NOT-020\n    type: task\n    title: X\n').items,
    );
    const dir = mkdtempSync(join(tmpdir(), 'kx-patch-'));
    const file = join(dir, 'backlog.patch.yaml');
    writeFileSync(file, 'dependency_patches:\n  - id: NOT-020\n    version: v0.1\n', 'utf8');
    try {
      const res = ingestBacklogPatchFile(repos, file);
      expect(res.updated).toContain('NOT-020');
      expect(repos.auditLog.list({ action: 'backlog.patch.dropped' })).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // UAT #5: a patch parsed fine but every id was skipped (none matched an
  // existing row) → updated:0 with NO parse error → the step still reported
  // "succeeded" and the enrichment vanished silently. A 0-update patch must be
  // visible regardless of whether the cause was a parse error or all-skipped.
  it('emits backlog.patch.dropped when the patch parsed but updated 0 (all skipped)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kx-patch-'));
    const file = join(dir, 'backlog.patch.yaml');
    // Valid YAML, valid items — but the ids do not exist in the backlog.
    writeFileSync(file, 'items:\n  - id: GHOST-1\n    version: v0.1\n', 'utf8');
    try {
      const res = ingestBacklogPatchFile(repos, file);
      expect(res.parseErrors).toHaveLength(0);
      expect(res.updated).toHaveLength(0);
      expect(res.skipped.length).toBeGreaterThan(0);
      expect(repos.auditLog.list({ action: 'backlog.patch.dropped' }).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// KRİTİK UAT #10j — engine-side structural floor (executor-independent).
// codex-primary planning produced 18 items with epic 0, parent_epic 0,
// blocked_by 0, split across ~10 versions (the BRD asked for one version, one
// epic). The agent ignored the workflow instructions; the ENGINE must guarantee
// a buildable structure regardless of which executor ran.
// ---------------------------------------------------------------------------

describe('ensureBacklogStructure (UAT #10j engine guarantee)', () => {
  function task(id: string, over: Record<string, unknown> = {}) {
    repos.backlog.create({
      id, type: 'task', title: id, status: 'to_do',
      parent_id: null, version: null, model: null, review_gates: [],
      frontmatter: {}, body_md: '', ...over,
    });
  }

  it('synthesizes ONE default epic + parents every root-less task when no epic exists', () => {
    task('T-1'); task('T-2'); task('T-3');
    const res = ensureBacklogStructure(repos, { code: 'NOT' });

    const epics = repos.backlog.list({ type: 'epic', limit: 100 });
    expect(epics).toHaveLength(1);
    expect(res.createdEpic).toBe(epics[0]!.id);
    // Every task is now parented to that epic (board is never epic-less).
    for (const id of ['T-1', 'T-2', 'T-3']) {
      expect(repos.backlog.get(id)!.parent_id).toBe(epics[0]!.id);
    }
  });

  it('does NOT create a default epic when one already exists', () => {
    repos.backlog.create({
      id: 'NOT-E01', type: 'epic', title: 'Real', status: 'to_do',
      parent_id: null, version: null, model: null, review_gates: [], frontmatter: {}, body_md: '',
    });
    task('T-1', { parent_id: 'NOT-E01' });
    const res = ensureBacklogStructure(repos, { code: 'NOT' });
    expect(res.createdEpic).toBeNull();
    expect(repos.backlog.list({ type: 'epic', limit: 100 })).toHaveLength(1);
  });

  it('derives a linear dependency chain when the agent produced NO blocked_by', () => {
    task('T-1'); task('T-2'); task('T-3');
    const res = ensureBacklogStructure(repos, { code: 'NOT' });
    // T-1 is the head; T-2 waits on T-1; T-3 waits on T-2 (not 3 parallel-from-base).
    expect(repos.backlog.get('T-1')!.frontmatter.blocked_by ?? []).toEqual([]);
    expect(repos.backlog.get('T-2')!.frontmatter.blocked_by).toEqual(['T-1']);
    expect(repos.backlog.get('T-3')!.frontmatter.blocked_by).toEqual(['T-2']);
    expect(res.chained).toEqual(['T-2', 'T-3']);
  });

  it('does NOT touch dependencies when the agent already produced some', () => {
    task('T-1'); task('T-2', { frontmatter: { blocked_by: ['T-1'] } }); task('T-3');
    const res = ensureBacklogStructure(repos, { code: 'NOT' });
    expect(res.chained).toEqual([]);
    expect(repos.backlog.get('T-3')!.frontmatter.blocked_by ?? []).toEqual([]); // untouched
  });

  it('collapses a pathologically version-fragmented backlog to its earliest version', () => {
    task('T-1', { version: 'v0.1' });
    task('T-2', { version: 'v0.2' });
    task('T-3', { version: 'v0.3' });
    task('T-4', { version: 'v0.10' });
    const res = ensureBacklogStructure(repos, { code: 'NOT' });
    expect(res.versionCollapsedTo).toBe('v0.1');
    for (const id of ['T-1', 'T-2', 'T-3', 'T-4']) {
      expect(repos.backlog.get(id)!.version).toBe('v0.1');
    }
  });

  // UAT #10L side-finding: codex's version patch was dropped (parse error) so
  // EVERY item ended with version=None — and the floor only COLLAPSED existing
  // versions, it never filled missing ones. An all-None backlog must get a
  // default version so the version-gated build order has something to work with.
  it('assigns default v0.1 to every item when the agent produced NO versions at all', () => {
    task('T-1'); task('T-2'); task('T-3');
    const res = ensureBacklogStructure(repos, { code: 'NOT' });
    expect(res.versionDefaulted).toBe('v0.1');
    for (const id of ['T-1', 'T-2', 'T-3']) {
      expect(repos.backlog.get(id)!.version).toBe('v0.1');
    }
  });

  it('does NOT default versions when at least one item already has one', () => {
    task('T-1', { version: 'v0.2' }); task('T-2');
    const res = ensureBacklogStructure(repos, { code: 'NOT' });
    expect(res.versionDefaulted).toBeNull();
    expect(repos.backlog.get('T-2')!.version).toBeNull(); // untouched (conservative)
  });

  it('leaves a reasonably-versioned backlog untouched', () => {
    task('T-1', { version: 'v0.1' });
    task('T-2', { version: 'v0.1' });
    task('T-3', { version: 'v0.2' });
    task('T-4', { version: 'v0.2' });
    const res = ensureBacklogStructure(repos, { code: 'NOT' });
    expect(res.versionCollapsedTo).toBeNull();
    expect(repos.backlog.get('T-3')!.version).toBe('v0.2'); // unchanged
  });

  it('is idempotent — a second run creates no new epic and re-chains nothing', () => {
    task('T-1'); task('T-2');
    ensureBacklogStructure(repos, { code: 'NOT' });
    const res2 = ensureBacklogStructure(repos, { code: 'NOT' });
    expect(res2.createdEpic).toBeNull();
    expect(res2.chained).toEqual([]);
    expect(repos.backlog.list({ type: 'epic', limit: 100 })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// KRİTİK UAT #10k — the epic guarantee must fire AT INGEST TIME, not only in
// the planning-COMPLETION hook. In live codex runs the board showed "epic 0"
// throughout planning, and a run stopped before `succeeded` never got an epic
// at all (the #10j floor was wired only to the completion hook). The floor
// must run the moment the backlog lands in the DB (step-1 full ingest) and be
// re-guaranteed after every enrichment patch — idempotent, never duplicating.
// ---------------------------------------------------------------------------

describe('epic floor at ingest time (UAT #10k)', () => {
  const EPICLESS_YAML = [
    'items:',
    '  - id: NOT-001',
    '    type: task',
    '    title: Setup',
    '  - id: NOT-002',
    '    type: task',
    '    title: Feature',
    '',
  ].join('\n');

  function inTmpDir<T>(name: string, content: string, fn: (file: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'kx-floor-'));
    const file = join(dir, name);
    writeFileSync(file, content, 'utf8');
    try {
      return fn(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('full ingest of an epic-less backlog.yaml synthesizes the default epic IMMEDIATELY', () => {
    inTmpDir('backlog.yaml', EPICLESS_YAML, (file) => {
      const res = ingestBacklogFile(repos, file, { code: 'NOT', defaultEpicTitle: 'Notly' });
      const epics = repos.backlog.list({ type: 'epic', limit: 100 });
      expect(epics).toHaveLength(1);
      expect(epics[0]!.id).toBe('NOT-E01');
      expect(epics[0]!.title).toBe('Notly');
      // Every task is parented the moment the backlog exists — no waiting for
      // planning to succeed before the board shows an epic.
      expect(repos.backlog.get('NOT-001')!.parent_id).toBe('NOT-E01');
      expect(repos.backlog.get('NOT-002')!.parent_id).toBe('NOT-E01');
      expect(res.epicFloor.createdEpic).toBe('NOT-E01');
    });
  });

  it('does NOT synthesize a default epic when the agent produced its own', () => {
    const yamlWithEpic = [
      'items:',
      '  - id: NOT-E01',
      '    type: epic',
      '    title: Real epic',
      '  - id: NOT-001',
      '    type: task',
      '    title: Setup',
      '    parent_epic: NOT-E01',
      '',
    ].join('\n');
    inTmpDir('backlog.yaml', yamlWithEpic, (file) => {
      const res = ingestBacklogFile(repos, file, { code: 'NOT', defaultEpicTitle: 'Notly' });
      expect(res.epicFloor.createdEpic).toBeNull();
      expect(repos.backlog.list({ type: 'epic', limit: 100 })).toHaveLength(1);
    });
  });

  it('enrichment patches keep the floor intact — no duplicate epic, links preserved', () => {
    inTmpDir('backlog.yaml', EPICLESS_YAML, (file) => {
      ingestBacklogFile(repos, file, { code: 'NOT', defaultEpicTitle: 'Notly' });
    });
    inTmpDir('backlog.patch.yaml', 'items:\n  - id: NOT-001\n    version: v0.1\n', (file) => {
      const res = ingestBacklogPatchFile(repos, file, { code: 'NOT', defaultEpicTitle: 'Notly' });
      expect(res.epicFloor.createdEpic).toBeNull(); // already guaranteed — no duplicate
    });
    expect(repos.backlog.list({ type: 'epic', limit: 100 })).toHaveLength(1);
    expect(repos.backlog.get('NOT-001')!.parent_id).toBe('NOT-E01');
    expect(repos.backlog.get('NOT-001')!.version).toBe('v0.1'); // enrichment landed too
  });

  it('a patch-file ingest guarantees the floor when the DB has tasks but no epic', () => {
    // Simulates a DB that predates the ingest-time floor (or a step-1 path that
    // bypassed it): tasks exist, epic does not. The NEXT patch must repair it.
    repos.backlog.create({
      id: 'NOT-001', type: 'task', title: 'Setup', status: 'to_do',
      parent_id: null, version: null, model: null, review_gates: [], frontmatter: {}, body_md: '',
    });
    inTmpDir('backlog.patch.yaml', 'items:\n  - id: NOT-001\n    version: v0.1\n', (file) => {
      const res = ingestBacklogPatchFile(repos, file, { code: 'NOT', defaultEpicTitle: 'Notly' });
      expect(res.epicFloor.createdEpic).toBe('NOT-E01');
    });
    expect(repos.backlog.list({ type: 'epic', limit: 100 })).toHaveLength(1);
    expect(repos.backlog.get('NOT-001')!.parent_id).toBe('NOT-E01');
  });

  it('a later REAL epic from a patch wins — tasks reparent to it, default epic stays single', () => {
    inTmpDir('backlog.yaml', EPICLESS_YAML, (file) => {
      ingestBacklogFile(repos, file, { code: 'NOT', defaultEpicTitle: 'Notly' });
    });
    const patch = [
      'items:',
      '  - id: NOT-E02',
      '    type: epic',
      '    title: Agent epic',
      '  - id: NOT-001',
      '    parent_epic: NOT-E02',
      '',
    ].join('\n');
    inTmpDir('backlog.patch.yaml', patch, (file) => {
      const res = ingestBacklogPatchFile(repos, file, { code: 'NOT', defaultEpicTitle: 'Notly' });
      expect(res.epicFloor.createdEpic).toBeNull();
    });
    // The agent's real epic owns the task now; the default epic is not duplicated.
    expect(repos.backlog.get('NOT-001')!.parent_id).toBe('NOT-E02');
    expect(repos.backlog.list({ type: 'epic', limit: 100 })).toHaveLength(2);
  });
});
