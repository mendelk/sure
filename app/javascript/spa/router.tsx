import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type Router,
} from "@tanstack/react-router";
import type { SpaBootstrap } from "./bootstrap";
import { AppShell } from "./app-shell";
import { TransactionDetailDrawer } from "./transaction-detail-page";
import { TransactionsPage, validateTransactionSearch } from "./transactions-page";

type RouterContext = {
  bootstrap: SpaBootstrap;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
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

const routeTree = rootRoute.addChildren([transactionsRoute.addChildren([transactionDetailRoute])]);
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

function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="space-y-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight" id="not-found-title">
        Page not found
      </h1>
    </section>
  );
}
