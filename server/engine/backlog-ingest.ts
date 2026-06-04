import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { Repositories } from '../db/repositories/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedBacklogItem = {
  id: string;
  type: string;
  title: string;
  priority?: string;
  description?: string;
  acceptance_criteria?: string[];
  review_gates?: string[];
  blocks?: string[];
  blocked_by?: string[];
};

// Valid enum values — kept inline to avoid importing the full zod schema at
// runtime (the repo already validates on create; we just need them for the
// pre-flight filter here).
const VALID_TYPES = new Set(['task', 'bug', 'debt', 'epic', 'spike', 'hotfix']);
const VALID_GATES = new Set([
  'code_review',
  'quality_control',
  'security_control',
  'design_review',
  'uat',
]);

// ---------------------------------------------------------------------------
// 1. Parser
// ---------------------------------------------------------------------------

export function parseBacklogYaml(text: string): {
  items: ParsedBacklogItem[];
  errors: string[];
} {
  let doc: unknown;
  try {
    // JSON_SCHEMA restricts parsing to plain JSON-compatible types only,
    // preventing arbitrary object construction (js-yaml's equivalent of safeLoad).
    doc = yaml.load(text, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { items: [], errors: [`yaml parse failed: ${msg}`] };
  }

  if (
    !doc ||
    typeof doc !== 'object' ||
    !Array.isArray((doc as Record<string, unknown>)['items'])
  ) {
    return { items: [], errors: ['no "items" array found'] };
  }

  const raw = (doc as Record<string, unknown>)['items'] as unknown[];
  const items: ParsedBacklogItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') {
      errors.push(`item #${i}: not an object`);
      continue;
    }

    const obj = entry as Record<string, unknown>;
    const id = obj['id'];
    const title = obj['title'];
    const type = obj['type'];

    const missing: string[] = [];
    if (typeof id !== 'string' || id.trim() === '') missing.push('id');
    if (typeof title !== 'string' || title.trim() === '') missing.push('title');
    if (typeof type !== 'string' || type.trim() === '') missing.push('type');

    if (missing.length > 0) {
      errors.push(`item #${i}: missing ${missing.join('/')}`);
      continue;
    }

    const parsed: ParsedBacklogItem = {
      id: (id as string).trim(),
      type: (type as string).trim(),
      title: (title as string).trim(),
    };

    if (typeof obj['priority'] === 'string') parsed.priority = obj['priority'];
    if (typeof obj['description'] === 'string') parsed.description = obj['description'];

    if (Array.isArray(obj['acceptance_criteria'])) {
      parsed.acceptance_criteria = (obj['acceptance_criteria'] as unknown[])
        .filter((v): v is string => typeof v === 'string');
    }

    if (Array.isArray(obj['review_gates'])) {
      parsed.review_gates = (obj['review_gates'] as unknown[])
        .filter((v): v is string => typeof v === 'string');
    }

    if (Array.isArray(obj['blocks'])) {
      parsed.blocks = (obj['blocks'] as unknown[])
        .filter((v): v is string => typeof v === 'string');
    }

    if (Array.isArray(obj['blocked_by'])) {
      parsed.blocked_by = (obj['blocked_by'] as unknown[])
        .filter((v): v is string => typeof v === 'string');
    }

    items.push(parsed);
  }

  return { items, errors };
}

// ---------------------------------------------------------------------------
// 2. Ingester
// ---------------------------------------------------------------------------

export function ingestBacklogItems(
  repos: Repositories,
  parsed: ParsedBacklogItem[],
): {
  created: string[];
  skipped: { id: string; reason: string }[];
} {
  const created: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const item of parsed) {
    const { id, type, title } = item;

    // Validate type
    if (!VALID_TYPES.has(type)) {
      skipped.push({ id, reason: `invalid type "${type}"` });
      continue;
    }

    // Idempotency check
    if (repos.backlog.get(id) !== null) {
      skipped.push({ id, reason: 'already exists' });
      continue;
    }

    // Filter review_gates; collect dropped ones
    const requestedGates = item.review_gates ?? [];
    const validGates = requestedGates.filter((g) => VALID_GATES.has(g));
    const droppedGates = requestedGates.filter((g) => !VALID_GATES.has(g));

    // Build frontmatter
    const frontmatter: Record<string, unknown> = {};
    if (item.priority !== undefined) frontmatter['priority'] = item.priority;
    if (item.acceptance_criteria !== undefined)
      frontmatter['acceptance_criteria'] = item.acceptance_criteria;
    if (item.blocks !== undefined) frontmatter['blocks'] = item.blocks;
    if (item.blocked_by !== undefined) frontmatter['blocked_by'] = item.blocked_by;
    if (droppedGates.length > 0) frontmatter['dropped_gates'] = droppedGates;

    try {
      repos.backlog.create({
        id,
        type: type as import('../db/schemas.ts').BacklogItemType,
        title,
        status: 'to_do',
        body_md: item.description ?? '',
        review_gates: validGates as import('../db/schemas.ts').Gate[],
        frontmatter,
      });

      repos.auditLog.append({
        actor: 'engine',
        action: 'backlog.ingest',
        resource_type: 'backlog_item',
        resource_id: id,
        payload: { type, title },
      });

      created.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skipped.push({ id, reason: msg });
    }
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------------
// 3. File-level entry point
// ---------------------------------------------------------------------------

export function ingestBacklogFile(
  repos: Repositories,
  absolutePath: string,
): {
  created: string[];
  skipped: { id: string; reason: string }[];
  parseErrors: string[];
} {
  let text: string;
  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { created: [], skipped: [], parseErrors: [`read failed: ${msg}`] };
  }

  const { items, errors: parseErrors } = parseBacklogYaml(text);
  const { created, skipped } = ingestBacklogItems(repos, items);

  console.log(
    `[kortext] backlog ingest: ${created.length} created, ${skipped.length} skipped, ${parseErrors.length} parse errors`,
  );

  return { created, skipped, parseErrors };
}
