/**
 * Drawer — right-side slide-over panel with a dimmed backdrop. General purpose:
 * item/epic detail (S3) and anything else that needs a contextual side panel.
 *
 * Maps to `.drawer-backdrop` / `.drawer` in wireframe-v6-hifi.html. The consumer
 * supplies the inner chrome (e.g. `.dr-head` / `.dr-body`). Closes on backdrop
 * click and Escape.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width in px (default 464, matching the item-detail drawer). */
  width?: number;
};

export function Drawer({ open, onClose, children, width = 464 }: DrawerProps) {
  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`drawer-backdrop${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`drawer${open ? ' open' : ''}`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        {children}
      </aside>
    </>
  );
}
