import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  KanbanSquare,
  Brain,
  FileBarChart,
  BookOpen,
  Settings as SettingsIcon,
  Bot,
  ScrollText,
  Workflow,
  Webhook,
  Plug,
  Server,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  search?: Record<string, string>;
};

const WORKSPACE: NavLink[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/board', label: 'Board', icon: KanbanSquare },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/references', label: 'References', icon: BookOpen },
];

const PROJECT: NavLink[] = [
  { to: '/settings/project', label: 'Project settings', icon: SettingsIcon },
  { to: '/settings/agents', label: 'Agents', icon: Bot },
  { to: '/settings/rules', label: 'Rules', icon: ScrollText },
  { to: '/settings/workflows', label: 'Workflows', icon: Workflow },
];

const SYSTEM: NavLink[] = [
  { to: '/settings/hooks', label: 'Hooks', icon: Webhook },
  { to: '/settings/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings/environment', label: 'Environment', icon: Server },
];

const DANGER: NavLink[] = [
  { to: '/settings/danger', label: 'Danger zone', icon: AlertTriangle },
];

function NavItem({ link, active }: { link: NavLink; active: boolean }) {
  const Icon = link.icon;
  const danger = link.to === '/settings/danger';
  return (
    <Link
      to={link.to}
      className={[
        'relative flex items-center gap-3 px-5 h-[38px] text-[13px] transition-colors duration-200',
        active
          ? 'text-accent before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-accent before:rounded-r'
          : danger
            ? 'text-danger hover:bg-bg-2'
            : 'text-tx-3 hover:text-tx-1 hover:bg-bg-2',
      ].join(' ')}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

function Group({ title, links, currentPath }: { title: string; links: NavLink[]; currentPath: string }) {
  return (
    <div className="mt-4">
      <div className="px-5 mb-1 text-[10px] uppercase tracking-[0.12em] text-tx-3 font-medium">
        {title}
      </div>
      <nav className="flex flex-col">
        {links.map((link) => (
          <NavItem
            key={link.to}
            link={link}
            active={
              link.to === '/'
                ? currentPath === '/'
                : currentPath === link.to || currentPath.startsWith(link.to + '/')
            }
          />
        ))}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const { location } = useRouterState();
  const path = location.pathname;
  return (
    <aside
      className="border-r border-border-subtle bg-bg-1 flex flex-col"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <div className="h-[var(--header-h)] flex items-center gap-2 px-5 border-b border-border-subtle">
        <Sparkles size={16} className="text-accent" />
        <span className="font-semibold tracking-tight">Kortext</span>
        <span className="mono text-[10px] text-tx-3 ml-1">v3</span>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <Group title="Workspace" links={WORKSPACE} currentPath={path} />
        <Group title="Project" links={PROJECT} currentPath={path} />
        <Group title="System" links={SYSTEM} currentPath={path} />
        <Group title="" links={DANGER} currentPath={path} />
      </div>
    </aside>
  );
}
