import { createFileRoute, redirect } from "@tanstack/react-router";
import * as React from "react";
import { PageHeader } from "~/components/shell/app-shell";
import { RouteErrorState, RouteNotFound, RoutePending } from "~/components/shell/route-states";
import { SureAlert } from "~/components/ui/alert";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { guardCapability, loginSearchFor, unauthorizedSearchFor } from "~/lib/route-guards";
import { bffSessionStatusFn } from "../login";

/**
 * Admin route group (t_alt_fnd_010).
 *
 * Role guard, SSR-safe and failing closed: the `beforeLoad` reads the
 * sealed BFF session (never a client role string). Signed-out sessions
 * redirect to `/login?next=/admin`; signed-in sessions without the
 * server-derived `administer` capability redirect to
 * `/unauthorized?from=/admin`, which renders the route-level
 * unauthorized state. 403s from admin-only BFF calls would surface the
 * same state client-side.
 */
export const Route = createFileRoute("/_authenticated/admin")({
	beforeLoad: async ({ location }) => {
		const status = await bffSessionStatusFn();
		const decision = guardCapability(status, "administer");
		if (!decision.allowed) {
			const target = location.pathname + location.searchStr;
			if (decision.reason === "unauthenticated") {
				throw redirect({ to: "/login", search: loginSearchFor(target) });
			}
			throw redirect({ to: "/unauthorized", search: unauthorizedSearchFor(target) });
		}
		return { adminSession: status };
	},
	head: () => ({ meta: [{ title: "Admin · Sure Web" }] }),
	pendingComponent: () => <RoutePending label="Loading administration" />,
	notFoundComponent: () => <RouteNotFound />,
	errorComponent: ({ error, reset }) => (
		<RouteErrorState
			message={error instanceof Error ? error.message : "Administration could not be loaded."}
			onRetry={reset}
		/>
	),
	component: AdminPage,
});

function AdminPage(): React.ReactElement {
	return (
		<>
			<PageHeader title="Admin" breadcrumbs={[{ label: "Home", to: "/" }, { label: "Admin" }]} />
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>Family administration</SureCardTitle>
				</SureCardHeader>
				<SureCardContent>
					<SureAlert tone="info" title="Admins only">
						This area rendered because the server-validated session carries the administer
						capability. Everyone else sees the unauthorized state.
					</SureAlert>
					<p data-testid="admin-marker">Admin workspace content.</p>
				</SureCardContent>
			</SureCard>
		</>
	);
}
