// Route-state tests (t_alt_fnd_010): every route-level outcome renders
// an accessible DS shape with zero axe violations.
//
// @vitest-environment jsdom
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, renderInMain } from "../ui/a11y-assert";
import { RouteErrorState, RouteNotFound, RoutePending, RouteUnauthorized } from "./route-states";

async function renderInRouter(ui: React.ReactElement): Promise<void> {
	const rootRoute = createRootRoute({ component: () => ui });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => null,
	});
	const dashboardRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/dashboard",
		component: () => null,
	});
	const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute]);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	render(<RouterProvider router={router} />);
}

describe("route states", () => {
	it("pending renders a labeled loading region", async () => {
		renderInMain(<RoutePending label="Loading dashboard" />);
		expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("not-found explains and links back (router link)", async () => {
		await renderInRouter(
			<main>
				<RouteNotFound />
			</main>,
		);
		expect(screen.getByText("Page not found")).toBeDefined();
		expect(screen.getByRole("link", { name: "Back to dashboard" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("unauthorized explains the missing capability", async () => {
		await renderInRouter(
			<main>
				<RouteUnauthorized />
			</main>,
		);
		expect(screen.getByText("Not authorized")).toBeDefined();
		expect(screen.getByRole("link", { name: "Back to dashboard" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("error renders an alert with a retry action", async () => {
		const onRetry = vi.fn<() => void>();
		renderInMain(
			<RouteErrorState message="The dashboard could not be loaded." onRetry={onRetry} />,
		);
		expect(screen.getByRole("alert")).toBeDefined();
		expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
		await expectNoAxeViolations();
	});
});
