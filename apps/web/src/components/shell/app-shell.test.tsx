// AppShell tests (t_alt_fnd_010).
//
// Landmarks, skip links, capability-derived navigation, breadcrumbs,
// page titles, keyboard operability, and focus management — including
// focus restoration when the page title changes (route navigation).
//
// @vitest-environment jsdom
import {
	Link,
	Outlet,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
	useRouter,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell, PageHeader } from "./app-shell";
import { expectNoAxeViolations } from "../ui/a11y-assert";
import type { BffSessionStatus } from "~/lib/bff-auth-client";
import { deriveCapabilities } from "~/lib/app-capabilities";
import {
	resetClientSideNavigationForTests,
	useMarkClientSideNavigations,
} from "~/lib/navigation-focus";

// Navigation tracking is module state (reset on real page loads): reset it
// per test so suites observe a fresh page load unless they navigate.
beforeEach(() => {
	resetClientSideNavigationForTests();
});

function signedIn(role?: string): BffSessionStatus {
	return {
		authenticated: true,
		user: {
			id: "user-1",
			email: "member@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			uiLayout: "dashboard",
			aiEnabled: false,
			...(role === undefined ? {} : { role }),
		},
		csrfToken: "csrf-token",
	};
}

/** Test harness mirroring production wiring: the root installs navigation
 * tracking (RootComponent) while leaf routes own their PageHeader. */
function Tracker(): React.ReactElement {
	const router = useRouter();
	useMarkClientSideNavigations(router.history);
	return <Outlet />;
}

/** Minimal memory router hosting the shell (Link needs context). */
async function renderInRouter(ui: React.ReactElement, initialPath = "/dashboard"): Promise<void> {
	const rootRoute = createRootRoute({ component: () => ui });
	const dashboardRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/dashboard",
		component: () => null,
	});
	const settingsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/settings",
		component: () => null,
	});
	const adminRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/admin",
		component: () => null,
	});
	const loginRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/login",
		component: () => null,
	});
	const logoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/logout",
		component: () => null,
	});
	const routeTree = rootRoute.addChildren([
		dashboardRoute,
		settingsRoute,
		adminRoute,
		loginRoute,
		logoutRoute,
	]);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [initialPath] }),
	});
	await router.load();
	render(<RouterProvider router={router} />);
}

describe("AppShell landmarks and skip links", () => {
	it("renders banner, primary nav, and main landmarks", async () => {
		await renderInRouter(
			<AppShell capabilities={deriveCapabilities(signedIn("member"))} session={signedIn("member")}>
				<PageHeader title="Dashboard" />
			</AppShell>,
		);
		expect(screen.getByRole("banner")).toBeDefined();
		expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
		expect(screen.getByRole("main")).toBeDefined();
		expect(screen.getByTestId("page-title")).toHaveTextContent("Dashboard");
	});

	it("derives navigation from capabilities, hiding admin for members", async () => {
		await renderInRouter(
			<AppShell capabilities={deriveCapabilities(signedIn("member"))} session={signedIn("member")}>
				<PageHeader title="Dashboard" />
			</AppShell>,
		);
		const nav = screen.getByRole("navigation", { name: "Primary" });
		expect(within(nav).getByRole("link", { name: "Dashboard" })).toBeDefined();
		expect(within(nav).getByRole("link", { name: "Settings" })).toBeDefined();
		expect(within(nav).queryByRole("link", { name: "Admin" })).toBeNull();
	});

	it("shows admin navigation for admins", async () => {
		await renderInRouter(
			<AppShell capabilities={deriveCapabilities(signedIn("admin"))} session={signedIn("admin")}>
				<PageHeader title="Admin" />
			</AppShell>,
		);
		expect(
			within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", {
				name: "Admin",
			}),
		).toBeDefined();
	});

	it("uses one adaptive nav for sidebar and bottom layouts", async () => {
		await renderInRouter(
			<AppShell capabilities={deriveCapabilities(signedIn("member"))} session={signedIn("member")}>
				<PageHeader title="Dashboard" />
			</AppShell>,
		);
		// Single primary landmark (axe: exactly one); CSS switches the
		// sidebar ≥768px to the bottom bar below it (same DOM).
		expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(1);
		expect(screen.getByTestId("primary-nav")).toHaveAttribute(
			"data-layout",
			"adaptive-sidebar-bottom",
		);
	});

	it("renders breadcrumbs with aria-current on the page", async () => {
		await renderInRouter(
			<AppShell capabilities={deriveCapabilities(signedIn("member"))} session={signedIn("member")}>
				<PageHeader
					title="Account"
					breadcrumbs={[{ label: "Home", to: "/" }, { label: "Account" }]}
				/>
			</AppShell>,
		);
		const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
		expect(within(crumbs).getByText("Account")).toHaveAttribute("aria-current", "page");
	});
});

describe("AppShell keyboard and focus management", () => {
	it("tabs through skip links first, then activates main-content skip", async () => {
		const user = userEvent.setup();
		await renderInRouter(
			<AppShell capabilities={deriveCapabilities(signedIn("member"))} session={signedIn("member")}>
				<PageHeader title="Dashboard" />
				<button type="button">Body action</button>
			</AppShell>,
		);
		// Fresh loads leave focus at the top of the document, so the first
		// tab stop is the skip link — the heading never steals it on mount.
		expect(document.activeElement === document.body).toBe(true);
		await user.tab();
		expect(screen.getByText("Skip to main content")).toHaveFocus();
		await user.tab();
		expect(screen.getByText("Skip to navigation")).toHaveFocus();
		// Activate the first skip link: focus lands in the main landmark.
		await user.tab({ shift: true });
		await user.keyboard("{Enter}");
		expect(screen.getByRole("main")).toHaveFocus();
	});

	it("moves focus to the new heading on client-side navigation", async () => {
		const user = userEvent.setup();
		function ShellPage({ title, next }: { title: string; next?: string }): React.ReactElement {
			return (
				<AppShell
					capabilities={deriveCapabilities(signedIn("member"))}
					session={signedIn("member")}
				>
					<PageHeader title={title} />
					{next === undefined ? null : <Link to={next}>Go onward</Link>}
				</AppShell>
			);
		}
		const trackingRoot = createRootRoute({ component: Tracker });
		const oneRoute = createRoute({
			getParentRoute: () => trackingRoot,
			path: "/one",
			component: () => <ShellPage title="One" next="/two" />,
		});
		const twoRoute = createRoute({
			getParentRoute: () => trackingRoot,
			path: "/two",
			component: () => <ShellPage title="Two" />,
		});
		// Stubs for the shell navigation targets (never visited here, but
		// the primary nav links to them).
		const stubPaths = ["/dashboard", "/settings", "/admin", "/login", "/logout"] as const;
		const stubs = stubPaths.map((stubPath) =>
			createRoute({ getParentRoute: () => trackingRoot, path: stubPath, component: () => null }),
		);
		const navRouter = createRouter({
			routeTree: trackingRoot.addChildren([oneRoute, twoRoute, ...stubs]),
			history: createMemoryHistory({ initialEntries: ["/one"] }),
		});
		await navRouter.load();
		render(<RouterProvider router={navRouter} />);
		// Fresh load: heading rendered but focus left at the document top.
		expect(screen.getByTestId("page-title")).toHaveTextContent("One");
		expect(document.activeElement === document.body).toBe(true);
		// Client-side navigation: focus moves to the new page heading and
		// the document title follows the route.
		await user.click(screen.getByRole("link", { name: "Go onward" }));
		expect(await screen.findByText("Two")).toBeDefined();
		expect(document.title).toBe("Two · Sure Web");
		expect(screen.getByTestId("page-title")).toHaveFocus();
	});

	it("has no axe violations", async () => {
		await renderInRouter(
			<AppShell capabilities={deriveCapabilities(signedIn("admin"))} session={signedIn("admin")}>
				<PageHeader
					title="Dashboard"
					breadcrumbs={[{ label: "Home", to: "/" }, { label: "Dashboard" }]}
				/>
				<p>Body content.</p>
			</AppShell>,
		);
		await expectNoAxeViolations();
	});
});
