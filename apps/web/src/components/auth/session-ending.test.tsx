// SessionEndingGuard tests (t_alt_fnd_021).
//
// Every session-ending failure code (`api-mismatch`, `logged-out`,
// `deactivated`, `session-expired`) clears the `BFF_SESSION_QUERY_KEY`
// entry and renders the signed-out state; every other outcome keeps the
// cached session and renders children untouched.
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
import { BFF_SESSION_QUERY_KEY } from "~/lib/bff-auth-client";
import type { BffSessionStatus } from "~/lib/bff-auth-client";
import { SessionEndingGuard } from "./session-ending";
import type { SessionEndingResult } from "./session-ending";

const ENDING_CODES = [
	"api-mismatch",
	"api-too-old",
	"api-too-new",
	"api-missing-capability",
	"logged-out",
	"deactivated",
	"session-expired",
	"invalid-refresh",
] as const;
const KEEP_CODES = ["throttled", "unavailable", "csrf", "origin"] as const;

function signedInStatus(): BffSessionStatus {
	return {
		authenticated: true,
		user: {
			id: "user-1",
			email: "member@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			uiLayout: "dashboard",
			aiEnabled: false,
		},
		csrfToken: "csrf-token",
	};
}

async function renderGuard(queryClient: QueryClient, result: SessionEndingResult): Promise<void> {
	const rootRoute = createRootRoute({
		component: () => (
			<QueryClientProvider client={queryClient}>
				<SessionEndingGuard result={result}>
					<p data-testid="guard-child">live content</p>
				</SessionEndingGuard>
			</QueryClientProvider>
		),
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => null,
	});
	const loginRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/login",
		component: () => null,
	});
	const routeTree = rootRoute.addChildren([indexRoute, loginRoute]);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	render(<RouterProvider router={router} />);
}

describe("SessionEndingGuard", () => {
	for (const code of ENDING_CODES) {
		it(`clears local session state and renders signed-out on ${code}`, async () => {
			const queryClient = new QueryClient();
			queryClient.setQueryData(BFF_SESSION_QUERY_KEY, signedInStatus());

			await renderGuard(queryClient, { ok: false, error: { code } });

			expect(screen.getByTestId("session-signed-out")).toBeDefined();
			expect(screen.getByRole("link", { name: "Log in" })).toBeDefined();
			expect(screen.queryByTestId("guard-child")).toBeNull();
			await waitFor(() => {
				expect(queryClient.getQueryData(BFF_SESSION_QUERY_KEY)).toEqual({
					authenticated: false,
					reason: "missing",
				});
			});
		});
	}

	for (const code of KEEP_CODES) {
		it(`keeps the cached session on ${code}`, async () => {
			const queryClient = new QueryClient();
			queryClient.setQueryData(BFF_SESSION_QUERY_KEY, signedInStatus());

			await renderGuard(queryClient, { ok: false, error: { code } });

			expect(screen.getByTestId("guard-child")).toBeDefined();
			expect(screen.queryByTestId("session-signed-out")).toBeNull();
			expect(queryClient.getQueryData(BFF_SESSION_QUERY_KEY)).toEqual(signedInStatus());
		});
	}

	it("renders children without touching the cache on success", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(BFF_SESSION_QUERY_KEY, signedInStatus());

		await renderGuard(queryClient, { ok: true });

		expect(screen.getByTestId("guard-child")).toBeDefined();
		expect(queryClient.getQueryData(BFF_SESSION_QUERY_KEY)).toEqual(signedInStatus());
	});
});
