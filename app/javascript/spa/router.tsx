import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useRouteContext,
  type Router,
} from "@tanstack/react-router";
import type { SpaBootstrap } from "./bootstrap";
import { AppShell } from "./app-shell";
import { DashboardsPage } from "./dashboards-page";
import { validateDashboardSearch } from "./dashboard-storage";
import { DashboardWorkspaceProvider } from "./dashboard-workspace";
import {
  EditSourcePage,
  NewSourcePage,
  SourcesPage,
  validateSourceReturnSearch,
} from "./source-pages";
import { validateNewTransactionSearch, NewTransactionPage } from "./new-transaction-page";
import { TransactionDetailDrawer } from "./transaction-detail-page";
import { TransactionsPage, validateTransactionSearch } from "./transactions-page";
type RouterContext = {
  bootstrap: SpaBootstrap;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: WorkspaceRoot,
  notFoundComponent: NotFoundPage,
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  validateSearch: validateTransactionSearch,
  component: TransactionsPage,
});

const transactionDetailRoute = createRoute({
  getParentRoute: () => transactionsRoute,
  path: "$transactionId",
  component: TransactionDetailDrawer,
});

const newTransactionRoute = createRoute({
  getParentRoute: () => transactionsRoute,
  path: "new",
  validateSearch: validateNewTransactionSearch,
  component: NewTransactionPage,
});

const dashboardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboards",
  validateSearch: validateDashboardSearch,
  component: Outlet,
});

const dashboardsIndexRoute = createRoute({
  getParentRoute: () => dashboardsRoute,
  path: "/",
  component: DashboardsPage,
});

const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sources",
  validateSearch: validateSourceReturnSearch,
  component: Outlet,
});

const sourcesIndexRoute = createRoute({
  getParentRoute: () => sourcesRoute,
  path: "/",
  component: SourcesPage,
});

const newSourceRoute = createRoute({
  getParentRoute: () => sourcesRoute,
  path: "new",
  component: NewSourcePage,
});

const editSourceRoute = createRoute({
  getParentRoute: () => sourcesRoute,
  path: "$sourceId/edit",
  component: EditSourcePage,
});

const routeTree = rootRoute.addChildren([
  transactionsRoute.addChildren([transactionDetailRoute, newTransactionRoute]),
  dashboardsRoute.addChildren([dashboardsIndexRoute]),
  sourcesRoute.addChildren([sourcesIndexRoute, newSourceRoute, editSourceRoute]),
]);
export type SpaRouter = Router<typeof routeTree>;

export function createSpaRouter(bootstrap: SpaBootstrap): SpaRouter {
  return createRouter({
    context: { bootstrap },
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: SpaRouter;
  }
}

function WorkspaceRoot() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  return (
    <DashboardWorkspaceProvider key={bootstrap.currentUser.id} userId={bootstrap.currentUser.id}>
      <AppShell />
    </DashboardWorkspaceProvider>
  );
}

function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="space-y-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight" id="not-found-title">
        Page not found
      </h1>
    </section>
  );
}
