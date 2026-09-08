import { createFileRoute, redirect } from "@tanstack/react-router";
import * as React from "react";
import { PageHeader } from "~/components/shell/app-shell";
import { RouteErrorState, RouteNotFound, RoutePending } from "~/components/shell/route-states";
import { SureAlert } from "~/components/ui/alert";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { formatMessage } from "~/lib/i18n/messages";
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
	head: () => ({
		meta: [
			{
				title: formatMessage("app.documentTitle", {
					title: formatMessage("admin.title"),
				}),
			},
		],
	}),
	pendingComponent: () => <RoutePending label={formatMessage("routes.loadingAdmin")} />,
	notFoundComponent: () => <RouteNotFound />,
	errorComponent: ({ error, reset }) => (
		<RouteErrorState
			message={error instanceof Error ? error.message : formatMessage("routes.adminError")}
			onRetry={reset}
		/>
	),
	component: AdminPage,
});

function AdminPage(): React.ReactElement {
	return (
		<>
			<PageHeader
				title={formatMessage("admin.title")}
				breadcrumbs={[
					{ label: formatMessage("admin.homeCrumb"), to: "/" },
					{ label: formatMessage("admin.title") },
				]}
			/>
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>{formatMessage("admin.cardTitle")}</SureCardTitle>
				</SureCardHeader>
				<SureCardContent>
					<SureAlert tone="info" title={formatMessage("admin.onlyTitle")}>
						{formatMessage("admin.onlyBody")}
					</SureAlert>
					<p data-testid="admin-marker">{formatMessage("admin.marker")}</p>
				</SureCardContent>
			</SureCard>
		</>
	);
}
