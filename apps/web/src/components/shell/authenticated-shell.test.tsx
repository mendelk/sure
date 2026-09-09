// AuthenticatedShell tests (t_alt_fnd_021).
//
// The shell consumes the shared `BFF_SESSION_QUERY_KEY` entry: a
// signed-out entry must leave no authenticated chrome visible (no user
// email, no admin navigation), even when the route-guard snapshot is
// still signed in. These suites fail against a shell that renders the
// guard snapshot directly.
//
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthenticatedShell } from "./authenticated-shell";
import { deriveCapabilities } from "~/lib/app-capabilities";
import { BFF_SESSION_QUERY_KEY } from "~/lib/bff-auth-client";
import type { BffSessionStatus } from "~/lib/bff-auth-client";

function adminSession(): BffSessionStatus {
	return {
		authenticated: true,
		user: {
			id: "user-1",
			email: "admin@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			uiLayout: "dashboard",
			aiEnabled: false,
			role: "admin",
		},
		csrfToken: "csrf-token",
	};
}

function signedOutStatus(): BffSessionStatus {
	return { authenticated: false, reason: "missing" };
}

async function renderShell(queryClient: QueryClient, session: BffSessionStatus): Promise<void> {
	const rootRoute = createRootRoute({
		component: () => (
			<QueryClientProvider client={queryClient}>
				<AuthenticatedShell session={session} capabilities={deriveCapabilities(session)}>
					<p data-testid="shell-child">workspace content</p>
				</AuthenticatedShell>
			</QueryClientProvider>
		),
	});
	const routeTree = rootRoute.addChildren(
		["/", "/dashboard", "/settings", "/admin", "/login", "/logout"].map((path) =>
			createRoute({
				getParentRoute: () => rootRoute,
				path,
				component: () => null,
			}),
		),
	);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	render(<RouterProvider router={router} />);
}

describe("AuthenticatedShell", () => {
	it("drops authenticated chrome when the shared entry is signed-out", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(BFF_SESSION_QUERY_KEY, signedOutStatus());

		await renderShell(queryClient, adminSession());

		expect(screen.getByTestId("shell-user")).toHaveTextContent("Signed out");
		expect(screen.getByTestId("shell-user")).not.toHaveTextContent("admin@example.com");
		expect(screen.getByRole("link", { name: "Log in" })).toBeDefined();
		expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
		expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
		expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
		expect(screen.getByTestId("shell-child")).toBeDefined();
	});

	it("renders the guard snapshot while the entry is empty", async () => {
		const queryClient = new QueryClient();

		await renderShell(queryClient, adminSession());

		expect(screen.getByTestId("shell-user")).toHaveTextContent("admin@example.com");
		expect(screen.getByRole("link", { name: "Admin" })).toBeDefined();
		expect(screen.getByRole("link", { name: "Dashboard" })).toBeDefined();
	});

	it("flips chrome when the entry is replaced after mount", async () => {
		const queryClient = new QueryClient();

		await renderShell(queryClient, adminSession());
		expect(screen.getByTestId("shell-user")).toHaveTextContent("admin@example.com");

		queryClient.setQueryData(BFF_SESSION_QUERY_KEY, signedOutStatus());

		await waitFor(() => {
			expect(screen.getByTestId("shell-user")).toHaveTextContent("Signed out");
		});
		expect(screen.getByTestId("shell-user")).not.toHaveTextContent("admin@example.com");
		expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
	});

	it("prefers the cached session over a stale snapshot", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(BFF_SESSION_QUERY_KEY, adminSession());

		await renderShell(queryClient, signedOutStatus());

		expect(screen.getByTestId("shell-user")).toHaveTextContent("admin@example.com");
		expect(screen.getByRole("link", { name: "Admin" })).toBeDefined();
	});
});
