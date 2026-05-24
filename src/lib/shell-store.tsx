import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * UI shell state — which overlay panels are visible. Lives separately from
 * route state so users can keep the terminal open while navigating.
 */

type ShellState = {
  terminalOpen: boolean;
  timelineOpen: boolean;
  sidebarCollapsed: boolean;
  inboxOpen: boolean;
  toggleTerminal: () => void;
  toggleTimeline: () => void;
  toggleSidebar: () => void;
  toggleInbox: () => void;
  closeTerminal: () => void;
  closeTimeline: () => void;
  closeInbox: () => void;
};

const Ctx = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);

  const value: ShellState = {
    terminalOpen,
    timelineOpen,
    sidebarCollapsed,
    inboxOpen,
    toggleTerminal: () => setTerminalOpen((v) => !v),
    toggleTimeline: () => setTimelineOpen((v) => !v),
    toggleSidebar: () => setSidebarCollapsed((v) => !v),
    toggleInbox: () => setInboxOpen((v) => !v),
    closeTerminal: () => setTerminalOpen(false),
    closeTimeline: () => setTimelineOpen(false),
    closeInbox: () => setInboxOpen(false),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell(): ShellState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useShell called outside ShellProvider');
  return v;
}
