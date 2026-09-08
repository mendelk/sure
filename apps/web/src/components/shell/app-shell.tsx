// Responsive authenticated app shell (t_alt_fnd_010).
//
// Chrome only: skip links, banner header, one adaptive primary nav
// (sidebar ≥768px, bottom bar below it — same items, CSS only, so axe
// sees a single primary landmark), and the main landmark. Page-level
// concerns (breadcrumbs, titles, focus) live in `PageHeader` below so
// each route owns its heading while the layout owns the chrome.
//
// Capability rule: the shell renders exactly
// `getVisibleNavItems(capabilities)` — capabilities come from the
// server-validated BFF session via route context, never from client
// storage or an assumed role string. Styling uses semantic StyleX vars
// only.
import { Link, useRouterState } from "@tanstack/react-router";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { useEffect, useRef } from "react";
import type { BffSessionStatus } from "~/lib/bff-auth-client";
import type { AppCapabilities } from "~/lib/app-capabilities";
import { getVisibleNavItems } from "~/lib/app-capabilities";
import { formatMessage } from "~/lib/i18n/messages";
import type { AppNavItem } from "~/lib/app-capabilities";
import { hasClientSideNavigated } from "~/lib/navigation-focus";
import { vars } from "~/styles/sure-tokens.stylex";
import { useThemeChoiceContext } from "~/styles/theme-choice-context";
import { sureFocus, sureFont } from "~/components/ui/sure-styles";
import { PresentationControls } from "~/components/preferences/presentation-controls";

export interface AppBreadcrumb {
	readonly label: string;
	readonly to?: string | undefined;
}

export interface AppShellProps {
	/** Server-derived capabilities (BFF session only). */
	capabilities: AppCapabilities;
	/** Session for the header identity row (display data only). */
	session: BffSessionStatus;
	children: React.ReactNode;
}

const shellStyles = stylex.create({
	skipLink: {
		position: "absolute",
		top: 8,
		left: 8,
		zIndex: 50,
		paddingBlock: 8,
		paddingInline: 12,
		backgroundColor: vars.bgInverse,
		color: vars.textInverse,
		borderRadius: vars.radiusMd,
		fontSize: 14,
		transform: "translateY(-200%)",
		":focus": {
			transform: "translateY(0)",
		},
	},
	header: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingBlock: 12,
		paddingInline: 20,
		backgroundColor: vars.container,
		borderBottomStyle: "solid",
		borderBottomWidth: 1,
		borderBottomColor: vars.borderSubdued,
	},
	brand: {
		fontWeight: vars.fontWeightSemibold,
		fontSize: 16,
		color: vars.textPrimary,
		textDecorationLine: "none",
	},
	userRow: {
		display: "flex",
		alignItems: "center",
		gap: 12,
		fontSize: 13,
		color: vars.textSecondary,
	},
	body: {
		display: "flex",
		flex: 1,
		minHeight: 0,
		"@media (max-width: 767px)": {
			flexDirection: "column",
			paddingBottom: 72,
		},
	},
	// Single adaptive primary nav: vertical sidebar on desktop, fixed
	// bottom bar on mobile. Same DOM + items in both layouts.
	primaryNav: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		width: 240,
		flexShrink: 0,
		paddingBlock: 16,
		paddingInline: 12,
		backgroundColor: vars.container,
		borderRightStyle: "solid",
		borderRightWidth: 1,
		borderRightColor: vars.borderSubdued,
		"@media (max-width: 767px)": {
			position: "fixed",
			bottom: 0,
			left: 0,
			right: 0,
			zIndex: 40,
			flexDirection: "row",
			justifyContent: "space-around",
			width: "auto",
			paddingBlock: 8,
			paddingInline: 8,
			borderRightStyle: "none",
			borderRightWidth: 0,
			borderTopStyle: "solid",
			borderTopWidth: 1,
			borderTopColor: vars.borderSubdued,
		},
	},
	navList: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		listStyleType: "none",
		marginTop: 0,
		marginBottom: 0,
		paddingLeft: 0,
		"@media (max-width: 767px)": {
			flexDirection: "row",
			justifyContent: "space-around",
			width: "100%",
		},
	},
	navItem: {
		"@media (max-width: 767px)": {
			flex: 1,
			textAlign: "center",
		},
	},
	navLink: {
		display: "block",
		paddingBlock: 8,
		paddingInline: 12,
		borderRadius: vars.radiusMd,
		color: vars.textSecondary,
		textDecorationLine: "none",
		fontSize: 14,
	},
	main: {
		flex: 1,
		minWidth: 0,
		paddingBlock: 24,
		paddingInline: 24,
		backgroundColor: vars.surface,
		color: vars.textPrimary,
		"@media (max-width: 767px)": {
			paddingBlock: 16,
			paddingInline: 16,
		},
	},
});

const pageStyles = stylex.create({
	crumbNav: {
		marginBottom: 12,
		fontSize: 13,
		color: vars.textSecondary,
	},
	crumbList: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
		listStyleType: "none",
		marginTop: 0,
		marginBottom: 0,
		paddingLeft: 0,
	},
	heading: {
		marginTop: 0,
		marginBottom: 16,
		fontSize: 24,
		fontWeight: vars.fontWeightSemibold,
		color: vars.textPrimary,
	},
});

function UserIdentity({ session }: { session: BffSessionStatus }): React.ReactElement {
	if (!session.authenticated) {
		return (
			<span data-testid="shell-user">
				{formatMessage("shell.signedOut")}{" "}
				<Link to="/login" {...stylex.props(sureFocus.ring)}>
					{formatMessage("shell.logIn")}
				</Link>
			</span>
		);
	}
	return (
		<span data-testid="shell-user" data-sensitive={true}>
			{session.user.email} <Link to="/logout">{formatMessage("shell.logOut")}</Link>
		</span>
	);
}

export function navItemLabel(item: AppNavItem): string {
	return formatMessage(item.labelKey);
}

export function AppShell({ capabilities, session, children }: AppShellProps): React.ReactElement {
	const items = getVisibleNavItems(capabilities);
	const mainRef = useRef<HTMLElement>(null);
	const { choice: themeChoice, setChoice: setThemeChoice } = useThemeChoiceContext();

	function skipToMain(event: React.SyntheticEvent<HTMLAnchorElement>): void {
		event.preventDefault();
		mainRef.current?.focus();
	}

	return (
		<div {...stylex.props(sureFont.base)}>
			<a
				href="#main-content"
				onClick={skipToMain}
				{...stylex.props(shellStyles.skipLink, sureFocus.ring)}
			>
				{formatMessage("shell.skipToMain")}
			</a>
			<a
				href="#primary-nav"
				onClick={skipToPrimaryNav}
				{...stylex.props(shellStyles.skipLink, sureFocus.ring)}
			>
				{formatMessage("shell.skipToNav")}
			</a>
			<header {...stylex.props(shellStyles.header)}>
				<Link
					to="/dashboard"
					search={{ q: "", filter: "all" }}
					{...stylex.props(shellStyles.brand, sureFocus.ring)}
				>
					{formatMessage("shell.brand")}
				</Link>
				<div {...stylex.props(shellStyles.userRow)}>
					<UserIdentity session={session} />
					<div data-testid="presentation-controls">
						<PresentationControls themeChoice={themeChoice} onThemeChoice={setThemeChoice} />
					</div>
				</div>
			</header>
			<div {...stylex.props(shellStyles.body)}>
				<nav
					id="primary-nav"
					aria-label={formatMessage("shell.navPrimary")}
					data-testid="primary-nav"
					data-layout="adaptive-sidebar-bottom"
					tabIndex={-1}
					{...stylex.props(shellStyles.primaryNav)}
				>
					<ul {...stylex.props(shellStyles.navList)}>
						{items.map((item) => (
							<li key={item.id} {...stylex.props(shellStyles.navItem)}>
								{item.id === "dashboard" ? (
									<Link
										to="/dashboard"
										search={{ q: "", filter: "all" }}
										activeProps={{ "data-active": "true" }}
										{...stylex.props(shellStyles.navLink, sureFocus.ring)}
									>
										{navItemLabel(item)}
									</Link>
								) : item.id === "settings" ? (
									<Link
										to="/settings"
										search={{ section: "profile" }}
										activeProps={{ "data-active": "true" }}
										{...stylex.props(shellStyles.navLink, sureFocus.ring)}
									>
										{navItemLabel(item)}
									</Link>
								) : (
									<Link
										to="/admin"
										activeProps={{ "data-active": "true" }}
										{...stylex.props(shellStyles.navLink, sureFocus.ring)}
									>
										{navItemLabel(item)}
									</Link>
								)}
							</li>
						))}
					</ul>
				</nav>
				<main
					id="main-content"
					ref={mainRef}
					tabIndex={-1}
					data-testid="main-content"
					{...stylex.props(shellStyles.main, sureFocus.ring)}
				>
					{children}
				</main>
			</div>
		</div>
	);
}

function skipToPrimaryNav(event: React.SyntheticEvent<HTMLAnchorElement>): void {
	event.preventDefault();
	const nav = document.getElementById("primary-nav");
	nav?.focus();
	nav?.querySelector("a")?.focus();
}

export interface PageHeaderProps {
	/** Page title: heading text + `document.title` (`"<title> · Sure Web"`). */
	title: string;
	/** Breadcrumb trail (last item is current page, no link). */
	breadcrumbs?: readonly AppBreadcrumb[] | undefined;
}

/**
 * Page title block for routes inside the shell: breadcrumb navigation
 * plus the page `h1`. Owns focus management — after a client-side route
 * change, focus moves to the new heading so keyboard and screen-reader
 * users land on the new page (this also covers back/forward focus
 * restoration). Fresh page loads deliberately leave focus alone so the
 * tab order starts at the skip links. The heading is `tabIndex={-1}`
 * (programmatic focus only, never in tab order).
 */
export function PageHeader({ title, breadcrumbs = [] }: PageHeaderProps): React.ReactElement {
	const headingRef = useRef<HTMLHeadingElement>(null);
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const previousPathname = useRef(pathname);

	useEffect(() => {
		document.title = formatMessage("app.documentTitle", { title });
	}, [title]);

	useEffect(() => {
		const routeChanged = previousPathname.current !== pathname;
		previousPathname.current = pathname;
		// Fresh page loads leave focus at the top of the document so the
		// tab order starts at the skip links. Client-side navigations
		// (in-app moves, back/forward, the post-login redirect) move focus
		// to the new page heading instead, so keyboard and screen-reader
		// users land on the new page. The heading is `tabIndex={-1}`
		// (programmatic focus only, never in tab order).
		if (routeChanged || hasClientSideNavigated()) {
			headingRef.current?.focus({ preventScroll: false });
		}
	}, [pathname, title]);

	return (
		<>
			{breadcrumbs.length > 0 ? (
				<nav aria-label={formatMessage("shell.breadcrumb")} {...stylex.props(pageStyles.crumbNav)}>
					<ol {...stylex.props(pageStyles.crumbList)}>
						{breadcrumbs.map((crumb, index) => {
							const isLast = index === breadcrumbs.length - 1;
							return (
								<li key={`${crumb.label}-${String(index)}`}>
									{crumb.to !== undefined && !isLast ? (
										<>
											<Link to={crumb.to}>{crumb.label}</Link>
											<span aria-hidden="true"> / </span>
										</>
									) : (
										<span aria-current={isLast ? "page" : undefined}>{crumb.label}</span>
									)}
								</li>
							);
						})}
					</ol>
				</nav>
			) : null}
			<h1
				ref={headingRef}
				tabIndex={-1}
				data-testid="page-title"
				{...stylex.props(pageStyles.heading, sureFocus.ring)}
			>
				{title}
			</h1>
		</>
	);
}

export { shellStyles };
