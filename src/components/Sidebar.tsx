import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutGrid,
  KanbanSquare,
  Brain,
  FileText,
  BookOpen,
  Sliders,
  Users,
  Shield,
  GitBranch,
  Zap,
  Plug,
  Key,
  AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavLink = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const WORKSPACE: NavLink[] = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid },
  { to: '/board', label: 'Board', icon: KanbanSquare },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/references', label: 'References', icon: BookOpen },
];

const PROJECT: NavLink[] = [
  { to: '/settings/project', label: 'Project settings', icon: Sliders },
  { to: '/settings/agents', label: 'Agents', icon: Users },
  { to: '/settings/rules', label: 'Rules', icon: Shield },
  { to: '/settings/workflows', label: 'Workflows', icon: GitBranch },
];

const SYSTEM: NavLink[] = [
  { to: '/settings/hooks', label: 'Hooks', icon: Zap },
  { to: '/settings/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings/environment', label: 'Environment', icon: Key },
];

const DANGER: NavLink = { to: '/settings/danger', label: 'Danger zone', icon: AlertTriangle };

function NavItem({ link, active, danger }: { link: NavLink; active: boolean; danger?: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      to={link.to}
      className={[
        'relative flex items-center gap-[14px] px-5 h-[38px] text-[13px] font-medium transition-colors duration-200',
        active
          ? 'text-accent before:absolute before:left-0 before:top-[8px] before:h-[22px] before:w-[2px] before:bg-accent'
          : danger
            ? 'text-danger hover:text-danger'
            : 'text-tx-3 hover:text-tx-1',
      ].join(' ')}
    >
      <Icon size={24} strokeWidth={2} className="flex-shrink-0" />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

function GroupTitle({ children }: { children: string }) {
  return (
    <div className="px-5 pt-[14px] pb-1 text-[10px] font-normal uppercase tracking-[0.08em] text-tx-disabled">
      {children}
    </div>
  );
}

export function Sidebar() {
  const { location } = useRouterState();
  const path = location.pathname;
  const isActive = (to: string) =>
    to === '/' ? path === '/' : path === to || path.startsWith(to + '/');
  return (
    <aside
      className="border-r border-border-subtle bg-bg-1 flex flex-col py-3"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <GroupTitle>Workspace</GroupTitle>
      {WORKSPACE.map((link) => (
        <NavItem key={link.to} link={link} active={isActive(link.to)} />
      ))}

      <GroupTitle>Project</GroupTitle>
      {PROJECT.map((link) => (
        <NavItem key={link.to} link={link} active={isActive(link.to)} />
      ))}

      <GroupTitle>System</GroupTitle>
      {SYSTEM.map((link) => (
        <NavItem key={link.to} link={link} active={isActive(link.to)} />
      ))}

      <div className="flex-1" />

      <NavItem link={DANGER} active={isActive(DANGER.to)} danger />
    </aside>
  );
}
