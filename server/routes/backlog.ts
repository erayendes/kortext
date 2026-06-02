import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router } from 'express';
import {
  BacklogItemTypeSchema,
  type BacklogItemType,
} from '../db/schemas.ts';
import type { Repositories } from '../db/repositories/index.ts';
import {
  ItemLifecycle,
  IllegalTransitionError,
  type ItemTransition,
} from '../engine/item-lifecycle.ts';
import type { PersonaRegistry } from '../engine/persona-registry.ts';

/**
 * GET  /api/backlog        — list backlog items (filters: type, status, owner, parent_id)
 * GET  /api/backlog/:id    — single item
 * POST /api/backlog        — create a new backlog item (Faz 12.9 UI form)
 *
 * Faz 6.4 Board uses GET to render kanban columns; Faz 12.9 adds POST so
 * the "+ New task" modal can create new items end-to-end.
 */
export type BacklogRouterDeps = {
  repos: Repositories;
  /**
   * Optional — when provided, POST seeds `body_md` from the per-type template
   * (`templates/backlogs/<PREFIX>XX-[<type>-name].md`). Falls back to an empty
   * body when missing.
   */
  templatesDir?: string;
  /**
   * Optional — required by POST /backlog/:id/transition (the human-override
   * status moves). ItemLifecycle needs the registry for create(); transitions
   * themselves don't touch it.
   */
  personas?: PersonaRegistry;
};

const TRANSITION_ACTIONS = new Set<ItemTransition>([
  'start',
  'test',
  'review',
  'bounce',
  'done',
  'block',
  'unblock',
  'cancel',
]);

const TYPE_PREFIX: Record<BacklogItemType, string> = {
  task: 'T',
  bug: 'B',
  epic: 'E',
  debt: 'D',
  spike: 'S',
  hotfix: 'H',
};

const TYPE_TEMPLATE_BASE: Record<BacklogItemType, string> = {
  task: 'TXX-[task-name].md',
  bug: 'BXX-[bug-name].md',
  epic: 'EXX-[epic-name].md',
  debt: 'DXX-[debt-name].md',
  spike: 'SXX-[spike-name].md',
  hotfix: 'HXX-[hotfix-name].md',
};

export function backlogRouter(deps: BacklogRouterDeps): Router {
  const r = Router();

  r.get('/backlog', (req, res) => {
    const items = deps.repos.backlog.list({
      type: pickStr(req.query.type) as never,
      status: pickStr(req.query.status) as never,
      owner: pickStr(req.query.owner),
      parent_id: pickStr(req.query.parent_id),
      limit: clampLimit(req.query.limit, 100, 500),
    });
    res.json({ items });
  });

  r.get('/backlog/:id', (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    const item = deps.repos.backlog.get(id);
    if (!item) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ item });
  });

  r.post('/backlog', (req, res) => {
    const body = (req.body ?? {}) as {
      type?: unknown;
      title?: unknown;
      parent_id?: unknown;
      owner?: unknown;
      frontmatter?: unknown;
      body_md?: unknown;
    };

    // type
    const typeParsed = BacklogItemTypeSchema.safeParse(body.type);
    if (!typeParsed.success) {
      res.status(400).json({
        error: 'invalid_type',
        message: 'type must be one of: task, bug, epic, debt, spike, hotfix',
      });
      return;
    }
    const itemType = typeParsed.data;

    // title
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      res.status(400).json({ error: 'missing_title' });
      return;
    }
    const title = body.title.trim();

    // parent_id (if provided, must exist + be an epic)
    let parentId: string | null = null;
    if (body.parent_id !== undefined && body.parent_id !== null && body.parent_id !== '') {
      if (typeof body.parent_id !== 'string') {
        res.status(400).json({ error: 'invalid_parent_id' });
        return;
      }
      const parent = deps.repos.backlog.get(body.parent_id);
      if (!parent) {
        res.status(400).json({
          error: 'parent_not_found',
          message: `parent item '${body.parent_id}' does not exist`,
        });
        return;
      }
      if (parent.type !== 'epic') {
        res.status(400).json({
          error: 'parent_not_epic',
          message: `parent item '${body.parent_id}' is type='${parent.type}' (must be 'epic')`,
        });
        return;
      }
      parentId = body.parent_id;
    }

    // owner (optional persona handle)
    let owner: string | null = null;
    if (body.owner !== undefined && body.owner !== null && body.owner !== '') {
      if (typeof body.owner !== 'string' || body.owner.length === 0) {
        res.status(400).json({ error: 'invalid_owner' });
        return;
      }
      owner = body.owner;
    }

    // frontmatter (optional object)
    let frontmatter: Record<string, unknown> = {};
    if (body.frontmatter !== undefined && body.frontmatter !== null) {
      if (
        typeof body.frontmatter !== 'object' ||
        Array.isArray(body.frontmatter)
      ) {
        res.status(400).json({ error: 'invalid_frontmatter' });
        return;
      }
      frontmatter = body.frontmatter as Record<string, unknown>;
    }

    // body_md (optional — seed from template if omitted)
    let bodyMd: string;
    if (typeof body.body_md === 'string') {
      bodyMd = body.body_md;
    } else {
      bodyMd = seedFromTemplate({
        templatesDir: deps.templatesDir,
        type: itemType,
        title,
      });
    }

    // Generate next id (e.g. T01, T02, ...). Scans existing items of this type
    // and picks max numeric suffix + 1. Pad to width=2 (matches Acme sample).
    const id = nextId(deps.repos, itemType);

    const created = deps.repos.backlog.create({
      id,
      type: itemType,
      title,
      status: 'to_do',
      owner,
      parent_id: parentId,
      frontmatter,
      body_md: bodyMd,
    });

    res.status(201).json({ item: created });
  });

  // Human-override status moves (the Board drawer footer). Delegates to the
  // ItemLifecycle engine so legality + the audit log stay in one place.
  r.post('/backlog/:id/transition', (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }

    const body = (req.body ?? {}) as { action?: unknown; by?: unknown; reason?: unknown };
    if (typeof body.action !== 'string' || !TRANSITION_ACTIONS.has(body.action as ItemTransition)) {
      res.status(400).json({
        error: 'invalid_action',
        message: `action must be one of: ${[...TRANSITION_ACTIONS].join(', ')}`,
      });
      return;
    }

    if (!deps.repos.backlog.get(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (!deps.personas) {
      res.status(500).json({ error: 'personas_unavailable' });
      return;
    }

    const lifecycle = new ItemLifecycle({ repos: deps.repos, personas: deps.personas });
    const by = typeof body.by === 'string' && body.by.length > 0 ? body.by : '+prime';
    const reason = typeof body.reason === 'string' && body.reason.length > 0 ? body.reason : undefined;

    try {
      const updated = lifecycle.transition(id, body.action as ItemTransition, by, reason);
      res.json({ item: updated });
    } catch (e) {
      if (e instanceof IllegalTransitionError) {
        res.status(409).json({ error: 'illegal_transition', message: e.message });
        return;
      }
      res.status(500).json({
        error: 'transition_failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // Item activity feed — the audit trail (transitions etc.) for the drawer,
  // newest-first. "Who did what, when" comes straight from audit_log.
  r.get('/backlog/:id/activity', (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    if (!deps.repos.backlog.get(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const activity = deps.repos.auditLog.list({
      resource_type: 'backlog_item',
      resource_id: id,
      limit: 50,
    });
    res.json({ activity });
  });

  return r;
}

function pickStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function nextId(repos: Repositories, type: BacklogItemType): string {
  const prefix = TYPE_PREFIX[type];
  const existing = repos.backlog.list({ type, limit: 500 });
  let max = 0;
  for (const it of existing) {
    // Accept both 'T01' (Faz 12.9 default) and 'T-001' (Acme sample) shapes.
    const match = it.id.match(/^([A-Z])-?(\d+)$/);
    if (!match) continue;
    if (match[1] !== prefix) continue;
    const n = Number(match[2]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = max + 1;
  return `${prefix}${String(next).padStart(2, '0')}`;
}

function seedFromTemplate(args: {
  templatesDir: string | undefined;
  type: BacklogItemType;
  title: string;
}): string {
  const { templatesDir, type, title } = args;
  if (!templatesDir) return '';
  // Strict filename first (matches what `kortext init` ships).
  const direct = resolve(templatesDir, 'backlogs', TYPE_TEMPLATE_BASE[type]);
  if (existsSync(direct)) {
    return injectTitle(readFileSync(direct, 'utf8'), title);
  }
  // Soft fallback: pick the first file in templates/backlogs/ matching the
  // prefix (handles a hypothetical rename like `TXX-something.md`).
  try {
    const prefix = TYPE_PREFIX[type];
    const dir = resolve(templatesDir, 'backlogs');
    const candidates = readdirSync(dir).filter((f) =>
      f.startsWith(`${prefix}XX-`) && f.endsWith('.md'),
    );
    if (candidates[0]) {
      return injectTitle(readFileSync(resolve(dir, candidates[0]), 'utf8'), title);
    }
  } catch {
    // templates/backlogs/ missing entirely — empty body is fine.
  }
  return '';
}

/**
 * Replace the placeholder `[task-id]-[task-name]` / `[bug-id]-…` heading on
 * the first H1 with the user-supplied title. The template's exact bracketed
 * form is conserved when it doesn't match; the body still seeds.
 */
function injectTitle(template: string, title: string): string {
  const lines = template.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.startsWith('# ')) {
      lines[i] = `# ${title}`;
      break;
    }
  }
  return lines.join('\n');
}
