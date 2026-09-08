import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import * as React from "react";
import { PageHeader } from "~/components/shell/app-shell";
import { RouteErrorState, RouteNotFound, RoutePending } from "~/components/shell/route-states";
import { guardCapability, loginSearchFor, unauthorizedSearchFor } from "~/lib/route-guards";
import { bffSessionStatusFn } from "../login";

/**
 * Settings route group (t_alt_fnd_010).
 *
 * Authenticated users with `manage-settings` (every signed-in session)
 * pass; signed-out sessions fall back to the parent authenticated guard,
 * and authenticated sessions without the capability fail closed to
 * `/unauthorized?from=<pathname>`. Child routes (`index`, `account`)
 * own typed search state and content; this layout owns the section
 * heading breadcrumb.
 */
export const Route = createFileRoute("/_authenticated/settings")({
	beforeLoad: async ({ location }) => {
		const status = await bffSessionStatusFn();
		const decision = guardCapability(status, "manage-settings");
		if (!decision.allowed) {
			const target = location.pathname + location.searchStr;
			if (decision.reason === "unauthenticated") {
				throw redirect({
					to: "/login",
					search: loginSearchFor(target),
				});
			}
			throw redirect({ to: "/unauthorized", search: unauthorizedSearchFor(target) });
		}
		return { settingsSession: status };
	},
	head: () => ({ meta: [{ title: "Settings · Sure Web" }] }),
	pendingComponent: () => <RoutePending label="Loading settings" />,
	notFoundComponent: () => <RouteNotFound />,
	errorComponent: ({ error, reset }) => (
		<RouteErrorState
			message={error instanceof Error ? error.message : "Settings could not be loaded."}
			onRetry={reset}
		/>
	),
	component: SettingsLayout,
});

function SettingsLayout(): React.ReactElement {
	return (
		<>
			<PageHeader
				title="Settings"
				breadcrumbs={[{ label: "Home", to: "/" }, { label: "Settings" }]}
			/>
			<Outlet />
		</>
	);
}
