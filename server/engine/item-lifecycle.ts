import type { Repositories } from '../db/repositories/index.ts';
import type {
  BacklogItem,
  BacklogItemType,
  BacklogStatus,
} from '../db/schemas.ts';
import type { PersonaRegistry } from './persona-registry.ts';

/**
 * Item lifecycle engine — TS port of the v2 trio:
 *   - kortext-backlog-add.py  → create()
 *   - kortext-item-start.py   → transition('start')
 *   - kortext-item-transition.py → transition(<action>)
 *
 * Layers a state-machine policy on top of BacklogRepository, which is the
 * unchecked data layer. Lifecycle enforces:
 *   - legal status transitions (rejects e.g. `to_do → done`)
 *   - terminal states (`done`, `cancelled`) are sticky
 *   - audit_log entry per transition
 *   - owner persona must exist in the registry on create()
 */

export type ItemTransition =
  | 'start'    // to_do → in_progress
  | 'review'   // in_progress → review
  | 'done'     // review → done
  | 'block'    // in_progress | review → blocked
  | 'unblock'  // blocked → in_progress
  | 'cancel';  // any non-terminal → cancelled

export type CreateItemInput = {
  id: string;
  type: BacklogItemType;
  title: string;
  owner?: string | null;
  parent_id?: string | null;
  body_md?: string;
};

export type ItemLifecycleOptions = {
  repos: Repositories;
  personas: PersonaRegistry;
  now?: () => Date;
};

const TRANSITIONS: Record<ItemTransition, { from: BacklogStatus[]; to: BacklogStatus }> = {
  start:   { from: ['to_do'], to: 'in_progress' },
  review:  { from: ['in_progress'], to: 'review' },
  done:    { from: ['review'], to: 'done' },
  block:   { from: ['in_progress', 'review'], to: 'blocked' },
  unblock: { from: ['blocked'], to: 'in_progress' },
  cancel:  { from: ['to_do', 'in_progress', 'review', 'blocked'], to: 'cancelled' },
};

const TERMINAL_STATES: ReadonlySet<BacklogStatus> = new Set(['done', 'cancelled']);

export class IllegalTransitionError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly transition: ItemTransition,
    public readonly fromStatus: BacklogStatus,
  ) {
    super(
      `illegal transition '${transition}' on item ${itemId} from status '${fromStatus}'`,
    );
    this.name = 'IllegalTransitionError';
  }
}

export class ItemLifecycle {
  constructor(private readonly opts: ItemLifecycleOptions) {}

  create(input: CreateItemInput): BacklogItem {
    if (input.owner && this.opts.personas.get(input.owner) === null) {
      throw new Error(`unknown persona for owner: ${input.owner}`);
    }
    return this.opts.repos.backlog.create({
      id: input.id,
      type: input.type,
      title: input.title,
      owner: input.owner ?? null,
      parent_id: input.parent_id ?? null,
      body_md: input.body_md ?? '',
    });
  }

  transition(
    itemId: string,
    action: ItemTransition,
    by: string,
    reason?: string,
  ): BacklogItem {
    const current = this.opts.repos.backlog.get(itemId);
    if (!current) {
      throw new Error(`backlog item not found: ${itemId}`);
    }

    if (TERMINAL_STATES.has(current.status)) {
      throw new IllegalTransitionError(itemId, action, current.status);
    }

    const rule = TRANSITIONS[action];
    if (!rule.from.includes(current.status)) {
      throw new IllegalTransitionError(itemId, action, current.status);
    }

    const updated = this.opts.repos.backlog.transitionStatus(itemId, rule.to);

    this.opts.repos.auditLog.append({
      actor: by,
      action: 'item_transition',
      resource_type: 'backlog_item',
      resource_id: itemId,
      payload: {
        from: current.status,
        to: rule.to,
        transition: action,
        reason: reason ?? null,
      },
    });

    return updated;
  }

  /** Items in any non-terminal state — useful for dashboard "active" view. */
  listOpen(): BacklogItem[] {
    return this.opts.repos.backlog
      .list({ limit: 1000 })
      .filter((i) => !TERMINAL_STATES.has(i.status));
  }
}
