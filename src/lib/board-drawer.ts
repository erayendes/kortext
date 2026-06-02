/**
 * Pure helpers behind the Board detail drawers (Task drawer / Epic drawer).
 *
 * The drawer COMPONENTS are presentational and verified by screenshot against
 * the v4 wireframe; this file holds the bits with real logic — status→badge
 * mapping, the acceptance-criteria checklist derivation, epic child/progress
 * roll-ups, and date formatting — so they can be unit-tested in isolation.
 */
import type { BacklogItem } from './api-types.ts';

export type BadgeTone =
  | 'purple'
  | 'pink'
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'neutral';

/**
 * Map a backlog status to its drawer badge. Tones are chosen to match each
 * status's board-column dot color (in_progress = pink/signal, test = blue/info,
 * review = amber/warning, done = green/success) so the board and drawers agree.
 */
export function statusBadge(status: BacklogItem['status']): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'in_progress':
      return { label: 'In progress', tone: 'pink' };
    case 'done':
      return { label: 'Done', tone: 'green' };
    case 'review':
      return { label: 'Review', tone: 'amber' };
    case 'test':
      return { label: 'Test', tone: 'blue' };
    case 'blocked':
      return { label: 'Blocked', tone: 'red' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
    case 'to_do':
    default:
      return { label: 'To do', tone: 'neutral' };
  }
}

/**
 * Turn an acceptance-criteria list + a done COUNT into a per-item checklist.
 * The data model stores `ac_done` as a count (not per-criterion flags), so we
 * mark the first `done` items checked. `done` is clamped into [0, length].
 */
export function acChecklist(criteria: string[], done: number): { text: string; done: boolean }[] {
  const checked = Math.max(0, Math.min(done, criteria.length));
  return criteria.map((text, i) => ({ text, done: i < checked }));
}

/** All items parented to the given epic, in their original order. */
export function childrenOf(items: BacklogItem[], epicId: string): BacklogItem[] {
  return items.filter((it) => it.parent_id === epicId);
}

/** Total / done child counts + rounded percent for an epic (0% when empty). */
export function epicProgress(
  items: BacklogItem[],
  epicId: string,
): { total: number; done: number; pct: number } {
  const children = childrenOf(items, epicId);
  const total = children.length;
  const done = children.filter((it) => it.status === 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}

/** Epoch (ms) → 'YYYY-MM-DD' in UTC (stable across timezones). */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pull a plain description out of an item's Markdown body for the drawer.
 *
 * Kortext template bodies carry a `## Description` section (the real prose
 * lives there), so we prefer that section's content. Demo/simple bodies just
 * have a leading `# Title` heading that duplicates the drawer h3, so we drop
 * it. An unfilled bracketed placeholder (`[…]`) counts as no description.
 */
export function descriptionFromBody(md: string): string {
  const trimmed = md.trim();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');

  let body: string;
  const descStart = lines.findIndex((l) => /^#{1,6}\s+description\s*$/i.test(l.trim()));
  if (descStart !== -1) {
    const rest = lines.slice(descStart + 1);
    const nextHeading = rest.findIndex((l) => /^#{1,6}\s/.test(l.trim()));
    body = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).join('\n').trim();
  } else if ((lines[0] ?? '').trim().startsWith('#')) {
    body = lines.slice(1).join('\n').trim();
  } else {
    body = trimmed;
  }

  // A lone "[placeholder]" means the description hasn't been written yet.
  if (/^\[[\s\S]*\]$/.test(body)) return '';
  return body;
}

export type BoardTransition =
  | 'start'
  | 'test'
  | 'review'
  | 'bounce'
  | 'done'
  | 'block'
  | 'unblock';

/**
 * The legal human-override moves from a given status — mirrors the backend
 * ItemLifecycle TRANSITIONS so the drawer only ever offers buttons the engine
 * will accept. `primary` marks the forward move (styled as the primary button);
 * terminal states (done/cancelled) offer nothing. Keep in sync with
 * server/engine/item-lifecycle.ts.
 */
export function availableTransitions(
  status: BacklogItem['status'],
): { action: BoardTransition; label: string; primary: boolean }[] {
  switch (status) {
    case 'to_do':
      return [{ action: 'start', label: 'Start', primary: true }];
    case 'in_progress':
      return [
        { action: 'test', label: 'Send to test', primary: true },
        { action: 'block', label: 'Mark blocked', primary: false },
      ];
    case 'test':
      return [
        { action: 'review', label: 'Move to review', primary: true },
        { action: 'bounce', label: 'Bounce back', primary: false },
        { action: 'block', label: 'Mark blocked', primary: false },
      ];
    case 'review':
      return [
        { action: 'done', label: 'Mark done', primary: true },
        { action: 'bounce', label: 'Bounce back', primary: false },
        { action: 'block', label: 'Mark blocked', primary: false },
      ];
    case 'blocked':
      return [{ action: 'unblock', label: 'Unblock', primary: true }];
    default:
      return []; // done, cancelled — terminal
  }
}

/**
 * Render one audit-log entry as a human activity line for the drawer.
 * Status transitions get a readable "moved X → Y" form (reusing the status
 * labels); anything else falls back to "actor action".
 */
export function describeActivity(entry: {
  actor: string;
  action: string;
  payload: Record<string, unknown>;
}): string {
  if (entry.action === 'item_transition') {
    const { from, to } = entry.payload;
    if (typeof from === 'string' && typeof to === 'string') {
      return `${entry.actor} moved ${statusBadge(from as BacklogItem['status']).label} → ${statusBadge(to as BacklogItem['status']).label}`;
    }
  }
  return `${entry.actor} ${entry.action}`;
}

/**
 * Extract a markdown checklist ("- [ ] item" / "- [x] item") from under a named
 * `## Section` heading, stopping at the next heading. Used to surface the
 * template body's Review Gates in the drawer the same way other content shows.
 * Returns [] when the section is absent.
 */
export function checklistFromSection(
  md: string,
  section: string,
): { text: string; done: boolean }[] {
  const lines = md.split('\n');
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'i');
  const start = lines.findIndex((l) => headingRe.test(l.trim()));
  if (start === -1) return [];

  const out: { text: string; done: boolean }[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (/^#{1,6}\s/.test(line)) break; // next heading ends the section
    const m = line.match(/^[-*]\s*\[([ xX])\]\s+(.*)$/);
    if (m) out.push({ text: (m[2] ?? '').trim(), done: (m[1] ?? '').toLowerCase() === 'x' });
  }
  return out;
}
