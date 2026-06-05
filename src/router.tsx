/**
 * Router — v6 route tree. `AppShell` is the root layout (topbar / sidebar /
 * footer / <Outlet/>); every contract route is a flat child bound to its page.
 *
 * Hash history keeps the app file-servable without server rewrites. Routes are
 * declared as explicit consts so their path literals are inferred into the
 * registered router type — that's what gives `<Link to="…">` its autocomplete
 * and type-safety. Screen sessions fill the page stubs but must NOT touch this
 * file (route ownership lives in the v6 implementation contract).
 */
import { Router, RootRoute, Route, createHashHistory } from '@tanstack/react-router';
import { AppShell } from './app/AppShell.tsx';

// Project scope
import { DashboardRoute } from './routes/dashboard.tsx';
import { InitializingRoute } from './routes/initializing.tsx';
import { BoardRoute } from './routes/board.tsx';
import { ReferencesRoute } from './routes/references.tsx';
import { MemoryRoute } from './routes/memory.tsx';
import { ReportsRoute } from './routes/reports.tsx';
import { ProjectInfoRoute } from './routes/settings/project-info.tsx';
import { IntegrationsRoute } from './routes/settings/integrations.tsx';
import { EnvironmentsRoute } from './routes/settings/environments.tsx';
import { AgentModelsRoute } from './routes/settings/agent-models.tsx';

// Engine scope (Kortext)
import { LlmAuthRoute } from './routes/kortext/llm-auth.tsx';
import { KortextAgentsRoute } from './routes/kortext/agents.tsx';
import { RulesRoute } from './routes/kortext/rules.tsx';
import { WorkflowsRoute } from './routes/kortext/workflows.tsx';
import { NotificationsRoute } from './routes/kortext/notifications.tsx';
import { HooksRoute } from './routes/kortext/hooks.tsx';
import { ScriptsRoute } from './routes/kortext/scripts.tsx';

const rootRoute = new RootRoute({ component: AppShell });

// --- project scope ---
const dashboardRoute = new Route({ getParentRoute: () => rootRoute, path: '/', component: DashboardRoute });
const initializingRoute = new Route({ getParentRoute: () => rootRoute, path: '/initializing', component: InitializingRoute });
const boardRoute = new Route({ getParentRoute: () => rootRoute, path: '/board', component: BoardRoute });
const referencesRoute = new Route({ getParentRoute: () => rootRoute, path: '/references', component: ReferencesRoute });
const memoryRoute = new Route({ getParentRoute: () => rootRoute, path: '/memory', component: MemoryRoute });
const reportsRoute = new Route({ getParentRoute: () => rootRoute, path: '/reports', component: ReportsRoute });
const projectInfoRoute = new Route({ getParentRoute: () => rootRoute, path: '/settings/project', component: ProjectInfoRoute });
const integrationsRoute = new Route({ getParentRoute: () => rootRoute, path: '/settings/integrations', component: IntegrationsRoute });
const environmentsRoute = new Route({ getParentRoute: () => rootRoute, path: '/settings/environments', component: EnvironmentsRoute });
const agentModelsRoute = new Route({ getParentRoute: () => rootRoute, path: '/settings/agent-models', component: AgentModelsRoute });

// --- engine scope ---
const llmAuthRoute = new Route({ getParentRoute: () => rootRoute, path: '/kortext/llm-auth', component: LlmAuthRoute });
const kortextAgentsRoute = new Route({ getParentRoute: () => rootRoute, path: '/kortext/agents', component: KortextAgentsRoute });
const rulesRoute = new Route({ getParentRoute: () => rootRoute, path: '/kortext/rules', component: RulesRoute });
const workflowsRoute = new Route({ getParentRoute: () => rootRoute, path: '/kortext/workflows', component: WorkflowsRoute });
const notificationsRoute = new Route({ getParentRoute: () => rootRoute, path: '/kortext/notifications', component: NotificationsRoute });
const hooksRoute = new Route({ getParentRoute: () => rootRoute, path: '/kortext/hooks', component: HooksRoute });
const scriptsRoute = new Route({ getParentRoute: () => rootRoute, path: '/kortext/scripts', component: ScriptsRoute });

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  initializingRoute,
  boardRoute,
  referencesRoute,
  memoryRoute,
  reportsRoute,
  projectInfoRoute,
  integrationsRoute,
  environmentsRoute,
  agentModelsRoute,
  llmAuthRoute,
  kortextAgentsRoute,
  rulesRoute,
  workflowsRoute,
  notificationsRoute,
  hooksRoute,
  scriptsRoute,
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
