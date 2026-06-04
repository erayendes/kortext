/**
 * Sidebar — contextual navigation. Its menu is *derived from the URL*: under
 * `/kortext/*` it shows the engine ("MOTOR") menu with a back-link to the
 * project; everywhere else it shows the project workspace menu.
 *
 * Replaces the wireframe's imperative `enterKortext` / `exitKortext` sidebar
 * swap — here the active route decides which `<nav>` set renders.
 */
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  SquareKanban,
  BookMarked,
  Brain,
  BookCheck,
  Flag,
  Unplug,
  Construction,
  Bot,
  ArrowLeft,
  KeyRound,
  BookAlert,
  Workflow,
  BellRing,
  Webhook,
  FileCode,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavItem = { to: string; label: string; icon: LucideIcon };
type NavSection = { heading?: string; items: NavItem[] };

/** Project name shown as the engine-menu back-link (static for S1). */
const PROJECT_NAME = 'Acme CRM';

const PROJECT_NAV: NavSection[] = [
  {
    heading: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/board', label: 'Board', icon: SquareKanban },
      { to: '/references', label: 'References', icon: BookMarked },
      { to: '/memory', label: 'Memory', icon: Brain },
      { to: '/reports', label: 'Reports', icon: BookCheck },
    ],
  },
  {
    heading: 'Project settings',
    items: [
      { to: '/settings/project', label: 'Project info', icon: Flag },
      { to: '/settings/integrations', label: 'Integrations', icon: Unplug },
      { to: '/settings/environments', label: 'Environments', icon: Construction },
      { to: '/settings/agent-models', label: 'Agent models', icon: Bot },
    ],
  },
];

const ENGINE_NAV: NavSection[] = [
  {
    heading: 'Kortext · engine',
    items: [
      { to: '/kortext/llm-auth', label: 'LLM Auth', icon: KeyRound },
      { to: '/kortext/agents', label: 'Agents', icon: Bot },
      { to: '/kortext/rules', label: 'Rules', icon: BookAlert },
      { to: '/kortext/workflows', label: 'Workflows', icon: Workflow },
      { to: '/kortext/notifications', label: 'Notifications', icon: BellRing },
      { to: '/kortext/hooks', label: 'Hooks', icon: Webhook },
      { to: '/kortext/scripts', label: 'Scripts', icon: FileCode },
    ],
  },
];

function NavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className={`nav${active ? ' active' : ''}`}>
      <Icon />
      <span className="nav-lbl">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const engineScope = pathname.startsWith('/kortext');

  const sections = engineScope ? ENGINE_NAV : PROJECT_NAV;

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {engineScope && (
        <Link to="/" className="nav" style={{ color: 'var(--fg-muted)' }}>
          <ArrowLeft />
          <span className="nav-lbl">{PROJECT_NAME}</span>
        </Link>
      )}
      {sections.map((section, i) => (
        <div key={section.heading ?? i}>
          {section.heading && <div className="nav-sec">{section.heading}</div>}
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              active={
                item.to === '/' ? pathname === '/' : pathname === item.to
              }
            />
          ))}
        </div>
      ))}
    </aside>
  );
}
