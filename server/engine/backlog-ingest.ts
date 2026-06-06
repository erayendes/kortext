import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import yaml from 'js-yaml';
import type { Repositories } from '../db/repositories/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedBacklogItem = {
  id: string;
  /** Required in full mode; omitted in patch mode (a delta only carries the
   *  fields it changes — the existing row keeps its type/title). */
  type?: string;
  title?: string;
  priority?: string;
  description?: string;
  acceptance_criteria?: string[];
  review_gates?: string[];
  blocks?: string[];
  blocked_by?: string[];
  /** Target version (e.g. 'v0.1', 'v1.0') → maps to the `version` column. */
  version?: string;
  /** Parent epic id (from `parent_epic` or `parent`) → maps to the `parent_id`
   *  column, building the Epic → Task hierarchy. */
  parent_id?: string;
  /** Per-item LLM model preference (per rules/models.md) → `model` column. */
  model?: string;
  /** A human-readable epic LABEL the agent wrote as `epic:` instead of a proper
   *  `parent_epic` id (e.g. `epic: Infrastructure`). When no explicit parent_id
   *  is given, the ingester synthesizes a real `type: epic` item from this label
   *  and links the task to it, so the Board's epic column is never left empty. */
  epic_label?: string;
  /** Any non-standard keys the agent added (e.g. phase, references, prd_id),
   *  preserved verbatim so the agent's structuring is never silently dropped. */
  extra?: Record<string, unknown>;
};

const KNOWN_ITEM_KEYS = new Set([
  'id',
  'type',
  'title',
  'priority',
  'description',
  'acceptance_criteria',
  'review_gates',
  'blocks',
  'blocked_by',
  // Hierarchy + model fields mapped to real columns (not frontmatter passthrough).
  'version',
  'parent_epic',
  'parent',
  'model',
  // A bare `epic:` LABEL is consumed into a synthesized epic (see epic_label),
  // not dumped into frontmatter.
  'epic',
]);

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

/**
 * Map a raw `type` onto the work-item enum. Agents frequently put a *domain*
 * category there ("infrastructure", "security", "feature") instead of the
 * work-item kind. Rather than dropping the item, map by keyword and default to
 * 'task'; the caller records the raw value in frontmatter (`original_type`) so
 * nothing is lost. Only genuinely structureless rows (no id/title) are skipped.
 */
export function coerceItemType(raw: string): { type: string; original?: string } {
  const t = raw.trim().toLowerCase();
  if (VALID_TYPES.has(t)) return { type: t };
  if (t.includes('bug')) return { type: 'bug', original: raw };
  if (t.includes('debt')) return { type: 'debt', original: raw };
  if (t.includes('epic')) return { type: 'epic', original: raw };
  if (t.includes('spike')) return { type: 'spike', original: raw };
  if (t.includes('hotfix')) return { type: 'hotfix', original: raw };
  return { type: 'task', original: raw };
}

// ---------------------------------------------------------------------------
// 1. Parser
// ---------------------------------------------------------------------------

/**
 * Parse the agent-written backlog into items. Two accepted shapes (agents lean
 * toward the second even when asked for the first):
 *   1. A pure YAML document with a top-level `items:` list (the instructed form).
 *   2. Markdown prose containing one or more ```yaml fenced blocks — each block
 *      a list of items, a single item object, or an `{ items: [...] }` doc.
 * The fenced fallback makes ingestion robust to the model's natural formatting.
 */
export function parseBacklogYaml(
  text: string,
  opts: { mode?: 'full' | 'patch' } = {},
): {
  items: ParsedBacklogItem[];
  errors: string[];
} {
  const mode = opts.mode ?? 'full';
  // Shape 1: whole document is YAML with a top-level items array.
  let topDoc: unknown;
  let topErr: string | null = null;
  try {
    topDoc = yaml.load(text, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    topErr = err instanceof Error ? err.message : String(err);
  }
  if (
    topDoc &&
    typeof topDoc === 'object' &&
    Array.isArray((topDoc as Record<string, unknown>)['items'])
  ) {
    return validateRawItems((topDoc as Record<string, unknown>)['items'] as unknown[], mode);
  }

  // Shape 2: collect items from ```yaml fenced blocks embedded in markdown.
  // A block that fails to parse is NOT silently dropped — it becomes an error so
  // the caller can see (and surface) that some items were lost to bad YAML.
  const raw: unknown[] = [];
  const blockErrors: string[] = [];
  const fence = /```ya?ml\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let blockIndex = 0;
  while ((m = fence.exec(text)) !== null) {
    blockIndex++;
    let block: unknown;
    try {
      block = yaml.load(m[1] ?? '', { schema: yaml.JSON_SCHEMA });
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      blockErrors.push(`fenced block #${blockIndex}: yaml parse failed: ${msg}`);
      continue; // others may still be valid
    }
    if (Array.isArray(block)) raw.push(...block);
    else if (block && typeof block === 'object') {
      const o = block as Record<string, unknown>;
      if (Array.isArray(o['items'])) raw.push(...(o['items'] as unknown[]));
      else if (typeof o['id'] === 'string') raw.push(o);
    }
  }
  if (raw.length > 0 || blockErrors.length > 0) {
    const r = validateRawItems(raw, mode);
    return { items: r.items, errors: [...blockErrors, ...r.errors] };
  }

  // Nothing usable in either shape.
  if (topErr) return { items: [], errors: [`yaml parse failed: ${topErr}`] };
  return { items: [], errors: ['no "items" array found'] };
}

/**
 * Validate + normalize a raw list of item entries (shared by both shapes).
 * In `full` mode an item must carry id+title+type (a freshly defined item).
 * In `patch` mode only `id` is required — the entry is a delta that updates the
 * fields it does carry and leaves the rest of the existing row untouched.
 */
function validateRawItems(
  raw: unknown[],
  mode: 'full' | 'patch' = 'full',
): {
  items: ParsedBacklogItem[];
  errors: string[];
} {
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
    if (mode === 'full') {
      if (typeof title !== 'string' || title.trim() === '') missing.push('title');
      if (typeof type !== 'string' || type.trim() === '') missing.push('type');
    }

    if (missing.length > 0) {
      errors.push(`item #${i}: missing ${missing.join('/')}`);
      continue;
    }

    const parsed: ParsedBacklogItem = { id: (id as string).trim() };
    if (typeof type === 'string' && type.trim() !== '') parsed.type = type.trim();
    if (typeof title === 'string' && title.trim() !== '') parsed.title = title.trim();

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

    // Hierarchy + model: map to real columns instead of frontmatter.
    if (typeof obj['version'] === 'string' && obj['version'].trim() !== '') {
      parsed.version = obj['version'].trim();
    }
    // `parent_epic` is the instructed key; accept `parent` as an alias. Either
    // links this item to its epic via the parent_id column.
    const rawParent = obj['parent_epic'] ?? obj['parent'];
    if (typeof rawParent === 'string' && rawParent.trim() !== '') {
      parsed.parent_id = rawParent.trim();
    }
    if (typeof obj['model'] === 'string' && obj['model'].trim() !== '') {
      parsed.model = obj['model'].trim();
    }
    // A bare `epic:` label (not an id). Held aside for synthesis in the ingester
    // only when no explicit parent_epic/parent id was supplied.
    if (
      parsed.parent_id === undefined &&
      typeof obj['epic'] === 'string' &&
      obj['epic'].trim() !== ''
    ) {
      parsed.epic_label = obj['epic'].trim();
    }

    // Preserve any agent-added fields (phase, references, prd_id, …) so the
    // agent's own structuring survives into frontmatter.
    const extra: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (!KNOWN_ITEM_KEYS.has(key)) extra[key] = obj[key];
    }
    if (Object.keys(extra).length > 0) parsed.extra = extra;

    items.push(parsed);
  }

  return { items, errors };
}

// ---------------------------------------------------------------------------
// 2. Ingester
// ---------------------------------------------------------------------------

/** Kebab-case slug for a synthesized epic id, e.g. "Infra & CI" → "infra-ci". */
function epicSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Agents frequently flatten the backlog: every task carries a human-readable
 * `epic:` LABEL and there is no `type: epic` container item, so the Board's epic
 * column comes back empty. Synthesize one real epic per distinct label and point
 * each labelled task at it via parent_id. Items that already have an explicit
 * parent_id are left untouched — the proper shape always wins.
 *
 * Epic id strategy (stable / idempotent across re-ingest of the same labels):
 *   - When `code` is provided: `${code}-E01`, `${code}-E02`, … (padded 2 digits,
 *     counting distinct labels in first-seen order within the batch).
 *   - When `code` is absent or empty: `epic-${slug}` (legacy behavior preserved).
 */
export function deriveSyntheticEpics(
  parsed: ParsedBacklogItem[],
  code?: string,
): ParsedBacklogItem[] {
  const useCode = typeof code === 'string' && code.trim() !== '';
  // Map from the canonical key (coded: label; slug: slug) → epic item.
  // We need to track insertion order to assign stable E01/E02/… counters.
  const labelToEpicId = new Map<string, string>();
  const synthesized = new Map<string, ParsedBacklogItem>();
  const out: ParsedBacklogItem[] = [];

  for (const item of parsed) {
    if (item.parent_id !== undefined || !item.epic_label) {
      out.push(item);
      continue;
    }
    const slug = epicSlug(item.epic_label);
    if (slug === '') {
      out.push(item); // label is pure punctuation — nothing to derive
      continue;
    }

    // Use the label itself as the dedup key so E01/E02 is label-stable.
    const labelKey = item.epic_label;
    if (!labelToEpicId.has(labelKey)) {
      let epicId: string;
      if (useCode) {
        const counter = labelToEpicId.size + 1;
        epicId = `${code!.trim()}-E${String(counter).padStart(2, '0')}`;
      } else {
        epicId = `epic-${slug}`;
      }
      labelToEpicId.set(labelKey, epicId);
      synthesized.set(epicId, {
        id: epicId,
        type: 'epic',
        title: item.epic_label,
      });
    }
    const epicId = labelToEpicId.get(labelKey)!;
    out.push({ ...item, parent_id: epicId });
  }

  // Synthesized epics go first so the parent FK is satisfied for flat batches.
  return [...synthesized.values(), ...out];
}

/**
 * Enforce symmetric dependency invariants on a list of parsed items — additive
 * only, never removing agent-authored entries.
 *
 * Rules:
 *   - If A.blocks includes B, ensure B.blocked_by includes A.
 *   - If A.blocked_by includes B, ensure B.blocks includes A.
 *
 * Only items within the same batch are cross-referenced; dangling refs (B not
 * present in the batch) are left as-is and reported via the audit log in the
 * ingester.
 */
export function enforceSymmetricDeps(items: ParsedBacklogItem[]): ParsedBacklogItem[] {
  // Build a mutable copy of each item so we can add missing entries.
  const byId = new Map<string, ParsedBacklogItem>(
    items.map((item) => [item.id, { ...item }]),
  );

  for (const item of byId.values()) {
    // A.blocks → B.blocked_by
    for (const bId of item.blocks ?? []) {
      const b = byId.get(bId);
      if (!b) continue;
      if (!(b.blocked_by ?? []).includes(item.id)) {
        b.blocked_by = [...(b.blocked_by ?? []), item.id];
      }
    }
    // A.blocked_by → B.blocks
    for (const bId of item.blocked_by ?? []) {
      const b = byId.get(bId);
      if (!b) continue;
      if (!(b.blocks ?? []).includes(item.id)) {
        b.blocks = [...(b.blocks ?? []), item.id];
      }
    }
  }

  // Preserve original ordering.
  return items.map((orig) => byId.get(orig.id) ?? orig);
}

export function ingestBacklogItems(
  repos: Repositories,
  parsed: ParsedBacklogItem[],
  opts?: { code?: string },
): {
  created: string[];
  updated: string[];
  skipped: { id: string; reason: string }[];
} {
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  // Turn bare `epic:` labels into real epic items + parent links before ingest.
  // Pass optional project code so synthesized ids use <CODE>-E0N format.
  parsed = deriveSyntheticEpics(parsed, opts?.code);

  // Enforce symmetric dep invariants (additive only — never removes entries).
  parsed = enforceSymmetricDeps(parsed);

  // Epics first (stable): parent_id is a real FK (foreign_keys = ON), so a child
  // task linking to an epic in the same batch must see the epic row already
  // inserted. Sorting epics ahead of tasks satisfies the common flat-batch case
  // without a full topological sort; cross-batch parents resolve via idempotency.
  const ordered = [...parsed].sort((a, b) => {
    const aEpic = coerceItemType(a.type ?? '').type === 'epic' ? 0 : 1;
    const bEpic = coerceItemType(b.type ?? '').type === 'epic' ? 0 : 1;
    return aEpic - bEpic;
  });

  for (const item of ordered) {
    const { id } = item;
    // A full ingest needs type+title (patch deltas go through patchBacklogItems).
    if (!item.type || !item.title) {
      skipped.push({ id, reason: 'missing type/title for full ingest' });
      continue;
    }
    const { type, title } = item;

    // Coerce an out-of-enum type instead of dropping the item.
    const { type: coercedType, original: originalType } = coerceItemType(type);

    // Filter review_gates; collect dropped ones
    const requestedGates = item.review_gates ?? [];
    const validGates = requestedGates.filter((g) => VALID_GATES.has(g));
    const droppedGates = requestedGates.filter((g) => !VALID_GATES.has(g));

    // Build frontmatter — start with any agent-added fields, then the known
    // ones (so explicit fields win over passthrough on a name clash).
    const frontmatter: Record<string, unknown> = { ...(item.extra ?? {}) };
    if (item.priority !== undefined) frontmatter['priority'] = item.priority;
    if (item.acceptance_criteria !== undefined)
      frontmatter['acceptance_criteria'] = item.acceptance_criteria;
    if (item.blocks !== undefined) frontmatter['blocks'] = item.blocks;
    if (item.blocked_by !== undefined) frontmatter['blocked_by'] = item.blocked_by;
    if (droppedGates.length > 0) frontmatter['dropped_gates'] = droppedGates;
    if (originalType) frontmatter['original_type'] = originalType;

    const planningFields = {
      type: coercedType as import('../db/schemas.ts').BacklogItemType,
      title,
      parent_id: item.parent_id ?? null,
      version: item.version ?? null,
      model: item.model ?? null,
      review_gates: validGates as import('../db/schemas.ts').Gate[],
      frontmatter,
      body_md: item.description ?? '',
    };

    // Upsert: a later enrichment pass rewrites the whole backlog.yaml, so an
    // existing item is UPDATED (planning fields only — status/owner stay), never
    // skipped. Skips are reserved for genuine failures.
    const exists = repos.backlog.get(id) !== null;
    try {
      if (exists) {
        repos.backlog.updatePlanningFields(id, planningFields);
        updated.push(id);
      } else {
        repos.backlog.create({ id, ...planningFields, status: 'to_do' });
        created.push(id);
      }

      repos.auditLog.append({
        actor: 'engine',
        action: exists ? 'backlog.ingest.update' : 'backlog.ingest',
        resource_type: 'backlog_item',
        resource_id: id,
        payload: { type, title },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skipped.push({ id, reason: msg });
    }
  }

  // A4 — Dangling-reference warnings (warn-only, no mutation).
  // After all rows are written, build the set of known ids in this batch so we
  // can detect references that point at non-existent items. References to items
  // that were skipped (failed to write) are also considered dangling.
  const ingested = new Set([...created, ...updated]);
  for (const item of ordered) {
    const refs: string[] = [...(item.blocks ?? []), ...(item.blocked_by ?? [])];
    for (const refId of refs) {
      if (!ingested.has(refId)) {
        repos.auditLog.append({
          actor: 'engine',
          action: 'backlog.ingest.dangling_ref',
          resource_type: 'backlog_item',
          resource_id: refId,
          payload: {
            source_id: item.id,
            ref_id: refId,
            message: `dangling reference: ${item.id} references ${refId} which is not in the ingested set`,
          },
        });
      }
    }
  }

  return { created, updated, skipped };
}

/**
 * Apply delta patches to existing backlog rows. A patch entry carries only the
 * fields it changes (id + e.g. `review_gates` or `version`); every other column
 * is left untouched. This replaces the "rewrite the whole 100-item file every
 * enrichment step" pattern, which forced the agent to re-emit ~80 KB per step
 * (~20 min each at 100 items). A patch is a few KB → seconds.
 *
 * Merge rules:
 *   - `review_gates`: ADDITIVE (qa/security/designer each add their own gate),
 *     unioned + deduped + validity-filtered onto the existing gates.
 *   - `version` / `model` / `parent_id` / `priority` / `acceptance_criteria` /
 *     `blocks` / `blocked_by` / `description` + unknown frontmatter keys:
 *     last-writer-wins — set only when the patch provides them.
 *   - `type` is never changed by a patch (the row keeps its kind).
 *   - An id that doesn't exist is skipped, never created (full ingest owns
 *     creation).
 */
export function patchBacklogItems(
  repos: Repositories,
  parsed: ParsedBacklogItem[],
): {
  updated: string[];
  skipped: { id: string; reason: string }[];
} {
  const updated: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const item of parsed) {
    const existing = repos.backlog.get(item.id);
    if (existing === null) {
      skipped.push({ id: item.id, reason: 'not found (patch only updates)' });
      continue;
    }

    // review_gates: additive union (drop unknown gates, dedupe).
    let reviewGates = existing.review_gates;
    if (item.review_gates !== undefined) {
      const valid = item.review_gates.filter((g) => VALID_GATES.has(g));
      reviewGates = [...new Set([...existing.review_gates, ...valid])] as typeof existing.review_gates;
    }

    // frontmatter: overlay only patch-provided keys onto the existing block.
    const frontmatter: Record<string, unknown> = { ...existing.frontmatter };
    if (item.extra) Object.assign(frontmatter, item.extra);
    if (item.priority !== undefined) frontmatter['priority'] = item.priority;
    if (item.acceptance_criteria !== undefined)
      frontmatter['acceptance_criteria'] = item.acceptance_criteria;
    if (item.blocks !== undefined) frontmatter['blocks'] = item.blocks;
    if (item.blocked_by !== undefined) frontmatter['blocked_by'] = item.blocked_by;

    try {
      repos.backlog.updatePlanningFields(item.id, {
        type: existing.type, // patches never change the work-item kind
        title: item.title ?? existing.title,
        parent_id: item.parent_id ?? existing.parent_id,
        version: item.version ?? existing.version,
        model: item.model ?? existing.model,
        review_gates: reviewGates,
        frontmatter,
        body_md: item.description ?? existing.body_md,
      });
      repos.auditLog.append({
        actor: 'engine',
        action: 'backlog.patch',
        resource_type: 'backlog_item',
        resource_id: item.id,
        payload: {},
      });
      updated.push(item.id);
    } catch (err) {
      skipped.push({ id: item.id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { updated, skipped };
}

// ---------------------------------------------------------------------------
// 2b. DB → backlog.yaml serializer
// ---------------------------------------------------------------------------

/**
 * Serialize the whole backlog (DB) back into canonical `backlog.yaml` text.
 *
 * Why: enrichment steps write tiny patches that only touch the DB. If the file
 * stayed at the step-1 skeleton, a later persona (model assignment, which needs
 * the assignee; consolidation, which scans the enriched state) would read stale
 * data. After every patch the engine re-serializes the file from the DB — the
 * agent never re-emits the big file, but every persona still reads the current,
 * fully-enriched backlog. Output is pure YAML (a top-level `items:` array) so it
 * round-trips through parseBacklogYaml.
 */
export function serializeBacklogToYaml(repos: Repositories): string {
  const rows = repos.backlog.list({ limit: 100_000 });
  // Epics first: readable + FK-friendly if the file is ever re-ingested fresh.
  rows.sort((a, b) => (a.type === 'epic' ? 0 : 1) - (b.type === 'epic' ? 0 : 1));

  const items = rows.map((r) => {
    const o: Record<string, unknown> = { id: r.id, type: r.type, title: r.title };
    if (r.parent_id) o['parent_epic'] = r.parent_id;
    if (r.version) o['version'] = r.version;
    if (r.model) o['model'] = r.model;
    if (r.review_gates.length > 0) o['review_gates'] = r.review_gates;
    if (r.body_md) o['description'] = r.body_md;
    // Frontmatter holds the rest (priority, acceptance_criteria, blocks,
    // blocked_by, assignee, …) — emit it so nothing is dropped on re-read.
    for (const [k, v] of Object.entries(r.frontmatter)) {
      if (v !== undefined && v !== null && !(k in o)) o[k] = v;
    }
    return o;
  });

  return yaml.dump({ items }, { lineWidth: -1, noRefs: true });
}

/** Serialize the DB backlog and write it to `absolutePath` (the canonical file). */
export function writeBacklogYamlFromDb(repos: Repositories, absolutePath: string): void {
  writeFileSync(absolutePath, serializeBacklogToYaml(repos), 'utf8');
}

// ---------------------------------------------------------------------------
// 3. File-level entry point
// ---------------------------------------------------------------------------

export function ingestBacklogFile(
  repos: Repositories,
  absolutePath: string,
  opts?: { code?: string },
): {
  created: string[];
  updated: string[];
  skipped: { id: string; reason: string }[];
  parseErrors: string[];
} {
  let text: string;
  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { created: [], updated: [], skipped: [], parseErrors: [`read failed: ${msg}`] };
  }

  const { items, errors: parseErrors } = parseBacklogYaml(text);
  const { created, updated, skipped } = ingestBacklogItems(repos, items, opts);

  console.log(
    `[kortext] backlog ingest: ${created.length} created, ${updated.length} updated, ${skipped.length} skipped, ${parseErrors.length} parse errors`,
  );

  // Surface the outcome in the audit log too (dashboard activity), so a partial
  // import (items lost to malformed YAML / skips) is visible, never silent.
  repos.auditLog.append({
    actor: 'engine',
    action: 'backlog.ingest.summary',
    resource_type: 'run',
    resource_id: basename(absolutePath),
    payload: {
      created: created.length,
      updated: updated.length,
      skipped: skipped.length,
      parse_errors: parseErrors.length,
      ...(skipped.length > 0 ? { skipped_detail: skipped.slice(0, 20) } : {}),
      ...(parseErrors.length > 0 ? { parse_error_detail: parseErrors.slice(0, 20) } : {}),
    },
  });

  return { created, updated, skipped, parseErrors };
}

/**
 * Apply a delta patch file (e.g. `backlog.patch.yaml`) to existing rows. Parsed
 * in `patch` mode (only `id` required per entry) and merged field-by-field via
 * patchBacklogItems. Enrichment steps write these instead of rewriting the whole
 * backlog so a 100-item plan stays fast.
 */
export function ingestBacklogPatchFile(
  repos: Repositories,
  absolutePath: string,
): {
  updated: string[];
  skipped: { id: string; reason: string }[];
  parseErrors: string[];
} {
  let text: string;
  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { updated: [], skipped: [], parseErrors: [`read failed: ${msg}`] };
  }

  const { items, errors: parseErrors } = parseBacklogYaml(text, { mode: 'patch' });
  const { updated, skipped } = patchBacklogItems(repos, items);

  console.log(
    `[kortext] backlog patch: ${updated.length} updated, ${skipped.length} skipped, ${parseErrors.length} parse errors`,
  );

  repos.auditLog.append({
    actor: 'engine',
    action: 'backlog.patch.summary',
    resource_type: 'run',
    resource_id: basename(absolutePath),
    payload: {
      updated: updated.length,
      skipped: skipped.length,
      parse_errors: parseErrors.length,
      ...(skipped.length > 0 ? { skipped_detail: skipped.slice(0, 20) } : {}),
      ...(parseErrors.length > 0 ? { parse_error_detail: parseErrors.slice(0, 20) } : {}),
    },
  });

  return { updated, skipped, parseErrors };
}
