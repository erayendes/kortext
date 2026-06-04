/**
 * AppShell — the v6 root layout: topbar / [sidebar + routed main] / footer.
 *
 * It owns only shell-level state (sidebar collapse). Which sidebar menu shows
 * (project vs engine) is derived from the URL inside `Sidebar`, and theme lives
 * in `theme.ts`. Routed pages render into `<Outlet/>` inside `#main`.
 *
 * Structure mirrors wireframe-v6-hifi.html: a full-height flex column where the
 * topbar/footer are fixed-height and `#shell` flexes to fill the middle.
 */
import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { Topbar } from './Topbar.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Footer } from './Footer.tsx';
import { CommandPalette } from './CommandPalette.tsx';
import { Notifications } from './Notifications.tsx';
import { Terminal } from './Terminal.tsx';
import { ShellMenus } from './ShellMenus.tsx';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Topbar onToggleSidebar={() => setCollapsed((v) => !v)} />
      <div id="shell">
        <Sidebar collapsed={collapsed} />
        <main id="main">
          <Outlet />
        </main>
      </div>
      <Footer />

      {/* Global chrome (S6) — event-driven overlays mounted once, app-wide. */}
      <CommandPalette />
      <Notifications />
      <Terminal />
      <ShellMenus />
    </div>
  );
}
