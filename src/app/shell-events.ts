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
  | 'open-review'
  | 'open-item'
  | 'open-proj-menu'
  | 'open-ver-menu'
  | 'open-new-item';

/** Payload a shell event may carry: an anchor rect (popovers) and/or item id. */
export type ShellDetail = { rect?: DOMRect; id?: string };

/** Fire a shell event, optionally carrying an anchor rect / item id. */
export function emitShell(name: ShellEvent, detail?: ShellDetail): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Subscribe to a shell event for the lifetime of the component. The handler
 * receives the `CustomEvent` so listeners can read `detail.rect` / `detail.id`.
 */
export function useShellEvent(
  name: ShellEvent,
  handler: (e: CustomEvent<ShellDetail | undefined>) => void,
): void {
  useEffect(() => {
    const listener = handler as (e: Event) => void;
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  });
}
