import {
  Outlet,
  Router,
  RootRoute,
  Route,
  createHashHistory,
} from '@tanstack/react-router';
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

function RootShell() {
  return (
    <ShellProvider>
      <PendingQuestionsProvider>
        <div className="flex h-screen w-screen overflow-hidden bg-bg-0 text-tx-1">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 overflow-y-auto bg-bg-0">
              <Outlet />
            </main>
            <Footer />
          </div>
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
