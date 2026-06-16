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

const WORKSPACE: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/board', label: 'Board', icon: SquareKanban },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/foundation', label: 'Foundation', icon: FolderRoot },
  { to: '/references', label: 'References', icon: FolderBookmark },
  { to: '/reports', label: 'Reports', icon: FolderCheck },
];

const PROJECT: NavItem[] = [
  { to: '/settings/project', label: 'Project info', icon: FolderOpen },
  { to: '/settings/integrations', label: 'Integrations', icon: Blocks },
  { to: '/settings/environments', label: 'Environments', icon: Layers },
];

const ENGINE: NavItem[] = [
  { to: '/kortext/llm-models', label: 'LLM models', icon: Cpu },
  { to: '/kortext/agents', label: 'Agents', icon: Bot },
  { to: '/kortext/rules', label: 'Rules', icon: Scale },
  { to: '/kortext/workflows', label: 'Workflows', icon: Workflow },
  { to: '/kortext/hooks', label: 'Hooks', icon: Webhook },
  { to: '/kortext/scripts', label: 'Scripts', icon: FileCode },
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

      {/* Workspace + Project (hidden under .engine-mode) */}
      <div className="side-scroll kx-scroll">
        <div className="side-sec">
          <div className="eyebrow">Workspace</div>
          {WORKSPACE.map((item) => (
            <NavLink key={item.to} item={item} active={isActive(item.to)} />
          ))}
        </div>
        <div className="side-sec">
          <div className="eyebrow">Project</div>
          {PROJECT.map((item) => (
            <NavLink key={item.to} item={item} active={isActive(item.to)} />
          ))}
        </div>
      </div>

      {/* Kortext · Engine (shown under .engine-mode) */}
      <div className="side-engine kx-scroll">
        <div className="side-sec">
          <div className="eyebrow">Kortext · Engine</div>
          {ENGINE.map((item) => (
            <NavLink key={item.to} item={item} active={isActive(item.to)} />
          ))}
        </div>
        <div className="side-sec">
          <Link
            to="/"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
          >
            <ArrowRight className="ic" />
            Open dashboard
          </Link>
        </div>
      </div>

      <div className="side-foot">
        <Link to="/kortext/llm-models" className="kx-settings">
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
