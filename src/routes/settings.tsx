import { Outlet, useRouterState } from '@tanstack/react-router';

export function SettingsLayout() {
  const { location } = useRouterState();
  // Show breadcrumb of current pane
  const segments = location.pathname.split('/').filter(Boolean);
  const pane = segments[1] ?? 'project';
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border-subtle flex items-center gap-2 text-[12px] text-tx-3">
        <span>Settings</span>
        <span className="text-tx-disabled">/</span>
        <span className="text-tx-2 capitalize">{pane}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
