import {
  Outlet,
  Router,
  RootRoute,
  Route,
  createHashHistory,
} from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Header } from './components/Header.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Footer } from './components/Footer.tsx';
import { TerminalPanel } from './components/TerminalPanel.tsx';
import { TimelinePanel } from './components/TimelinePanel.tsx';
import { Toasts } from './components/Toasts.tsx';
import { ShellProvider } from './lib/shell-store.tsx';
import { PendingQuestionsProvider } from './lib/pending-questions.tsx';
import { DashboardRoute } from './routes/dashboard.tsx';
import { BoardRoute } from './routes/board.tsx';
import { MemoryRoute } from './routes/memory.tsx';
import { ReportsRoute } from './routes/reports.tsx';
import { ReferencesRoute } from './routes/references.tsx';
import { SettingsLayout } from './routes/settings.tsx';
import { OnboardingRoute } from './routes/onboarding.tsx';
import { OnboardingScreen } from './components/OnboardingScreen.tsx';
import { apiGet } from './lib/api.ts';
import type { BlueprintStatusResponse } from './lib/api-types.ts';
import {
  ProjectPane,
  AgentsPane,
  RulesPane,
  WorkflowsPane,
  HooksPane,
  IntegrationsPane,
  EnvironmentPane,
  DangerPane,
} from './routes/settings-panes.tsx';

type GuardState = 'loading' | 'onboarding' | 'app';

function useBlueprintGuard(): { state: GuardState; refresh: () => void } {
  const [state, setState] = useState<GuardState>('loading');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    apiGet<BlueprintStatusResponse>('/api/blueprint/status')
      .then((res) => {
        if (!alive) return;
        const needsOnboarding =
          res.status === 'uninitialized' ||
          res.status === 'draft' ||
          res.status === 'unknown';
        setState(needsOnboarding ? 'onboarding' : 'app');
      })
      .catch(() => {
        if (!alive) return;
        // If status endpoint fails (older server, network issue), default
        // to showing the app — the dashboard surfaces server health.
        setState('app');
      });
    return () => {
      alive = false;
    };
  }, [tick]);
  return { state, refresh: () => setTick((n) => n + 1) };
}

function RootShell() {
  const guard = useBlueprintGuard();
  if (guard.state === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-0 text-tx-3 text-[13px]">
        Loading…
      </div>
    );
  }
  if (guard.state === 'onboarding') {
    return <OnboardingScreen onDone={() => guard.refresh()} />;
  }
  return (
    <ShellProvider>
      <PendingQuestionsProvider>
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-0 text-tx-1">
          <Header />
          <div className="flex-1 flex min-h-0">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-bg-0 min-w-0">
              <Outlet />
            </main>
          </div>
          <Footer />
          <TerminalPanel />
          <TimelinePanel />
          <Toasts />
        </div>
      </PendingQuestionsProvider>
    </ShellProvider>
  );
}

const rootRoute = new RootRoute({ component: RootShell });

const dashboardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardRoute,
});

const onboardingRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingRoute,
});

const boardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/board',
  component: BoardRoute,
});

const memoryRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/memory',
  component: MemoryRoute,
});

const reportsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/reports',
  component: ReportsRoute,
});

const referencesRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/references',
  component: ReferencesRoute,
});

const settingsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsLayout,
});

const projectPaneRoute = new Route({
  getParentRoute: () => settingsRoute,
  path: '/project',
  component: ProjectPane,
});
const agentsPaneRoute = new Route({
  getParentRoute: () => settingsRoute,
  path: '/agents',
  component: AgentsPane,
});
const rulesPaneRoute = new Route({
  getParentRoute: () => settingsRoute,
  path: '/rules',
  component: RulesPane,
});
const workflowsPaneRoute = new Route({
  getParentRoute: () => settingsRoute,
  path: '/workflows',
  component: WorkflowsPane,
});
const hooksPaneRoute = new Route({
  getParentRoute: () => settingsRoute,
  path: '/hooks',
  component: HooksPane,
});
const integrationsPaneRoute = new Route({
  getParentRoute: () => settingsRoute,
  path: '/integrations',
  component: IntegrationsPane,
});
const environmentPaneRoute = new Route({
  getParentRoute: () => settingsRoute,
  path: '/environment',
  component: EnvironmentPane,
});
const dangerPaneRoute = new Route({
  getParentRoute: () => settingsRoute,
  path: '/danger',
  component: DangerPane,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  onboardingRoute,
  boardRoute,
  memoryRoute,
  reportsRoute,
  referencesRoute,
  settingsRoute.addChildren([
    projectPaneRoute,
    agentsPaneRoute,
    rulesPaneRoute,
    workflowsPaneRoute,
    hooksPaneRoute,
    integrationsPaneRoute,
    environmentPaneRoute,
    dangerPaneRoute,
  ]),
]);

export const router = new Router({
  routeTree,
  defaultPreload: 'intent',
  history: createHashHistory(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
