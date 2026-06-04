/**
 * Shell-level UI events — the decoupling layer between S1 chrome (Topbar /
 * Footer) and S6 overlays (CommandPalette / Notifications / Terminal / menus).
 *
 * The topbar/footer only *fire* these via `window.dispatchEvent`; the overlays
 * *listen* with `useShellEvent`. Neither side imports the other, so the two
 * parallel sessions never touch the same module.
 *
 * Menu/anchor events carry a `DOMRect` in `detail` so a popover can position
 * itself under the element that opened it (mirrors the wireframe's
 * `toggleMenu(id, anchor)` which read `anchor.getBoundingClientRect()`).
 */
import { useEffect } from 'react';

export type ShellEvent =
  | 'open-cmdk'
  | 'open-notifs'
  | 'open-terminal'
  | 'open-agents'
  | 'open-worktrees'
  | 'open-proj-menu'
  | 'open-ver-menu'
  | 'open-new-item';

/** Fire a shell event, optionally carrying an anchor rect for popovers. */
export function emitShell(name: ShellEvent, detail?: { rect: DOMRect }): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Subscribe to a shell event for the lifetime of the component. The handler
 * receives the `CustomEvent` so menu listeners can read `detail.rect`.
 */
export function useShellEvent(
  name: ShellEvent,
  handler: (e: CustomEvent<{ rect?: DOMRect } | undefined>) => void,
): void {
  useEffect(() => {
    const listener = handler as EventListener;
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  });
}
