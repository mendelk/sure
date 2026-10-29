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
import { parseSpaSearch, stringifySpaSearch } from "./search-params";
import { AppShell } from "./app-shell";
import { HomePage } from "./home-page";
import { validateHomeSearch } from "./home/home-search";
import { AccountDetailPage, validateAccountSearch } from "./account-detail-page";
import { DashboardsPage } from "./dashboards-page";
import { LifetimeProjectionPage } from "./lifetime-projection-page";
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
import { SplitTransactionPage } from "./split-transaction-page";
import { TransferMatchPage } from "./transfer-match-page";
import { NewTransferPage, validateNewTransferSearch } from "./new-transfer-page";
import {
  TransactionConversionPage,
  validateTransactionConversionSearch,
} from "./transaction-conversion-page";
import { ProviderConnectionDrawer } from "./provider-connection-drawer";
import { TransactionDetailDrawer } from "./transaction-detail-page";
import { TransferDetailDrawer } from "./transfer-detail-drawer";
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
import { chatDetailQueryOptions } from "./api/chats";
import { ChatDetailPage, ChatNewPage, ChatsIndexPage, ChatTitleEditDialog } from "./chats-page";
import {
  AccountIdSchema,
  CategoryIdSchema,
  ChatIdSchema,
  MerchantIdSchema,
  TagIdSchema,
  type ChatId,
} from "./ids";
import { Button } from "./components/button";
import { Modal } from "./modal";
import { useDialogClose } from "./return-to";
import { LoanEditDrawer } from "./loan-edit-drawer";
import {
  AccountableEditDrawer,
  AccountableNewDrawer,
  AccountableTypePickerDrawer,
  validateNewAccountSearch,
  type NewAccountSearch,
} from "./accountable-drawer";
export type { NewAccountSearch };
export { validateNewAccountSearch };
import {
  PropertyAddressDrawer,
  PropertyAvmDrawer,
  PropertyBalancesDrawer,
  PropertyEditDrawer,
  PropertyManualNewDrawer,
  PropertyNewDrawer,
  validatePropertyAvmSearch,
} from "./property-wizard-drawer";
import {
  SimplefinReplacementDrawer,
  validateReplacementSearch,
} from "./simplefin-replacement-drawer";
import { ValuationDrawer, validateValuationSearch } from "./valuation-drawer";
import {
  SimplefinHistoryAuditDrawer,
  validateHistoryAuditSearch,
} from "./simplefin-history-audit-drawer";
type RouterContext = {
  bootstrap: SpaBootstrap;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: WorkspaceRoot,
  notFoundComponent: NotFoundPage,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: validateHomeSearch,
  component: HomePage,
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
const accountTransferRoute = createRoute({
  getParentRoute: () => accountDetailRoute,
  path: "transfers/$transferId",
  component: TransferDetailDrawer,
});

const newAccountValuationRoute = createRoute({
  getParentRoute: () => accountDetailRoute,
  path: "valuations/new",
  validateSearch: validateValuationSearch,
  component: ValuationDrawer,
});

const accountValuationRoute = createRoute({
  getParentRoute: () => accountDetailRoute,
  path: "valuations/$valuationId",
  validateSearch: validateValuationSearch,
  component: ValuationDrawer,
});

function StandaloneValuationPage() {
  return (
    <>
      <AccountsIndexPage />
      <ValuationDrawer />
    </>
  );
}

const newValuationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/valuations/new",
  validateSearch: validateValuationSearch,
  component: StandaloneValuationPage,
});

const valuationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/valuations/$valuationId",
  validateSearch: validateValuationSearch,
  component: StandaloneValuationPage,
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

const providerReplacementRoute = createRoute({
  getParentRoute: () => accountDetailRoute,
  path: "provider_replacement",
  validateSearch: validateReplacementSearch,
  component: SimplefinReplacementDrawer,
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

const simplefinHistoryAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts/$accountId/simplefin_history_audit",
  validateSearch: validateHistoryAuditSearch,
  component: () => (
    <>
      <AccountsIndexPage />
      <SimplefinHistoryAuditDrawer />
    </>
  ),
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
const transferDetailRoute = createRoute({
  getParentRoute: () => transactionsRoute,
  path: "transfers/$transferId",
  component: TransferDetailDrawer,
});

function StandaloneTransferPage() {
  return (
    <>
      <TransactionsPage />
      <TransferDetailDrawer />
    </>
  );
}

const standaloneTransferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transfers/$transferId",
  component: StandaloneTransferPage,
});
const newTransferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transfers/new",
  validateSearch: validateNewTransferSearch,
  component: NewTransferPage,
});

const transactionConversionRoute = createRoute({
  getParentRoute: () => transactionDetailRoute,
  path: "convert_to_trade",
  validateSearch: validateTransactionConversionSearch,
  component: TransactionConversionPage,
});

type ProviderSearch = {
  account_id?: string;
  accountable_type?: string;
  region?: string;
  return_to?: string;
};

function validateProviderSearch(input: Record<string, unknown>): ProviderSearch {
  const result: ProviderSearch = {};
  for (const key of ["account_id", "accountable_type", "region", "return_to"] as const)
    if (typeof input[key] === "string") result[key] = input[key];

  return result;
}

function ProviderConnectionRouteComponent({ mode }: { mode: "new" | "edit" | "setup" | "manage" }) {
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false, select: validateProviderSearch });
  const close = useDialogClose("/accounts");
  if (typeof params.provider !== "string") return <AccountsIndexPage />;
  return (
    <>
      <AccountsIndexPage />
      <ProviderConnectionDrawer
        key={`${params.provider}:${typeof params.connectionId === "string" ? params.connectionId : "new"}:${mode}:${search.account_id ?? ""}:${search.accountable_type ?? ""}:${search.region ?? ""}`}
        provider={params.provider}
        connectionId={typeof params.connectionId === "string" ? params.connectionId : undefined}
        mode={mode}
        accountId={search.account_id}
        accountableType={search.accountable_type}
        region={search.region}
        onClose={close}
      />
    </>
  );
}

const providerNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/provider_connections/$provider/new",
  validateSearch: validateProviderSearch,
  component: () => <ProviderConnectionRouteComponent mode="new" />,
});
const providerEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/provider_connections/$provider/$connectionId/edit",
  validateSearch: validateProviderSearch,
  component: () => <ProviderConnectionRouteComponent mode="edit" />,
});
const providerSetupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/provider_connections/$provider/$connectionId/setup",
  validateSearch: validateProviderSearch,
  component: () => <ProviderConnectionRouteComponent mode="setup" />,
});
const providerManageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/provider_connections/$provider/$connectionId/manage",
  validateSearch: validateProviderSearch,
  component: () => <ProviderConnectionRouteComponent mode="manage" />,
});

function SplitNewPage() {
  return <SplitTransactionPage mode="create" />;
}

function SplitEditPage() {
  return <SplitTransactionPage mode="update" />;
}

const splitNewRoute = createRoute({
  getParentRoute: () => transactionDetailRoute,
  path: "split/new",
  component: SplitNewPage,
});

const splitEditRoute = createRoute({
  getParentRoute: () => transactionDetailRoute,
  path: "split/edit",
  component: SplitEditPage,
});

const transferMatchRoute = createRoute({
  getParentRoute: () => transactionDetailRoute,
  path: "transfer_match/new",
  component: TransferMatchPage,
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
  validateSearch: validateNewAccountSearch,
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
  validateSearch: validateNewAccountSearch,
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
export function validatePropertyNewSearch(input: Record<string, unknown>) {
  return { ...validateAccountSearch(input), ...validateNewAccountSearch(input) };
}
const propertyNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/properties/new",
  validateSearch: validatePropertyNewSearch,
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

const lifetimeProjectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plan/projection",
  component: LifetimeProjectionPage,
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
  const close = useDialogClose("/tags");
  const query = useQuery(tagsIndexQueryOptions());

  return (
    <>
      <TagsIndexPage />
      <TagFormDialog colors={query.data?.colors ?? []} onClose={close} tag={null} />
    </>
  );
}

function TagEditRouteComponent() {
  const close = useDialogClose("/tags");
  const params = useParams({ strict: false });
  const parsed = TagIdSchema.safeParse(typeof params.tagId === "string" ? params.tagId : "");
  const query = useQuery(tagsIndexQueryOptions());

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
  const close = useDialogClose("/tags");
  const params = useParams({ strict: false });
  const parsed = TagIdSchema.safeParse(typeof params.tagId === "string" ? params.tagId : "");
  const query = useQuery(tagsIndexQueryOptions());

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
  const close = useDialogClose("/categories");

  return (
    <>
      <CategoriesPage />
      <FormDialogLoader onClose={close} onSaved={close} state={{ mode: "new" }} />
    </>
  );
}

function CategoryEditRouteComponent() {
  const close = useDialogClose("/categories");
  const params = useParams({ strict: false });
  const parsed = CategoryIdSchema.safeParse(
    typeof params.categoryId === "string" ? params.categoryId : "",
  );

  if (!parsed.success) return <CategoriesPage />;
  return (
    <>
      <CategoriesPage />
      <FormDialogLoader onClose={close} onSaved={close} state={{ id: parsed.data, mode: "edit" }} />
    </>
  );
}

function CategoryDeletionRouteComponent() {
  const close = useDialogClose("/categories");
  const params = useParams({ strict: false });
  const parsed = CategoryIdSchema.safeParse(
    typeof params.categoryId === "string" ? params.categoryId : "",
  );
  const query = useQuery(categoriesIndexQueryOptions());

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
  const close = useDialogClose("/categories");
  const query = useQuery(categoriesIndexQueryOptions());

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
  const close = useDialogClose("/family_merchants");
  const query = useQuery(merchantsIndexQueryOptions(MERCHANTS_INDEX_PATH, {}));

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
  const close = useDialogClose("/family_merchants");
  const params = useParams({ strict: false });
  const parsed = MerchantIdSchema.safeParse(
    typeof params.merchantId === "string" ? params.merchantId : "",
  );
  const formQuery = useQuery({
    ...merchantFormQueryOptions(
      parsed.success
        ? `/api/v1/merchants/form_options?id=${parsed.data}`
        : "/api/v1/merchants/form_options",
      "edit",
    ),
    enabled: parsed.success,
  });
  const indexQuery = useQuery(merchantsIndexQueryOptions(MERCHANTS_INDEX_PATH, {}));

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
      indexPath="/api/v1/rules"
      newHref="/rules/new"
      onEdit={(ruleId) => {
        void navigate({ to: "/rules/$ruleId/edit", params: { ruleId } });
      }}
      rulesPath="/api/v1/rules"
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
  return_to?: string;
};

export function validateRuleNewSearch(input: Record<string, unknown>): RuleNewSearch {
  const result: RuleNewSearch = {};
  for (const key of [
    "resource_type",
    "merchant_id",
    "name",
    "action_type",
    "action_value",
    "return_to",
  ] as const) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  return result;
}

function RuleNewRouteComponent() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const search = useSearch({ from: ruleNewRoute.id, shouldThrow: false }) ?? {};
  const formPath = "/api/v1/rules/form_options";

  // The rule API presets the rule name,
  // its merchant condition, and the seeded action from these params; forward
  // them so a menu entry like "Always categorize" opens a prefilled form.
  const presetParams = new URLSearchParams();
  if (search.resource_type !== undefined) presetParams.set("resource_type", search.resource_type);
  if (search.merchant_id !== undefined) presetParams.set("merchant_id", search.merchant_id);
  if (search.name !== undefined) presetParams.set("name", search.name);
  if (search.action_type !== undefined) presetParams.set("action_type", search.action_type);
  if (search.action_value !== undefined) presetParams.set("action_value", search.action_value);
  const presetQuery = presetParams.toString();

  const done = useDialogClose("/rules");
  return (
    <RuleFormPage
      bootstrap={bootstrap}
      formPath={presetQuery === "" ? formPath : `${formPath}?${presetQuery}`}
      mode="new"
      onDone={done}
      rulesPath="/api/v1/rules"
      submitPath="/api/v1/rules"
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
  const params = useParams({ strict: false });
  const ruleId = typeof params.ruleId === "string" ? params.ruleId : "";
  const done = useDialogClose("/rules");
  return (
    <RuleFormPage
      bootstrap={bootstrap}
      formPath={`/api/v1/rules/${encodeURIComponent(ruleId)}/form_options`}
      mode="edit"
      onDone={done}
      rulesPath="/api/v1/rules"
      submitPath={`/api/v1/rules/${encodeURIComponent(ruleId)}`}
    />
  );
}

const ruleEditRoute = createRoute({
  getParentRoute: () => rulesRoute,
  path: "$ruleId/edit",
  component: RuleEditRouteComponent,
});
function RuleConfirmRouteComponent() {
  const queryClient = useQueryClient();
  const params = useParams({ strict: false });
  const ruleId = typeof params.ruleId === "string" ? params.ruleId : "";
  const [confirm, setConfirm] = useState<RuleConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = useDialogClose("/rules");
  useEffect(() => {
    let cancelled = false;
    fetchRuleConfirm(`/api/v1/rules/${encodeURIComponent(ruleId)}/confirm`)
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
            applyRule(`/api/v1/rules/${encodeURIComponent(ruleId)}/apply`)
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
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmAll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = useDialogClose("/rules");
  useEffect(() => {
    let cancelled = false;
    fetchConfirmAll("/api/v1/rules/confirm_all")
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
            applyAllRules("/api/v1/rules/apply_all")
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

const chatsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chats",
  component: Outlet,
});

const chatsIndexRoute = createRoute({
  getParentRoute: () => chatsRoute,
  path: "/",
  component: ChatsIndexPage,
});

const chatNewRoute = createRoute({
  getParentRoute: () => chatsRoute,
  path: "new",
  component: ChatNewPage,
});

function ChatDetailRouteComponent() {
  const params = useParams({ strict: false });
  const parsed = ChatIdSchema.safeParse(typeof params.chatId === "string" ? params.chatId : "");
  if (!parsed.success) return <ChatsIndexPage />;
  return <ChatDetailPage chatId={parsed.data} />;
}

const chatDetailRoute = createRoute({
  getParentRoute: () => chatsRoute,
  path: "$chatId",
  component: ChatDetailRouteComponent,
});

function ChatTitleEditRouteModal({ chatId, onClose }: { chatId: ChatId; onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery(chatDetailQueryOptions(chatId));
  if (!query.data) return null;
  return (
    <ChatTitleEditDialog
      chat={{ id: chatId, title: query.data.title }}
      onClose={onClose}
      onSaved={() => {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["spa", "chat", chatId] }),
          queryClient.invalidateQueries({ queryKey: ["spa", "chats"] }),
        ]).then(onClose);
      }}
    />
  );
}

function ChatEditRouteComponent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const parsed = ChatIdSchema.safeParse(typeof params.chatId === "string" ? params.chatId : "");
  const close = () => {
    if (parsed.success) void navigate({ to: "/chats/$chatId", params: { chatId: parsed.data } });
    else void navigate({ to: "/chats" });
  };

  if (!parsed.success) return <ChatsIndexPage />;
  return (
    <>
      <ChatDetailPage chatId={parsed.data} />
      <ChatTitleEditRouteModal chatId={parsed.data} onClose={close} />
    </>
  );
}

const chatEditRoute = createRoute({
  getParentRoute: () => chatsRoute,
  path: "$chatId/edit",
  component: ChatEditRouteComponent,
});
const routeTree = rootRoute.addChildren([
  homeRoute,
  accountDetailRoute.addChildren([
    accountTransactionRoute,
    accountTransferRoute,
    newAccountTransactionRoute,
    newAccountValuationRoute,
    accountValuationRoute,
    accountSharingRoute,
    providerReplacementRoute,
  ]),
  transactionsRoute.addChildren([
    transactionDetailRoute.addChildren([
      splitNewRoute,
      splitEditRoute,
      transferMatchRoute,
      transactionConversionRoute,
    ]),
    transferDetailRoute,
    newTransactionRoute,
    bulkUpdateTransactionRoute,
  ]),
  accountsIndexRoute,
  simplefinHistoryAuditRoute,
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
  chatsRoute.addChildren([chatsIndexRoute, chatNewRoute, chatDetailRoute, chatEditRoute]),
  accountableEditRoute,
  accountableNewTypeRoute.addChildren([accountableNewRoute]),
  propertyNewRoute.addChildren([propertyManualNewRoute, propertyAvmRoute]),
  propertyBalancesRoute,
  propertyAddressRoute,
  propertyEditRoute,
  standaloneTransferRoute,
  newTransferRoute,
  providerNewRoute,
  providerEditRoute,
  providerSetupRoute,
  providerManageRoute,
  newValuationRoute,
  valuationRoute,
  lifetimeProjectionRoute,
]);
export type SpaRouter = Router<typeof routeTree>;

export function createSpaRouter(bootstrap: SpaBootstrap): SpaRouter {
  return createRouter({
    context: { bootstrap },
    defaultPreload: "intent",
    parseSearch: parseSpaSearch,
    stringifySearch: stringifySpaSearch,
    routeTree,
    scrollRestoration: true,
    defaultOnCatch: (error) => {
      // eslint-disable-next-line no-console -- Temporary probe for the d3-sankey render crash; remove after diagnosis.
      console.error(
        "[home-crash]",
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
    },
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
