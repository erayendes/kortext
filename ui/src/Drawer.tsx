/**
 * Right-side panel with a dimmed backdrop. The caller supplies its contents.
 * Close on backdrop click or Escape.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width in pixels. Default 464. */
  width?: number;
};

/** A modal takes the focus when it opens and hands it back to whatever opened it. */
export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => opener?.focus();
  }, [open, ref]);
}

export function Drawer({ open, onClose, children, width = 464 }: DrawerProps) {
  const panel = useRef<HTMLElement>(null);
  useModalFocus(open, panel);
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
        ref={panel}
        tabIndex={-1}
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
