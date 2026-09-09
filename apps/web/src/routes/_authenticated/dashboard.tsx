import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader, getRequestUrl } from "@tanstack/react-start/server";
import * as React from "react";
import { SessionEndingGuard } from "~/components/auth/session-ending";
import { PageHeader } from "~/components/shell/app-shell";
import { RouteErrorState, RouteNotFound, RoutePending } from "~/components/shell/route-states";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { SureSelect } from "~/components/ui/select";
import { SureTextField } from "~/components/ui/text-field";
import { formatMessage } from "~/lib/i18n/messages";
import type { DashboardFilter } from "~/lib/app-search";
import { parseDashboardSearch } from "~/lib/app-search";
import { proxyBffWithSession } from "~/lib/sure-auth-session.server";
import type { BffAuthErrorCode } from "~/lib/sure-auth-session.server";
import type { BffProxyResult } from "~/lib/sure-api-bff.server";

export type BffDashboardSummaryResult =
	| { readonly ok: true; readonly accountCount: number }
	| { readonly ok: false; readonly error: { readonly code: BffAuthErrorCode } };

/** Lenient account count for the workspace summary (fail-closed upstream). */
function narrowAccountCount(result: BffProxyResult): number | undefined {
	if (!(result.body instanceof ArrayBuffer)) {
		return undefined;
	}
	let decoded: unknown;
	try {
		decoded = JSON.parse(new TextDecoder().decode(result.body)) as unknown;
	} catch {
		return undefined;
	}
	if (typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)) {
		for (const [key, value] of Object.entries(decoded)) {
			if (key === "accounts" && Array.isArray(value)) {
				return value.length;
			}
		}
	}
	if (Array.isArray(decoded)) {
		return decoded.length;
	}
	return undefined;
}

/**
 * First real authenticated query (t_alt_fnd_021): the workspace account
 * collection through the session-authenticated proxy. Session-ending
 * failures (`api-mismatch`, `logged-out`, `deactivated`,
 * `session-expired`) resolve as data so `SessionEndingGuard` can clear
 * local session state and render signed-out; transport throws propagate
 * to the route error state with retry.
 */
export const bffDashboardSummaryFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<BffDashboardSummaryResult> => {
		const outcome = await proxyBffWithSession({
			method: "GET",
			path: "/api/v1/accounts",
			origin: getRequestHeader("Origin") ?? null,
			csrfToken: getRequestHeader("X-Csrf-Token") ?? getCookie("__Host-sure-bff-csrf") ?? null,
			bffOrigin: new URL(getRequestUrl()).origin,
			cookieHeader: getRequestHeader("Cookie") ?? null,
		});
		if (!outcome.ok) {
			return { ok: false, error: { code: outcome.error.code } };
		}
		const accountCount = narrowAccountCount(outcome.result);
		if (accountCount === undefined) {
			return { ok: false, error: { code: "api-mismatch" } };
		}
		return { ok: true, accountCount };
	},
);

export const dashboardSummaryQuery = queryOptions({
	queryKey: ["dashboard", "summary"],
	queryFn: () => bffDashboardSummaryFn(),
});

/**
 * Authenticated dashboard (t_alt_fnd_010).
 *
 * Demonstrates typed search state preserved through deep links and
 * browser history: `validateSearch` parses `?q=&filter=` into
 * `DashboardSearch` (defaults `q=""`, `filter="all"`), the filter form
 * writes back through the router (one history entry per committed
 * change), and every link out carries the current search forward so
 * back/forward restores it exactly.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
	validateSearch: (search: Record<string, unknown>) => parseDashboardSearch(search),
	loader: ({ context }) => context.queryClient.ensureQueryData(dashboardSummaryQuery),
	head: () => ({
		meta: [
			{
				title: formatMessage("app.documentTitle", {
					title: formatMessage("dashboard.title"),
				}),
			},
		],
	}),
	pendingComponent: () => <RoutePending label={formatMessage("routes.loadingDashboard")} />,
	notFoundComponent: () => <RouteNotFound />,
	errorComponent: ({ error, reset }) => (
		<RouteErrorState
			message={error instanceof Error ? error.message : formatMessage("routes.dashboardError")}
			onRetry={reset}
		/>
	),
	component: DashboardPage,
});

const FILTER_OPTIONS: readonly { id: DashboardFilter; label: string }[] = [
	{ id: "all", label: formatMessage("dashboard.filterAll") },
	{ id: "active", label: formatMessage("dashboard.filterActive") },
	{ id: "archived", label: formatMessage("dashboard.filterArchived") },
];

/**
 * Workspace summary (t_alt_fnd_021): the first consumer of
 * `BFF_SESSION_QUERY_KEY` clearing — `SessionEndingGuard` clears local
 * session state and renders signed-out on session-ending failures, while
 * other failures surface the retryable route error state.
 */
function DashboardSummary(): React.ReactElement {
	const summary = useSuspenseQuery(dashboardSummaryQuery);
	const result = summary.data;
	return (
		<SessionEndingGuard result={result}>
			{!result.ok ? (
				<RouteErrorState
					message={formatMessage("routes.dashboardError")}
					onRetry={() => void summary.refetch()}
				/>
			) : (
				<p data-testid="dashboard-accounts">
					{formatMessage("dashboard.accounts", { count: result.accountCount })}
				</p>
			)}
		</SessionEndingGuard>
	);
}

function DashboardPage(): React.ReactElement {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	function commit(next: { q?: string; filter?: DashboardFilter }): void {
		void navigate({
			search: (prev) => ({ ...prev, q: next.q ?? prev.q, filter: next.filter ?? prev.filter }),
		});
	}

	return (
		<>
			<PageHeader
				title={formatMessage("dashboard.title")}
				breadcrumbs={[
					{ label: formatMessage("dashboard.homeCrumb"), to: "/" },
					{ label: formatMessage("dashboard.title") },
				]}
			/>
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>{formatMessage("dashboard.overview")}</SureCardTitle>
				</SureCardHeader>
				<SureCardContent>
					<DashboardSummary />
					<p data-testid="dashboard-search-state">
						{formatMessage("dashboard.showing", { filter: search.filter })}
						{search.q !== "" ? (
							<>
								{" "}
								{formatMessage("dashboard.matching")} <q data-sensitive={true}>{search.q}</q>
							</>
						) : null}
						.
					</p>
					<form
						aria-label={formatMessage("dashboard.filterLabel")}
						onSubmit={(event) => {
							event.preventDefault();
						}}
					>
						<SureTextField
							label={formatMessage("dashboard.searchLabel")}
							name="q"
							placeholder={formatMessage("dashboard.searchPlaceholder")}
							value={search.q}
							onChange={(value) => {
								commit({ q: value });
							}}
						/>
						<SureSelect
							label={formatMessage("dashboard.statusLabel")}
							items={FILTER_OPTIONS}
							selectedKey={search.filter}
							onSelectionChange={(key) => {
								if (key === "all" || key === "active" || key === "archived") {
									commit({ filter: key });
								}
							}}
						/>
					</form>
					<p>
						<Link
							to="/dashboard"
							search={{ q: search.q, filter: search.filter }}
							data-testid="dashboard-deep-link"
						>
							{formatMessage("dashboard.deepLink")}
						</Link>{" "}
						<Link
							to="/settings"
							search={{ section: "profile" }}
							data-testid="dashboard-to-settings"
						>
							{formatMessage("dashboard.goToSettings")}
						</Link>
					</p>
				</SureCardContent>
			</SureCard>
		</>
	);
}
