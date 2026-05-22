import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * UI shell state — which overlay panels are visible. Lives separately from
 * route state so users can keep the terminal open while navigating.
 */

type ShellState = {
  terminalOpen: boolean;
  timelineOpen: boolean;
  toggleTerminal: () => void;
  toggleTimeline: () => void;
  closeTerminal: () => void;
  closeTimeline: () => void;
};

const Ctx = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const value: ShellState = {
    terminalOpen,
    timelineOpen,
    toggleTerminal: () => setTerminalOpen((v) => !v),
    toggleTimeline: () => setTimelineOpen((v) => !v),
    closeTerminal: () => setTerminalOpen(false),
    closeTimeline: () => setTimelineOpen(false),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell(): ShellState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useShell called outside ShellProvider');
  return v;
}
