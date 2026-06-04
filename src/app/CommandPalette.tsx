/**
 * CommandPalette — the ⌘K overlay (wireframe `.overlay > .cmdk-box`).
 *
 * Opens on ⌘K / Ctrl+K or the topbar search trigger (`open-cmdk` event), and
 * searches live data: backlog items + epics (`/api/backlog`), personas
 * (`/api/personas`) and decisions (`/api/decisions`). Selecting a result
 * navigates to the route that owns it. Data is fetched on first open and cached
 * for the session.
 *
 * Keyboard: ↑/↓ move the highlight, Enter activates, Esc / backdrop-click close.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Search, SquareCheck, Bug, Recycle, Layers, User,
  GitCommitVertical, LayoutDashboard, SquareKanban, BookMarked, Brain, BookCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiGet } from '../lib/api.ts';
import type { BacklogItem, PersonaSummary, DecisionIndex } from '../lib/api-types.ts';
import { personaColor } from '../lib/persona-colors.ts';
import { useShellEvent } from './shell-events.ts';

type Entry = {
  key: string;
  section: string;
  icon: LucideIcon;
  iconColor?: string;
  id?: string;
  title: string;
  haystack: string;
  go: () => void;
};

const GO_ROUTES: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/board', label: 'Board', icon: SquareKanban },
  { to: '/references', label: 'References', icon: BookMarked },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/reports', label: 'Reports', icon: BookCheck },
];

const TYPE_ICON: Record<string, LucideIcon> = {
  task: SquareCheck, bug: Bug, debt: Recycle, spike: SquareCheck, hotfix: Bug,
};

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [decisions, setDecisions] = useState<DecisionIndex[]>([]);
  const loaded = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy-load the searchable corpus once, the first time the palette opens.
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    apiGet<{ items: BacklogItem[] }>('/api/backlog')
      .then((r) => setItems(r.items))
      .catch(() => undefined);
    apiGet<{ personas: PersonaSummary[] }>('/api/personas')
      .then((r) => setPersonas(r.personas))
      .catch(() => undefined);
    apiGet<{ decisions: DecisionIndex[] }>('/api/decisions')
      .then((r) => setDecisions(r.decisions))
      .catch(() => undefined);
  }, [open]);

  function show() {
    setQuery('');
    setSel(0);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }
  function close() {
    setOpen(false);
  }

  useShellEvent('open-cmdk', show);

  // ⌘K / Ctrl+K toggles; handled here so it works without the topbar focused.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else show();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Build the flat, filtered entry list grouped by section.
  const entries = useMemo<Entry[]>(() => {
    const q = query.toLowerCase().trim();
    const out: Entry[] = [];

    for (const it of items) {
      if (it.type === 'epic') continue;
      out.push({
        key: `item:${it.id}`,
        section: 'Items',
        icon: TYPE_ICON[it.type] ?? SquareCheck,
        id: it.id,
        title: it.title,
        haystack: `${it.id} ${it.title}`.toLowerCase(),
        go: () => navigate({ to: '/board' }),
      });
    }
    for (const ep of items) {
      if (ep.type !== 'epic') continue;
      out.push({
        key: `epic:${ep.id}`,
        section: 'Epics',
        icon: Layers,
        id: ep.id,
        title: ep.title,
        haystack: `${ep.id} ${ep.title}`.toLowerCase(),
        go: () => navigate({ to: '/board' }),
      });
    }
    for (const p of personas) {
      out.push({
        key: `persona:${p.handle}`,
        section: 'Agents',
        icon: User,
        iconColor: personaColor(p.handle),
        title: p.handle,
        haystack: `${p.handle} ${p.description}`.toLowerCase(),
        go: () => navigate({ to: '/kortext/agents' }),
      });
    }
    for (const d of decisions) {
      out.push({
        key: `decision:${d.decision_id}`,
        section: 'Decisions',
        icon: GitCommitVertical,
        id: d.decision_id,
        title: d.title,
        haystack: `${d.decision_id} ${d.title}`.toLowerCase(),
        go: () => navigate({ to: '/memory' }),
      });
    }
    for (const r of GO_ROUTES) {
      out.push({
        key: `go:${r.to}`,
        section: 'Go to',
        icon: r.icon,
        title: r.label,
        haystack: r.label.toLowerCase(),
        go: () => navigate({ to: r.to }),
      });
    }

    const filtered = q ? out.filter((e) => e.haystack.includes(q)) : out;
    // Cap noisy sections so the list stays scannable, like the wireframe's slice(0,6).
    const bySection = new Map<string, Entry[]>();
    for (const e of filtered) {
      const arr = bySection.get(e.section) ?? [];
      if (e.section === 'Items' && arr.length >= 6) continue;
      if (e.section === 'Agents' && arr.length >= 6) continue;
      arr.push(e);
      bySection.set(e.section, arr);
    }
    return [...bySection.values()].flat();
  }, [query, items, personas, decisions, navigate]);

  // Keep the highlight in range as the result set shrinks/grows.
  useEffect(() => {
    if (sel >= entries.length) setSel(Math.max(0, entries.length - 1));
  }, [entries.length, sel]);

  function activate(entry: Entry | undefined) {
    if (!entry) return;
    close();
    entry.go();
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(entries.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(entries[sel]);
    }
  }

  if (!open) return null;

  // Render sections with their headers, tracking the running flat index so the
  // keyboard highlight (`sel`) lines up with the rendered rows.
  let flatIndex = -1;
  let lastSection = '';
  const rows: ReactNode[] = [];
  for (const e of entries) {
    if (e.section !== lastSection) {
      lastSection = e.section;
      rows.push(
        <div className="cmdk-sec" key={`sec:${e.section}`}>
          {e.section}
        </div>,
      );
    }
    flatIndex += 1;
    const i = flatIndex;
    const Icon = e.icon;
    rows.push(
      <div
        key={e.key}
        className={`cmdk-item${i === sel ? ' sel' : ''}`}
        onMouseEnter={() => setSel(i)}
        onClick={() => activate(e)}
      >
        <Icon style={e.iconColor ? { color: e.iconColor } : undefined} />
        {e.id && <span className="ci-id">{e.id}</span>}
        <span className="ci-t">{e.title}</span>
      </div>,
    );
  }

  return (
    <div
      className="overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="cmdk-box">
        <div className="cmdk-head">
          <Search />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search items, epics, or go to…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="cmdk-list">
          {rows.length ? rows : <div className="cmdk-empty">No matches</div>}
        </div>
      </div>
    </div>
  );
}
