import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router.tsx';
import { initTheme } from './app/theme.ts';
import { OnboardingScreen } from './components/OnboardingScreen.tsx';
import { apiGet } from './lib/api.ts';
import type { BlueprintStatusResponse } from './lib/api-types.ts';
import './index.css';

// Apply the persisted theme before first paint to avoid a light/dark flash.
initTheme();

// Hash-router deep-link normalizer. The app uses hash history, so the canonical
// URL form is `/#/route`. If the page loads on a *bare* path with no hash — a
// bookmarked/typed `/initializing`, or index.html served for a deep path — the
// hash is empty and the router boots at `/` (Dashboard). Rewrite the bare deep
// link into its hash form ONCE, before the router mounts, so direct navigation
// lands on the right screen. This also resets pathname to `/`, so later `<Link>`
// clicks produce clean `/#/route` URLs instead of `/initializing#/board`.
{
  const { pathname, search, hash } = window.location;
  if (pathname !== '/' && !hash) {
    window.history.replaceState(null, '', `/#${pathname}${search}`);
  }
}

type GateState = 'loading' | 'onboarding' | 'app';

/**
 * RootGate — blueprint guard at the app root. Until the project's blueprint is
 * `approved`, the full-screen onboarding wizard is shown instead of the shell;
 * once approved (or on a status error, where the dashboard surfaces health) the
 * normal router/AppShell renders.
 *
 * The gate lives here (not in router.tsx) so screen sessions own the router
 * exclusively — per the v6 implementation contract.
 */
function RootGate() {
  const [gate, setGate] = useState<GateState>('loading');

  const check = useCallback(() => {
    let alive = true;
    apiGet<BlueprintStatusResponse>('/api/blueprint/status')
      .then((res) => {
        if (!alive) return;
        setGate(res.status === 'approved' ? 'app' : 'onboarding');
      })
      .catch(() => {
        // Status endpoint unreachable (older server / network) — fall through
        // to the app; the dashboard surfaces server health.
        if (alive) setGate('app');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => check(), [check]);

  if (gate === 'loading') {
    return (
      <div className="ob-root" style={{ color: 'var(--fg-faint)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }
  if (gate === 'onboarding') {
    return <OnboardingScreen onDone={() => check()} />;
  }
  return <RouterProvider router={router} />;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

// Reuse a single root across Vite HMR module re-executions. Without this,
// each hot update re-runs `createRoot(rootEl)` on a container that already
// has a root, which React rejects with a "container already passed" warning
// (dev-only, but it pollutes the console and can double-mount). In production
// this module runs exactly once, so the cache is simply a no-op.
const rootCache = window as unknown as { __kortextRoot?: ReturnType<typeof createRoot> };
const root = rootCache.__kortextRoot ?? createRoot(rootEl);
rootCache.__kortextRoot = root;

root.render(
  <StrictMode>
    <RootGate />
  </StrictMode>,
);
