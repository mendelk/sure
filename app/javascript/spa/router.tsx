/* eslint-disable import/max-dependencies -- Router composes the shared SPA route surfaces and validators. */
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useChildMatches,
  useNavigate,
  useParams,
  useRouteContext,
  useSearch,
  type Router,
} from "@tanstack/react-router";
import type { SpaBootstrap } from "./bootstrap";
import { AppShell } from "./app-shell";
import { AccountDetailPage, validateAccountSearch } from "./account-detail-page";
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
import { BulkUpdateDrawer, validateBulkUpdateSearch } from "./bulk-update-drawer";
import { TransactionDetailDrawer } from "./transaction-detail-page";
import { TransactionsPage, validateTransactionSearch } from "./transactions-page";
import { AccountsIndexPage, SharingDialog } from "./accounts-index-page";
import { StatementDetailPage, StatementsIndexPage } from "./statements-page";
import { AccountIdSchema } from "./ids";
import { LoanEditDrawer } from "./loan-edit-drawer";
import {
  AccountableEditDrawer,
  AccountableNewDrawer,
  AccountableTypePickerDrawer,
} from "./accountable-drawer";
import {
  PropertyAddressDrawer,
  PropertyAvmDrawer,
  PropertyBalancesDrawer,
  PropertyEditDrawer,
  PropertyManualNewDrawer,
  PropertyNewDrawer,
  validatePropertyAvmSearch,
} from "./property-wizard-drawer";
type RouterContext = {
  bootstrap: SpaBootstrap;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: WorkspaceRoot,
  notFoundComponent: NotFoundPage,
});

const accountDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts/$accountId",
  validateSearch: validateAccountSearch,
  component: AccountDetailPage,
});

const accountTransactionRoute = createRoute({
  getParentRoute: () => accountDetailRoute,
  path: "transactions/$transactionId",
  component: TransactionDetailDrawer,
});

const newAccountTransactionRoute = createRoute({
  getParentRoute: () => accountDetailRoute,
  path: "transactions/new",
  validateSearch: validateNewTransactionSearch,
  component: NewTransactionPage,
});
function AccountSharingRouteComponent() {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const rawAccountId = typeof params.accountId === "string" ? params.accountId : "";
  const accountId = AccountIdSchema.parse(rawAccountId);

  return (
    <SharingDialog
      accountId={accountId}
      onClose={() => {
        void navigate({
          to: "/accounts/$accountId",
          params: { accountId },
          search: (prev: Record<string, unknown>) => prev,
          resetScroll: false,
        });
      }}
    />
  );
}

const accountSharingRoute = createRoute({
  getParentRoute: () => accountDetailRoute,
  path: "sharing",
  validateSearch: validateAccountSearch,
  component: AccountSharingRouteComponent,
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  validateSearch: validateTransactionSearch,
  component: TransactionsPage,
});

const accountsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts",
  component: AccountsIndexPage,
});

const statementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account_statements",
  component: Outlet,
});

const statementsIndexRoute = createRoute({
  getParentRoute: () => statementsRoute,
  path: "/",
  component: StatementsIndexPage,
});

const statementDetailRoute = createRoute({
  getParentRoute: () => statementsRoute,
  path: "$statementId",
  component: StatementDetailPage,
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

const bulkUpdateTransactionRoute = createRoute({
  getParentRoute: () => transactionsRoute,
  path: "bulk_update/new",
  validateSearch: validateBulkUpdateSearch,
  component: BulkUpdateDrawer,
});

function LoanEditPage() {
  return (
    <>
      <AccountDetailPage />
      <LoanEditDrawer />
    </>
  );
}

const loanEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/loans/$accountId/edit",
  validateSearch: validateAccountSearch,
  component: LoanEditPage,
});

function AccountableEditPage() {
  return (
    <>
      <AccountDetailPage />
      <AccountableEditDrawer />
    </>
  );
}

const accountableEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts/$accountId/edit",
  validateSearch: validateAccountSearch,
  component: AccountableEditPage,
});

function AccountableNewShell() {
  const childActive = useChildMatches({ select: (matches) => matches.length > 0 });
  return (
    <>
      <Outlet />
      {childActive ? null : <AccountableTypePickerDrawer />}
    </>
  );
}

const accountableNewTypeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts/new",
  validateSearch: validateAccountSearch,
  component: AccountableNewShell,
});

function AccountableNewTypeChildShell() {
  return (
    <>
      <Outlet />
      <AccountableNewDrawer />
    </>
  );
}

const accountableNewRoute = createRoute({
  getParentRoute: () => accountableNewTypeRoute,
  path: "$accountType",
  validateSearch: validateAccountSearch,
  component: AccountableNewTypeChildShell,
});

function PropertyNewShell() {
  const childActive = useChildMatches({ select: (matches) => matches.length > 0 });
  return (
    <>
      <Outlet />
      {childActive ? null : <PropertyNewDrawer />}
    </>
  );
}

const propertyNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/properties/new",
  validateSearch: validateAccountSearch,
  component: PropertyNewShell,
});

function PropertyManualNewShell() {
  return (
    <>
      <Outlet />
      <PropertyManualNewDrawer />
    </>
  );
}

const propertyManualNewRoute = createRoute({
  getParentRoute: () => propertyNewRoute,
  path: "manual",
  validateSearch: validateAccountSearch,
  component: PropertyManualNewShell,
});

function PropertyAvmPage() {
  const search = useSearch({ strict: false });
  const method = typeof search.method === "string" ? search.method : "";
  return <PropertyAvmDrawer providerKey={method} />;
}

const propertyAvmRoute = createRoute({
  getParentRoute: () => propertyNewRoute,
  path: "avm",
  validateSearch: validatePropertyAvmSearch,
  component: PropertyAvmPage,
});

function PropertyBalancesPage() {
  return (
    <>
      <AccountDetailPage />
      <PropertyBalancesDrawer />
    </>
  );
}

const propertyBalancesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/properties/$accountId/balances",
  validateSearch: validateAccountSearch,
  component: PropertyBalancesPage,
});

function PropertyAddressPage() {
  return (
    <>
      <AccountDetailPage />
      <PropertyAddressDrawer />
    </>
  );
}

const propertyAddressRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/properties/$accountId/address",
  validateSearch: validateAccountSearch,
  component: PropertyAddressPage,
});

function PropertyEditPage() {
  return (
    <>
      <AccountDetailPage />
      <PropertyEditDrawer />
    </>
  );
}

const propertyEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/properties/$accountId/edit",
  validateSearch: validateAccountSearch,
  component: PropertyEditPage,
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
  accountDetailRoute.addChildren([
    accountTransactionRoute,
    newAccountTransactionRoute,
    accountSharingRoute,
  ]),
  transactionsRoute.addChildren([
    transactionDetailRoute,
    newTransactionRoute,
    bulkUpdateTransactionRoute,
  ]),
  accountsIndexRoute,
  statementsRoute.addChildren([statementsIndexRoute, statementDetailRoute]),
  dashboardsRoute.addChildren([dashboardsIndexRoute]),
  sourcesRoute.addChildren([sourcesIndexRoute, newSourceRoute, editSourceRoute]),
  loanEditRoute,
  accountableEditRoute,
  accountableNewTypeRoute.addChildren([accountableNewRoute]),
  propertyNewRoute.addChildren([propertyManualNewRoute, propertyAvmRoute]),
  propertyBalancesRoute,
  propertyAddressRoute,
  propertyEditRoute,
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
