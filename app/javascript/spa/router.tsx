/* eslint-disable import/max-dependencies -- Router composes the shared SPA route surfaces and validators. */
import { useEffect, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TagsIndexPage } from "./tags-page";
import { CategoriesPage } from "./categories-page";
import { MERCHANTS_INDEX_PATH, MerchantsPage } from "./merchants-page";
import { RuleFormPage, RulesIndexPage } from "./rules-page";
import {
  DeleteConfirmDialog as TagDeleteConfirmDialog,
  DeleteReplacementDialog as TagDeleteReplacementDialog,
  TagFormDialog,
} from "./tags-page";
import {
  DeleteDialog as CategoryDeleteDialog,
  FormDialogLoader,
  MergeDialog as CategoryMergeDialog,
} from "./categories-page";
import { MerchantFormModal } from "./merchants-page";
import { ApplyAllDialog, ApplyConfirmDialog } from "./rules-page";
import { tagsIndexQueryOptions } from "./api/tags";
import { categoriesIndexQueryOptions } from "./api/categories";
import {
  applyAllRules,
  applyRule,
  fetchConfirmAll,
  fetchRuleConfirm,
  invalidateRulesQueries,
  type ConfirmAll,
  type RuleConfirm,
} from "./api/rules";
import { merchantFormQueryOptions, merchantsIndexQueryOptions } from "./api/merchants";
import { AccountIdSchema, CategoryIdSchema, MerchantIdSchema, TagIdSchema } from "./ids";
import { Button } from "./components/button";
import { Modal } from "./modal";
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
function TagNewRouteComponent() {
  const navigate = useNavigate();
  const query = useQuery(tagsIndexQueryOptions());
  const close = () => {
    void navigate({ to: "/tags", resetScroll: false });
  };
  return (
    <>
      <TagsIndexPage />
      <TagFormDialog colors={query.data?.colors ?? []} onClose={close} tag={null} />
    </>
  );
}

function TagEditRouteComponent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const parsed = TagIdSchema.safeParse(typeof params.tagId === "string" ? params.tagId : "");
  const query = useQuery(tagsIndexQueryOptions());
  const close = () => {
    void navigate({ to: "/tags", resetScroll: false });
  };
  const tag = parsed.success
    ? (query.data?.tags.find((row) => row.id === parsed.data) ?? null)
    : null;
  if (!parsed.success) return <TagsIndexPage />;
  return (
    <>
      <TagsIndexPage />
      {tag === null ? null : (
        <TagFormDialog colors={query.data?.colors ?? []} onClose={close} tag={tag} />
      )}
    </>
  );
}

function TagDeletionRouteComponent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const parsed = TagIdSchema.safeParse(typeof params.tagId === "string" ? params.tagId : "");
  const query = useQuery(tagsIndexQueryOptions());
  const close = () => {
    void navigate({ to: "/tags", resetScroll: false });
  };
  const tags = query.data?.tags ?? [];
  const tag = parsed.success ? (tags.find((row) => row.id === parsed.data) ?? null) : null;
  if (!parsed.success || tag === null) return <TagsIndexPage />;
  return (
    <>
      <TagsIndexPage />
      {tag.transactions_count > 0 ? (
        <TagDeleteReplacementDialog
          candidates={tags.filter((candidate) => candidate.id !== tag.id)}
          onClose={close}
          tag={tag}
        />
      ) : (
        <TagDeleteConfirmDialog onClose={close} tag={tag} />
      )}
    </>
  );
}

const tagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tags",
  component: Outlet,
});

const tagsIndexRoute = createRoute({
  getParentRoute: () => tagsRoute,
  path: "/",
  component: TagsIndexPage,
});

const tagNewRoute = createRoute({
  getParentRoute: () => tagsRoute,
  path: "new",
  component: TagNewRouteComponent,
});

const tagEditRoute = createRoute({
  getParentRoute: () => tagsRoute,
  path: "$tagId/edit",
  component: TagEditRouteComponent,
});

const tagDeletionRoute = createRoute({
  getParentRoute: () => tagsRoute,
  path: "$tagId/deletions/new",
  component: TagDeletionRouteComponent,
});
function CategoryNewRouteComponent() {
  const navigate = useNavigate();
  const close = () => {
    void navigate({ to: "/categories", resetScroll: false });
  };
  return (
    <>
      <CategoriesPage />
      <FormDialogLoader onClose={close} onSaved={close} state={{ mode: "new" }} />
    </>
  );
}

function CategoryEditRouteComponent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const parsed = CategoryIdSchema.safeParse(
    typeof params.categoryId === "string" ? params.categoryId : "",
  );
  const close = () => {
    void navigate({ to: "/categories", resetScroll: false });
  };
  if (!parsed.success) return <CategoriesPage />;
  return (
    <>
      <CategoriesPage />
      <FormDialogLoader onClose={close} onSaved={close} state={{ id: parsed.data, mode: "edit" }} />
    </>
  );
}

function CategoryDeletionRouteComponent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const parsed = CategoryIdSchema.safeParse(
    typeof params.categoryId === "string" ? params.categoryId : "",
  );
  const query = useQuery(categoriesIndexQueryOptions());
  const close = () => {
    void navigate({ to: "/categories", resetScroll: false });
  };
  const groups = query.data?.groups ?? [];
  const rows = groups.flatMap((group) => [group.root].concat(group.subcategories));
  const row = parsed.success ? (rows.find((entry) => entry.id === parsed.data) ?? null) : null;
  if (!parsed.success || query.data === undefined || row === null) return <CategoriesPage />;
  return (
    <>
      <CategoriesPage />
      <CategoryDeleteDialog data={query.data} onClose={close} onDeleted={close} row={row} />
    </>
  );
}

function CategoryMergeRouteComponent() {
  const navigate = useNavigate();
  const query = useQuery(categoriesIndexQueryOptions());
  const close = () => {
    void navigate({ to: "/categories", resetScroll: false });
  };
  if (query.data === undefined) return <CategoriesPage />;
  return (
    <>
      <CategoriesPage />
      <CategoryMergeDialog data={query.data} onClose={close} onMerged={close} />
    </>
  );
}

const categoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/categories",
  component: Outlet,
});

const categoriesIndexRoute = createRoute({
  getParentRoute: () => categoriesRoute,
  path: "/",
  component: CategoriesPage,
});

const categoryNewRoute = createRoute({
  getParentRoute: () => categoriesRoute,
  path: "new",
  component: CategoryNewRouteComponent,
});

const categoryEditRoute = createRoute({
  getParentRoute: () => categoriesRoute,
  path: "$categoryId/edit",
  component: CategoryEditRouteComponent,
});

const categoryDeletionRoute = createRoute({
  getParentRoute: () => categoriesRoute,
  path: "$categoryId/deletions/new",
  component: CategoryDeletionRouteComponent,
});

const categoryMergeRoute = createRoute({
  getParentRoute: () => categoriesRoute,
  path: "merge",
  component: CategoryMergeRouteComponent,
});
function MerchantNewRouteComponent() {
  const navigate = useNavigate();
  const query = useQuery(merchantsIndexQueryOptions(MERCHANTS_INDEX_PATH, {}));
  const close = () => {
    void navigate({ to: "/family_merchants", resetScroll: false });
  };
  return (
    <>
      <MerchantsPage />
      <MerchantFormModal
        colors={query.data?.colors ?? []}
        initial={{ color: null, name: "", website_url: null }}
        isProvider={false}
        onClose={close}
        onSaved={close}
      />
    </>
  );
}

function MerchantEditRouteComponent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const parsed = MerchantIdSchema.safeParse(
    typeof params.merchantId === "string" ? params.merchantId : "",
  );
  const formQuery = useQuery({
    ...merchantFormQueryOptions(
      parsed.success ? `/family_merchants/${parsed.data}/edit.json` : "/family_merchants/new.json",
      "edit",
    ),
    enabled: parsed.success,
  });
  const indexQuery = useQuery(merchantsIndexQueryOptions(MERCHANTS_INDEX_PATH, {}));
  const close = () => {
    void navigate({ to: "/family_merchants", resetScroll: false });
  };
  if (!parsed.success) return <MerchantsPage />;
  const payload = formQuery.data;
  if (payload === undefined || !("id" in payload.merchant && payload.merchant.id !== null))
    return <MerchantsPage />;
  return (
    <>
      <MerchantsPage />
      <MerchantFormModal
        colors={indexQuery.data?.colors ?? []}
        initial={{
          color: payload.merchant.color,
          id: payload.merchant.id,
          name: payload.merchant.name ?? "",
          website_url: payload.merchant.website_url,
        }}
        isProvider={payload.merchant.type === "ProviderMerchant"}
        onClose={close}
        onSaved={close}
      />
    </>
  );
}

const merchantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/family_merchants",
  component: Outlet,
});

const merchantsIndexRoute = createRoute({
  getParentRoute: () => merchantsRoute,
  path: "/",
  component: MerchantsPage,
});

const merchantNewRoute = createRoute({
  getParentRoute: () => merchantsRoute,
  path: "new",
  component: MerchantNewRouteComponent,
});

const merchantEditRoute = createRoute({
  getParentRoute: () => merchantsRoute,
  path: "$merchantId/edit",
  component: MerchantEditRouteComponent,
});

function RulesIndexRouteComponent() {
  const navigate = useNavigate();
  return (
    <RulesIndexPage
      indexPath="/rules.json"
      newHref="/rules/new"
      onEdit={(ruleId) => {
        void navigate({ to: "/rules/$ruleId/edit", params: { ruleId } });
      }}
      rulesPath="/rules.json"
    />
  );
}

const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rules",
  component: Outlet,
});

const rulesIndexRoute = createRoute({
  getParentRoute: () => rulesRoute,
  path: "/",
  component: RulesIndexRouteComponent,
});

// Query params that preset the new rule form (see rules_controller#new).
// Unclassified links omit :action_value — the form then opens with the
// "Set transaction category" action and an empty category picker.
export type RuleNewSearch = {
  resource_type?: string;
  merchant_id?: string;
  name?: string;
  action_type?: string;
  action_value?: string;
};

export function validateRuleNewSearch(input: Record<string, unknown>): RuleNewSearch {
  const result: RuleNewSearch = {};
  for (const key of [
    "resource_type",
    "merchant_id",
    "name",
    "action_type",
    "action_value",
  ] as const) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  return result;
}

function RuleNewRouteComponent() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const search = useSearch({ from: ruleNewRoute.id, shouldThrow: false }) ?? {};
  const formPath = "/rules/new.json";

  // The rule builder server (`rules_controller#new`) presets the rule name,
  // its merchant condition, and the seeded action from these params; forward
  // them so a menu entry like "Always categorize" opens a prefilled form.
  const presetParams = new URLSearchParams();
  if (search.resource_type !== undefined) presetParams.set("resource_type", search.resource_type);
  if (search.merchant_id !== undefined) presetParams.set("merchant_id", search.merchant_id);
  if (search.name !== undefined) presetParams.set("name", search.name);
  if (search.action_type !== undefined) presetParams.set("action_type", search.action_type);
  if (search.action_value !== undefined) presetParams.set("action_value", search.action_value);
  const presetQuery = presetParams.toString();

  const done = () => {
    void navigate({ to: "/rules", resetScroll: false });
  };
  return (
    <RuleFormPage
      bootstrap={bootstrap}
      formPath={presetQuery === "" ? formPath : `${formPath}?${presetQuery}`}
      mode="new"
      onDone={done}
      rulesPath="/rules.json"
      submitPath="/rules.json"
    />
  );
}

const ruleNewRoute = createRoute({
  getParentRoute: () => rulesRoute,
  path: "new",
  validateSearch: validateRuleNewSearch,
  component: RuleNewRouteComponent,
});

function RuleEditRouteComponent() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const ruleId = typeof params.ruleId === "string" ? params.ruleId : "";
  const done = () => {
    void navigate({ to: "/rules", resetScroll: false });
  };
  return (
    <RuleFormPage
      bootstrap={bootstrap}
      formPath={`/rules/${encodeURIComponent(ruleId)}/edit.json`}
      mode="edit"
      onDone={done}
      rulesPath="/rules.json"
      submitPath={`/rules/${encodeURIComponent(ruleId)}.json`}
    />
  );
}

const ruleEditRoute = createRoute({
  getParentRoute: () => rulesRoute,
  path: "$ruleId/edit",
  component: RuleEditRouteComponent,
});
function RuleConfirmRouteComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams({ strict: false });
  const ruleId = typeof params.ruleId === "string" ? params.ruleId : "";
  const [confirm, setConfirm] = useState<RuleConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => {
    void navigate({ to: "/rules", resetScroll: false });
  };
  useEffect(() => {
    let cancelled = false;
    fetchRuleConfirm(`/rules/${encodeURIComponent(ruleId)}/confirm.json`)
      .then((payload) => {
        if (!cancelled) setConfirm(payload);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the confirmation.");
      });
    return () => {
      cancelled = true;
    };
  }, [ruleId]);
  return (
    <>
      <RulesIndexRouteComponent />
      {confirm === null ? (
        <Modal
          ariaLabelledby="rules-confirm-loading"
          onClose={back}
          open
          panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
        >
          <p className="text-sm text-secondary" id="rules-confirm-loading">
            {error ?? "Loading…"}
          </p>
          <div className="mt-4 flex justify-end">
            <Button onClick={back} variant="secondary">
              Cancel
            </Button>
          </div>
        </Modal>
      ) : (
        <ApplyConfirmDialog
          confirm={confirm}
          onApply={() => {
            applyRule(`/rules/${encodeURIComponent(ruleId)}/apply`)
              .then(() => invalidateRulesQueries(queryClient))
              .then(back)
              .catch(() => {
                setError("Could not apply the rule.");
              });
          }}
          onCancel={back}
          title="Confirm changes"
        />
      )}
    </>
  );
}

const ruleConfirmRoute = createRoute({
  getParentRoute: () => rulesRoute,
  path: "$ruleId/confirm",
  component: RuleConfirmRouteComponent,
});

function RuleConfirmAllRouteComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmAll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => {
    void navigate({ to: "/rules", resetScroll: false });
  };
  useEffect(() => {
    let cancelled = false;
    fetchConfirmAll("/rules/confirm_all.json")
      .then((payload) => {
        if (!cancelled) setConfirm(payload);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the confirmation.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <>
      <RulesIndexRouteComponent />
      {confirm === null ? (
        <Modal
          ariaLabelledby="rules-confirm-all-loading"
          onClose={back}
          open
          panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
        >
          <p className="text-sm text-secondary" id="rules-confirm-all-loading">
            {error ?? "Loading…"}
          </p>
          <div className="mt-4 flex justify-end">
            <Button onClick={back} variant="secondary">
              Cancel
            </Button>
          </div>
        </Modal>
      ) : (
        <ApplyAllDialog
          confirm={confirm}
          onApply={() => {
            applyAllRules("/rules/apply_all")
              .then(() => invalidateRulesQueries(queryClient))
              .then(back)
              .catch(() => {
                setError("Could not apply the rules.");
              });
          }}
          onCancel={back}
        />
      )}
    </>
  );
}

const ruleConfirmAllRoute = createRoute({
  getParentRoute: () => rulesRoute,
  path: "confirm_all",
  component: RuleConfirmAllRouteComponent,
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
  tagsRoute.addChildren([tagsIndexRoute, tagNewRoute, tagEditRoute, tagDeletionRoute]),
  categoriesRoute.addChildren([
    categoriesIndexRoute,
    categoryNewRoute,
    categoryEditRoute,
    categoryDeletionRoute,
    categoryMergeRoute,
  ]),
  merchantsRoute.addChildren([merchantsIndexRoute, merchantNewRoute, merchantEditRoute]),
  loanEditRoute,
  rulesRoute.addChildren([
    rulesIndexRoute,
    ruleNewRoute,
    ruleEditRoute,
    ruleConfirmRoute,
    ruleConfirmAllRoute,
  ]),
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
