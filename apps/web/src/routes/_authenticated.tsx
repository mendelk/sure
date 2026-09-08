import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import * as React from "react";
import { AppShell } from "~/components/shell/app-shell";
import { RouteErrorState, RouteNotFound, RoutePending } from "~/components/shell/route-states";
import { formatMessage } from "~/lib/i18n/messages";
import { guardAuthenticated, loginSearchFor } from "~/lib/route-guards";
import { bffSessionStatusFn } from "./login";

/**
 * Authenticated route group (t_alt_fnd_010).
 *
 * SSR-safe guard: `beforeLoad` runs on the server during SSR and on the
 * client during navigation. It reads the sealed BFF session through the
 * status server function (cookie-reading server-side, credentialed RPC
 * client-side — never `localStorage`, never browser globals), then
 * fails closed to `/login?next=<pathname>` when signed out. The derived
 * capability map travels in route context so the shell and every child
 * render capability-derived navigation from the same server-validated
 * source.
 */
export const Route = createFileRoute("/_authenticated")({
	beforeLoad: async ({ location }) => {
		const status = await bffSessionStatusFn();
		const decision = guardAuthenticated(status);
		if (!decision.allowed) {
			throw redirect({
				to: "/login",
				search: loginSearchFor(location.pathname + location.searchStr),
			});
		}
		return { session: status, capabilities: decision.capabilities };
	},
	pendingComponent: () => <RoutePending label={formatMessage("routes.loadingWorkspace")} />,
	notFoundComponent: () => <RouteNotFound />,
	errorComponent: ({ error, reset }) => (
		<RouteErrorState
			message={error instanceof Error ? error.message : formatMessage("routes.workspaceError")}
			onRetry={reset}
		/>
	),
	head: () => ({ meta: [{ title: formatMessage("app.title") }] }),
	component: AuthenticatedLayout,
});

function AuthenticatedLayout(): React.ReactElement {
	const { session, capabilities } = Route.useRouteContext();
	return (
		<AppShell session={session} capabilities={capabilities}>
			<Outlet />
		</AppShell>
	);
}
