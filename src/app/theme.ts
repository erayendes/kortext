/**
 * Theme — light / dark / system (auto) for the kortext shell.
 *
 * Follows the design-handoff model: the design system (src/index.css) is
 * light-first (`:root`) and switches to dark via `[data-theme="dark"]` on
 * <html>. This module owns that attribute plus a persisted *mode*:
 *
 *   - 'light' / 'dark' — explicit, fixed.
 *   - 'system'         — follows the OS `prefers-color-scheme` live.
 *
 * `data-theme` always reflects the *resolved* light|dark value so the CSS only
 * ever sees those two. The chosen mode is persisted under `kortext-theme`.
 * `initTheme()` runs before React mounts (main.tsx) to avoid a wrong-theme flash.
 */
import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
/** @deprecated use ThemeMode — kept for call-site back-compat. */
export type Theme = ThemeMode;

const STORAGE_KEY = 'kortext-theme';
const MODES: ThemeMode[] = ['light', 'dark', 'system'];

/** Read the persisted mode; default to 'system' (auto). */
export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Does the OS currently prefer dark? */
function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Resolve a mode to the concrete light|dark the CSS reads. */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

/** Set <html data-theme> to the resolved value for `mode`. */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(mode));
}

/** Persist + apply. */
export function setStoredTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore — private mode / disabled storage still applies in-memory */
  }
  applyTheme(mode);
}

/** Apply the persisted mode. Call once before first paint. */
export function initTheme(): void {
  applyTheme(getStoredTheme());
}

/**
 * React hook: current mode + a 3-way cycle (light → dark → system). While in
 * 'system' it tracks OS changes live. The sidebar theme button uses this.
 */
export function useTheme(): { mode: ThemeMode; theme: 'light' | 'dark'; cycle: () => void } {
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme);

  // Apply on mode change + persist.
  useEffect(() => {
    setStoredTheme(mode);
  }, [mode]);

  // While 'system', re-resolve whenever the OS preference flips.
  useEffect(() => {
    if (mode !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const cycle = useCallback(() => {
    setMode((prev) => MODES[(MODES.indexOf(prev) + 1) % MODES.length]!);
  }, []);

  return { mode, theme: resolveTheme(mode), cycle };
}
