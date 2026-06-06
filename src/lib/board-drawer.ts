/**
 * Pure helpers behind the Board detail drawers (Task drawer / Epic drawer).
 *
 * The drawer COMPONENTS are presentational and verified by screenshot against
 * the v4 wireframe; this file holds the bits with real logic — status→badge
 * mapping, the acceptance-criteria checklist derivation, epic child/progress
 * roll-ups, and date formatting — so they can be unit-tested in isolation.
 */
import type { ActivityEntry, BacklogItem, Gate } from './api-types.ts';

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

export type ChecklistItem = { text: string; done: boolean };

/**
 * Read an item's acceptance criteria from its frontmatter into a canonical
 * per-item checklist. Two stored shapes are supported so existing projects keep
 * working without a migration:
 *  - NEW   `acceptance_criteria: [{ text, done }]`            → used directly
 *  - LEGACY `acceptance_criteria: string[]` + `ac_done` count → the first
 *    `ac_done` items are marked done (count clamped into [0, length])
 *
 * Returns [] when the field is absent or not a non-empty array. This is the
 * single source of truth for AC state — the card, the drawer, and (later) the
 * mark/unmark endpoint all read through here, so callers never branch on shape.
 */
export function acChecklist(fm: Record<string, unknown>): ChecklistItem[] {
  const raw = fm.acceptance_criteria;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  // New shape: an array of { text, done } objects → take per-item flags.
  if (typeof raw[0] === 'object' && raw[0] !== null) {
    return raw.map((el) => {
      const o = el as { text?: unknown; done?: unknown };
      return { text: String(o.text ?? ''), done: Boolean(o.done) };
    });
  }

  // Legacy shape: an array of strings + an `ac_done` count → mark first N done.
  const done = typeof fm.ac_done === 'number' ? fm.ac_done : 0;
  const checked = Math.max(0, Math.min(done, raw.length));
  return raw.map((text, i) => ({ text: String(text), done: i < checked }));
}

/**
 * Resolve the persona handle responsible for an item. The engine sets the
 * `owner` column when it picks an item up, but the (headless) planning agents
 * never touch it — they write `assignee` into frontmatter. So owner wins when
 * present, otherwise we fall back to `frontmatter.assignee`. Returns null when
 * neither is a non-empty string (the card/drawer then render the "—" dash).
 */
export function assigneeOf(item: {
  owner: string | null;
  frontmatter: Record<string, unknown>;
}): string | null {
  if (item.owner) return item.owner;
  const fm = item.frontmatter?.assignee;
  return typeof fm === 'string' && fm.length > 0 ? fm : null;
}

// ---------------------------------------------------------------------------
// Version filter (Board · UAT §A)
//
// Planning assigns every item a `version` ("v0.1" … "v1.0"). The board filters
// to one version at a time, defaulting to the smallest version that still has
// open work. These versions sort numerically, NOT lexically — a plain string
// sort puts "v0.10" before "v0.2", which is wrong, so we parse dotted segments.
// ---------------------------------------------------------------------------

/** Parse "v0.10" → [0, 10], stripping the leading non-digit prefix. */
function versionSegments(v: string): number[] {
  const digits = v.replace(/^[^\d]*/, '');
  if (!digits) return [];
  return digits.split('.').map((s) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Compare two version labels by their dotted numeric segments, so
 * "v0.2" < "v0.10" < "v1.0". A missing trailing segment counts as zero
 * (v1 === v1.0). Suitable as an Array.sort comparator.
 */
export function compareVersions(a: string, b: string): number {
  const sa = versionSegments(a);
  const sb = versionSegments(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const diff = (sa[i] ?? 0) - (sb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The unique versions present across items, ascending; items without one drop. */
export function sortedVersions(items: BacklogItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (it.version) set.add(it.version);
  return [...set].sort(compareVersions);
}

/**
 * The version the board should open on: the smallest version that still has
 * unfinished (not done/cancelled) non-epic work. Returns null when every
 * version is complete, or there are no versions — the caller then shows all.
 */
export function defaultActiveVersion(items: BacklogItem[]): string | null {
  for (const v of sortedVersions(items)) {
    const hasOpen = items.some(
      (it) =>
        it.version === v &&
        it.type !== 'epic' &&
        it.status !== 'done' &&
        it.status !== 'cancelled',
    );
    if (hasOpen) return v;
  }
  return null;
}

/**
 * The distinct assignees across the board's non-epic items, alphabetical. Powers
 * the board's Assignee filter dropdown. Epics are excluded (rail-only); items
 * with no resolvable assignee are skipped.
 */
export function assigneesOf(items: BacklogItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) {
    if (it.type === 'epic') continue;
    const who = assigneeOf(it);
    if (who) set.add(who);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
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
  if (entry.action === 'item_ac_toggle') {
    const { text, done } = entry.payload;
    if (typeof text === 'string') {
      return `${entry.actor} ${done ? 'checked' : 'unchecked'} "${text}"`;
    }
  }
  if (entry.action === 'item_comment') {
    const { text } = entry.payload;
    if (typeof text === 'string') return `${entry.actor}: ${text}`;
  }
  if (entry.action === 'backlog.ingest') return `${entry.actor} added this item from planning`;
  // Humanise unknown action keys ("backlog.ingest" → "backlog ingest") so the
  // feed never shows a raw dotted identifier.
  return `${entry.actor} ${entry.action.replace(/[._]/g, ' ')}`;
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

// ---------------------------------------------------------------------------
// Board columns
//
// The board is five fixed workflow lanes; Epic is NOT a status — epics live in
// the left filter rail, tasks/bugs/debt flow through the columns. `blocked` is
// an orthogonal flag (DECISIONS §12.3), not its own column: a blocked item is
// drawn in the column it would return to on unblock (in_progress) with a red
// card flag, never in a separate "Blocked" lane.
// ---------------------------------------------------------------------------

export type BoardColumnKey = 'to_do' | 'in_progress' | 'test' | 'review' | 'done';

/** The five columns, left→right, each with its dot color (matches index.css). */
export const BOARD_COLUMNS: { key: BoardColumnKey; name: string; color: string }[] = [
  { key: 'to_do', name: 'To do', color: '#7B7F87' },
  { key: 'in_progress', name: 'In progress', color: '#D2A24C' },
  { key: 'test', name: 'Test', color: '#5E84D2' },
  { key: 'review', name: 'Review', color: '#9B82CE' },
  { key: 'done', name: 'Done', color: '#4CB782' },
];

/**
 * The board column an item belongs in. `blocked` folds into `in_progress`
 * (where unblock lands it); `cancelled` returns null (hidden from the board).
 */
export function columnKeyForStatus(status: BacklogItem['status']): BoardColumnKey | null {
  switch (status) {
    case 'to_do':
      return 'to_do';
    case 'in_progress':
    case 'blocked':
      return 'in_progress';
    case 'test':
      return 'test';
    case 'review':
      return 'review';
    case 'done':
      return 'done';
    default:
      return null; // cancelled
  }
}

export type BoardColumn = {
  key: BoardColumnKey;
  name: string;
  color: string;
  cards: BacklogItem[];
};

/**
 * Bucket backlog items into the five board columns, preserving input order.
 * Epics (rail-only) and cancelled items are dropped.
 */
export function boardColumns(items: BacklogItem[]): BoardColumn[] {
  const cols: BoardColumn[] = BOARD_COLUMNS.map((c) => ({ ...c, cards: [] }));
  const byKey = new Map(cols.map((c) => [c.key, c]));
  for (const it of items) {
    if (it.type === 'epic') continue;
    const key = columnKeyForStatus(it.status);
    if (!key) continue;
    byKey.get(key)!.cards.push(it);
  }
  return cols;
}

// ---------------------------------------------------------------------------
// Review gates (item-based · §11.4)
//
// An item carries `review_gates` — the SUBSET of the 5 gates that applies to it.
// Per-gate run telemetry (gate_runs) is not exposed by the board API, so a
// gate's state is derived from the item's own fields: a done item has cleared
// everything, and the AC (uat) gate tracks the acceptance-criteria checklist.
// Everything else reads "pending" until the item is done. Gates not selected
// are simply not shown — the card stays clean for the (common) zero-gate item.
// ---------------------------------------------------------------------------

export type GateState = 'passed' | 'pending';

/** Gate enum → its board pill abbreviation + full label. */
export const GATE_META: Record<Gate, { abbr: string; label: string }> = {
  uat: { abbr: 'AC', label: 'User acceptance' },
  quality_control: { abbr: 'QC', label: 'Quality control' },
  security_control: { abbr: 'SE', label: 'Security review' },
  design_review: { abbr: 'DS', label: 'Design review' },
  code_review: { abbr: 'CR', label: 'Code review' },
};

/** Canonical left→right gate order on the card strip and drawer. */
export const GATE_ORDER: Gate[] = [
  'uat',
  'quality_control',
  'security_control',
  'design_review',
  'code_review',
];

export type ItemGate = { gate: Gate; abbr: string; label: string; state: GateState };

/** True when an item has acceptance criteria and every one is checked. */
function allAcceptanceMet(item: BacklogItem): boolean {
  const ac = acChecklist(item.frontmatter);
  return ac.length > 0 && ac.every((c) => c.done);
}

/**
 * The item's applicable gates, in canonical order, each with a derived state.
 * Returns [] when no gates are selected.
 */
export function itemGates(item: BacklogItem): ItemGate[] {
  const selected = new Set(item.review_gates ?? []);
  const acMet = allAcceptanceMet(item);
  return GATE_ORDER.filter((g) => selected.has(g)).map((gate) => {
    const meta = GATE_META[gate];
    let state: GateState = 'pending';
    if (item.status === 'done') state = 'passed';
    else if (gate === 'uat' && acMet) state = 'passed';
    return { gate, abbr: meta.abbr, label: meta.label, state };
  });
}

/** Passed / total gate counts for the card's X/N strip counter. */
export function gateProgress(item: BacklogItem): { done: number; total: number } {
  const gates = itemGates(item);
  return { done: gates.filter((g) => g.state === 'passed').length, total: gates.length };
}

// ---------------------------------------------------------------------------
// Blocked-state introspection (read from the item's activity feed)
// ---------------------------------------------------------------------------

/** The newest audit entry recording a `block` transition, if any. */
function latestBlockEntry(activity: ActivityEntry[]): ActivityEntry | null {
  let best: ActivityEntry | null = null;
  for (const e of activity) {
    if (e.action !== 'item_transition') continue;
    if (e.payload?.transition !== 'block' && e.payload?.to !== 'blocked') continue;
    if (!best || e.created_at > best.created_at) best = e;
  }
  return best;
}

/** The reason captured when the item was last blocked (null if none / unset). */
export function blockReasonFromActivity(activity: ActivityEntry[]): string | null {
  const e = latestBlockEntry(activity);
  const reason = e?.payload?.reason;
  return typeof reason === 'string' && reason.length > 0 ? reason : null;
}

/**
 * The status a blocked item came from (the `from` of its last block move) — so
 * the drawer can show "In progress · blocked" rather than just "blocked".
 */
export function underlyingStatusFromActivity(
  activity: ActivityEntry[],
): BacklogItem['status'] | null {
  const from = latestBlockEntry(activity)?.payload?.from;
  return typeof from === 'string' ? (from as BacklogItem['status']) : null;
}

// ---------------------------------------------------------------------------
// Dependencies (parsed from the body's `## Dependencies` section)
// ---------------------------------------------------------------------------

const ITEM_ID_RE = /\b([A-Z]-?\d{1,4})\b/g;

function idsFromDepLine(line: string): string[] {
  // Drop unfilled "[task-id]" placeholders, then pull item-id tokens (T07, B-203).
  const cleaned = line.replace(/\[[^\]]*\]/g, '');
  return [...cleaned.matchAll(ITEM_ID_RE)].map((m) => m[1]!);
}

/**
 * Extract `Blocks` / `Blocked By` item ids from the `## Dependencies` section.
 * Untouched template placeholders (`[task-id]`) yield empty arrays.
 */
export function dependenciesFromBody(md: string): { blocks: string[]; blockedBy: string[] } {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s+dependencies\s*$/i.test(l.trim()));
  const out = { blocks: [] as string[], blockedBy: [] as string[] };
  if (start === -1) return out;

  for (let i = start + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (/^#{1,6}\s/.test(line)) break;
    if (/blocked\s*by/i.test(line)) out.blockedBy.push(...idsFromDepLine(line));
    else if (/blocks/i.test(line)) out.blocks.push(...idsFromDepLine(line));
  }
  return out;
}
