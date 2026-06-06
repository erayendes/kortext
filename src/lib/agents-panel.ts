/**
 * Derivation behind the footer Agents up-panel.
 *
 * The panel used to list *every* persona as "green / active" — misleading, since
 * most aren't working on anything. Instead we show only the agents that own at
 * least one unfinished item, each with the status of their most-advanced task.
 * Pure + unit-tested; the component is just chrome over this.
 */
import type { BacklogItem } from './api-types.ts';
import { assigneeOf, statusBadge } from './board-drawer.ts';

export type AgentTone = 'working' | 'blocked' | 'queued';

export type AgentRow = {
  handle: string;
  /** How many unfinished items this agent owns. */
  openCount: number;
  /** The agent's most-advanced open item (what to surface as "current"). */
  leadItemId: string;
  leadStatus: BacklogItem['status'];
  /** Human label for leadStatus (e.g. "In progress"). */
  statusLabel: string;
  tone: AgentTone;
};

/** How "advanced" each open status is — picks the agent's lead (current) item. */
const STATUS_RANK: Partial<Record<BacklogItem['status'], number>> = {
  in_progress: 5,
  test: 4,
  review: 3,
  blocked: 2,
  to_do: 1,
};

function toneFor(status: BacklogItem['status']): AgentTone {
  if (status === 'blocked') return 'blocked';
  if (status === 'in_progress' || status === 'test' || status === 'review') return 'working';
  return 'queued';
}

const TONE_RANK: Record<AgentTone, number> = { working: 2, blocked: 1, queued: 0 };

/**
 * Agents with unfinished work, most-active first. An item counts when it is not
 * an epic and not done/cancelled; its assignee (owner → frontmatter.assignee)
 * is the agent. Rows are sorted working → blocked → queued, then by how many
 * open items they hold, then by handle.
 */
export function deriveActiveAgents(items: BacklogItem[]): AgentRow[] {
  const byAgent = new Map<string, BacklogItem[]>();
  for (const it of items) {
    if (it.type === 'epic') continue;
    if (it.status === 'done' || it.status === 'cancelled') continue;
    const who = assigneeOf(it);
    if (!who) continue;
    const list = byAgent.get(who);
    if (list) list.push(it);
    else byAgent.set(who, [it]);
  }

  const rows: AgentRow[] = [];
  for (const [handle, list] of byAgent) {
    const lead = [...list].sort(
      (a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0),
    )[0]!;
    rows.push({
      handle,
      openCount: list.length,
      leadItemId: lead.id,
      leadStatus: lead.status,
      statusLabel: statusBadge(lead.status).label,
      tone: toneFor(lead.status),
    });
  }

  rows.sort(
    (a, b) =>
      TONE_RANK[b.tone] - TONE_RANK[a.tone] ||
      b.openCount - a.openCount ||
      a.handle.localeCompare(b.handle),
  );
  return rows;
}
