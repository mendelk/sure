import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { PageHeader } from "~/components/shell/app-shell";
import { RouteErrorState, RouteNotFound, RoutePending } from "~/components/shell/route-states";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { SureSelect } from "~/components/ui/select";
import { SureTextField } from "~/components/ui/text-field";
import type { DashboardFilter } from "~/lib/app-search";
import { parseDashboardSearch } from "~/lib/app-search";

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
	head: () => ({ meta: [{ title: "Dashboard · Sure Web" }] }),
	pendingComponent: () => <RoutePending label="Loading dashboard" />,
	notFoundComponent: () => <RouteNotFound />,
	errorComponent: ({ error, reset }) => (
		<RouteErrorState
			message={error instanceof Error ? error.message : "The dashboard could not be loaded."}
			onRetry={reset}
		/>
	),
	component: DashboardPage,
});

const FILTER_OPTIONS: readonly { id: DashboardFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "active", label: "Active" },
	{ id: "archived", label: "Archived" },
];

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
				title="Dashboard"
				breadcrumbs={[{ label: "Home", to: "/" }, { label: "Dashboard" }]}
			/>
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>Workspace overview</SureCardTitle>
				</SureCardHeader>
				<SureCardContent>
					<p data-testid="dashboard-search-state">
						Showing {search.filter} items
						{search.q !== "" ? (
							<>
								{" "}
								matching <q data-sensitive={true}>{search.q}</q>
							</>
						) : null}
						.
					</p>
					<form
						aria-label="Filter workspace items"
						onSubmit={(event) => {
							event.preventDefault();
						}}
					>
						<SureTextField
							label="Search"
							name="q"
							placeholder="Search items"
							value={search.q}
							onChange={(value) => {
								commit({ q: value });
							}}
						/>
						<SureSelect
							label="Status filter"
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
							Deep link to this filtered view
						</Link>{" "}
						<Link
							to="/settings"
							search={{ section: "profile" }}
							data-testid="dashboard-to-settings"
						>
							Go to settings
						</Link>
					</p>
				</SureCardContent>
			</SureCard>
		</>
	);
}
