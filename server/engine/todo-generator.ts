import { writeFileSync } from 'node:fs';
import type { BacklogItem } from '../db/schemas.ts';
import type { Repositories } from '../db/repositories/index.ts';

/**
 * TODO.md generator (v1.0). Collapses the SQLite backlog into ONE consolidated,
 * human-readable checklist — the single living artifact the dashboard renders
 * and the external LLM ticks off. NO assignee / gate / dependency / acceptance
 * fields (those stay in foundation/backlog.yaml); task ORDER encodes the
 * dependency chain instead (a task never appears before something it is
 * blocked_by). Shape:
 *
 *   - [ ] v0.1
 *       - [ ] PROJ-E01 - Auth: epic goal
 *           - [ ] PROJ-001 - OAuth setup: task description
 *
 * IDs are the real backlog ids (PROJ-E01 / PROJ-001) so a TODO line maps back
 * to its foundation/backlog.yaml row — the link Eray asked for.
 */

const INDENT = '    '; // 4 spaces per nesting level

function box(done: boolean): string {
  return done ? '[x]' : '[ ]';
}

/** First non-empty line of a body, trimmed + truncated — the one-line summary. */
function summary(body: string): string {
  const line = (body ?? '')
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0);
  if (!line) return '';
  return line.length > 120 ? `${line.slice(0, 117).trimEnd()}…` : line;
}

/** `- [ ] ID - title` with an optional `: summary` suffix. */
function itemLine(item: BacklogItem, depth: number): string {
  const s = summary(item.body_md);
  return `${INDENT.repeat(depth)}- ${box(item.status === 'done')} ${item.id} - ${item.title}${s ? `: ${s}` : ''}`;
}

function blockedBy(item: BacklogItem): string[] {
  const bb = item.frontmatter?.['blocked_by'];
  return Array.isArray(bb) ? bb.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Order tasks so none precedes a task it is blocked_by (only intra-set edges
 * count). Stable: ties + cycles fall back to id order, so output is
 * deterministic and a dependency cycle never drops an item.
 * ponytail: O(n²) layer-peel — fine for a backlog (tens of items); swap for
 * Kahn's if a plan ever has thousands of tasks.
 */
export function orderByDependency(tasks: BacklogItem[]): BacklogItem[] {
  const ids = new Set(tasks.map((t) => t.id));
  const placed = new Set<string>();
  const out: BacklogItem[] = [];
  const byId = (a: BacklogItem, b: BacklogItem) => a.id.localeCompare(b.id);

  let progressed = true;
  while (out.length < tasks.length && progressed) {
    progressed = false;
    const ready = tasks
      .filter(
        (t) =>
          !placed.has(t.id) &&
          blockedBy(t)
            .filter((d) => ids.has(d))
            .every((d) => placed.has(d)),
      )
      .sort(byId);
    for (const t of ready) {
      out.push(t);
      placed.add(t.id);
      progressed = true;
    }
  }
  // Cycle / unresolved deps: append the rest in id order so nothing is lost.
  for (const t of tasks.filter((t) => !placed.has(t.id)).sort(byId)) out.push(t);
  return out;
}

/** Render one epic + its child tasks (tasks ordered by dependency). */
function renderEpic(epic: BacklogItem, tasks: BacklogItem[], lines: string[]): void {
  lines.push(itemLine(epic, 1));
  const children = orderByDependency(tasks.filter((t) => t.parent_id === epic.id));
  for (const t of children) lines.push(itemLine(t, 2));
}

/**
 * Build the consolidated TODO.md from all backlog items. Pure — unit-tested in
 * tests/todo-generator.test.ts.
 */
export function generateTodoMarkdown(items: BacklogItem[]): string {
  const live = items.filter((i) => i.status !== 'cancelled');
  const epics = live.filter((i) => i.type === 'epic');
  const tasks = live.filter((i) => i.type !== 'epic');

  // Versions ascending (v0.1 before v1.0); items with no version grouped last.
  const versions = [...new Set(epics.map((e) => e.version).filter((v): v is string => !!v))].sort();
  const orphanTaskVersions = [
    ...new Set(tasks.filter((t) => !t.parent_id).map((t) => t.version).filter((v): v is string => !!v)),
  ];
  const allVersions = [...new Set([...versions, ...orphanTaskVersions])].sort();

  const lines: string[] = ['# TODO', ''];

  const renderVersion = (version: string | null): void => {
    const vEpics = epics
      .filter((e) => e.version === version)
      .sort((a, b) => a.id.localeCompare(b.id));
    const vOrphans = orderByDependency(
      tasks.filter((t) => !t.parent_id && t.version === version),
    );
    if (vEpics.length === 0 && vOrphans.length === 0) return;

    // Version checkbox is "done" only when every item under it is done.
    const underDone = [...vEpics, ...vOrphans].every((i) => i.status === 'done');
    lines.push(`- ${box(underDone && (vEpics.length + vOrphans.length) > 0)} ${version ?? 'Unversioned'}`);
    for (const epic of vEpics) renderEpic(epic, tasks, lines);
    for (const t of vOrphans) lines.push(itemLine(t, 1));
    lines.push('');
  };

  for (const v of allVersions) renderVersion(v);
  // Anything with no version at all (defensive — structural floor usually
  // assigns one) goes under an "Unversioned" block.
  if (live.some((i) => !i.version)) renderVersion(null);

  return `${lines.join('\n').trimEnd()}\n`;
}

/** Query the live backlog and (over)write the consolidated TODO.md. */
export function writeTodoFromDb(repos: Repositories, absPath: string): void {
  const items = repos.backlog.list({ limit: 100_000 });
  writeFileSync(absPath, generateTodoMarkdown(items), 'utf8');
}
