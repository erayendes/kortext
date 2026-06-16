/**
 * AppShell — the design-handoff root layout.
 *
 * Structure mirrors design_handoff_kortext (app.js `shell()` + app.css `.app`):
 * a CSS grid where the sidebar spans full height (grid-row 1/3) and the topbar +
 * footer live in column 2. The theme toggle and engine entry live in the sidebar
 * foot; the footer carries daemon/agents/worktrees/review/terminal status.
 *
 *   .app[.kx-collapsed][.engine-mode]
 *     ├─ Sidebar            (grid-row 1/3)
 *     ├─ .main-col          (Topbar + .content → <Outlet/>)
 *     └─ Footer             (grid-column 2)
 *
 * Sidebar collapse is local UI state. Engine scope is derived from the URL
 * (`/kortext/*`) and toggles `.engine-mode`, which swaps the sidebar menu.
 */
import { Outlet, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { Topbar } from './Topbar.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Footer } from './Footer.tsx';
import { CommandPalette } from './CommandPalette.tsx';
import { Notifications } from './Notifications.tsx';
import { Terminal } from './Terminal.tsx';
import { ShellMenus } from './ShellMenus.tsx';
import { ItemDrawerHost } from './ItemDrawerHost.tsx';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const engineScope = useRouterState({
    select: (s) => s.location.pathname.startsWith('/kortext'),
  });

  const appClass = ['app', collapsed && 'kx-collapsed', engineScope && 'engine-mode']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={appClass}>
      <Sidebar onToggleSidebar={() => setCollapsed((v) => !v)} />
      <div className="main-col">
        <Topbar />
        <div className="content kx-scroll" id="content">
          <Outlet />
        </div>
      </div>
      <Footer />

      {/* Global chrome — event-driven overlays mounted once, app-wide. */}
      <CommandPalette />
      <Notifications />
      <Terminal />
      <ShellMenus />
      <ItemDrawerHost />
    </div>
  );
}
