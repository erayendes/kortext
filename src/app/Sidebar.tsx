/**
 * Sidebar — design-handoff navigation (app.js `shell()` side).
 *
 * Header: "kortext" wordmark + v3 pill + collapse toggle.
 * Body:   Workspace + Project sections (`.side-scroll`), swapped for the
 *         Kortext · Engine menu (`.side-engine`) under `/kortext/*` — the swap is
 *         driven by `.app.engine-mode`, set in AppShell from the URL.
 * Foot:   "kortext" engine entry (→ LLM Auth) + theme-cycle button.
 *
 * Menu is derived from the URL: the active nav item is the current route.
 */
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  SquareKanban,
  Brain,
  FolderRoot,
  FolderBookmark,
  FolderCheck,
  FolderOpen,
  Blocks,
  Layers,
  Cpu,
  Bot,
  Scale,
  Workflow,
  Webhook,
  FileCode,
  PanelLeft,
  ArrowRight,
  Cog,
  Sun,
  Moon,
  Eclipse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from './theme.ts';

type NavItem = { to: string; label: string; icon: LucideIcon };

// v1.0: Board (kanban execution view), Project settings nav, and the Kortext·Engine
// menu are gone — Kortext doesn't execute, so the dashboard is just the doc views.
const WORKSPACE: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/foundation', label: 'Foundation', icon: FolderRoot },
  { to: '/references', label: 'References', icon: FolderBookmark },
  { to: '/reports', label: 'Reports', icon: FolderCheck },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className={`nav-item${active ? ' active' : ''}`} title={item.label}>
      <Icon className="ic" />
      <span className="grow">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { mode, cycle } = useTheme();
  const ThemeIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Eclipse;
  const themeLabel = mode === 'system' ? 'auto (system)' : mode;

  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname === to);

  return (
    <aside className="sidebar">
      <div className="side-logo">
        <span className="side-logo-name">kortext</span>
        <span className="ver-pill side-logo-ver">v3</span>
        <button className="side-collapse" onClick={onToggleSidebar} title="Toggle sidebar">
          <PanelLeft className="ic" />
        </button>
      </div>

      <div className="side-scroll kx-scroll">
        <div className="side-sec">
          <div className="eyebrow">Workspace</div>
          {WORKSPACE.map((item) => (
            <NavLink key={item.to} item={item} active={isActive(item.to)} />
          ))}
        </div>
      </div>

      <div className="side-foot">
        {/* Project lifecycle + danger zone (archive / delete) */}
        <Link to="/settings/project" className="kx-settings">
          <Cog className="ic" />
          <span className="kx-set-t">kortext</span>
        </Link>
        <button
          className="icon-btn"
          onClick={cycle}
          title={`Theme: ${themeLabel} (click to cycle light · dark · auto)`}
          aria-label={`Theme: ${themeLabel}`}
        >
          <ThemeIcon className="ic" style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </aside>
  );
}
