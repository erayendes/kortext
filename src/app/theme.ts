/**
 * Theme — light/dark toggle for the v6 shell.
 *
 * The v6 design system (src/index.css) is dark by default (`:root` tokens) and
 * switches to light via an `html.light` class override. This module owns that
 * single class plus its persistence in localStorage.
 *
 * - Default: dark (no class).
 * - Persisted under `kortext-theme`.
 * - `initTheme()` runs before React mounts (main.tsx) to avoid a flash of the
 *   wrong theme on reload.
 */
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'kortext-theme';

/** Read the persisted theme; default to dark. */
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Toggle the `html.light` class to match `theme` (dark = no class). */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('light', theme === 'light');
}

/** Persist + apply. */
export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore — private mode / disabled storage still applies in-memory */
  }
  applyTheme(theme);
}

/** Apply the persisted theme. Call once before first paint. */
export function initTheme(): void {
  applyTheme(getStoredTheme());
}

/**
 * React hook: current theme + a toggle. The footer theme button uses this.
 * Keeps the DOM class in sync whenever the value changes.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
