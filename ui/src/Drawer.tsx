/**
 * Right-side panel with a dimmed backdrop. The caller supplies its contents.
 * Close on backdrop click or Escape.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width in pixels. Default 464. */
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
      <div className={`drawer-backdrop${open ? ' open' : ''}`} onClick={onClose} aria-hidden />
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
