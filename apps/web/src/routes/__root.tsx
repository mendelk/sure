/// <reference types="vite/client" />
import {
	HeadContent,
	Outlet,
	Scripts,
	createRootRouteWithContext,
	useRouter,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { PublicChrome } from "~/components/shell/public-chrome";
import { RouteErrorState, RouteNotFound, RoutePending } from "~/components/shell/route-states";
import { LocaleProvider } from "~/lib/i18n/i18n-provider";
import { formatMessage } from "~/lib/i18n/messages";
import { PrivacyProvider } from "~/lib/privacy/privacy-provider";
import { useMarkClientSideNavigations } from "~/lib/navigation-focus";
import { sureDarkTheme, sureLightTheme, vars } from "~/styles/sure-tokens.stylex";
import { ThemeChoiceProvider } from "~/styles/theme-choice-context";
import { useThemeChoice } from "~/styles/use-theme-choice";
import type { SureThemeName } from "~/styles/theme";
import appCss from "~/styles/app.css?url";

// Paint the page surface explicitly from the semantic tokens so the app never
// depends on the webview's default canvas color. Embedded browsers (Orca's
// webview, Electron) can leave the root transparent and resolve dark mode,
// rendering white-on-white or black-on-black; vars.surface/vars.textPrimary
// on <html> guarantee an opaque, theme-correct page background in every
// host, including pre-hydration SSR.
const styles = stylex.create({
	root: {
		backgroundColor: vars.surface,
		color: vars.textPrimary,
		minHeight: "100vh",
	},
});
// Static theme shell (color-scheme defaults, reduced-motion + forced-colors
// guards). Side-effect import so the StyleX plugin emits it alongside the
// compiled theme CSS. The semantic values ship via sure-tokens.stylex.ts.
import "~/styles/sure-theme.css";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: formatMessage("app.title") },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			// StyleX dev runtime (vite dev only): @stylexjs/unplugin serves
			// the compiled theme CSS at /virtual:stylex.css and live-updates
			// it over HMR, but it injects the reference via Vite's
			// transformIndexHtml hook — which TanStack Start never calls
			// (it builds <head> from this function instead). Without this
			// link the theme classes on <html> resolve to nothing and the
			// page renders unstyled in dev. Production builds emit real CSS
			// files instead, so this entry is dev-only by construction.
			...(import.meta.env.DEV ? [{ rel: "stylesheet", href: "/virtual:stylex.css" }] : []),
		],
		scripts: import.meta.env.DEV
			? // Paired with the link above: fetches /virtual:stylex.css into
				// a <style> tag and refreshes it on `stylex:css-update` HMR
				// events. Served through Vite's module pipeline (note the
				// /@id/ prefix), so import.meta.hot is defined — the plain
				// middleware path would skip HMR registration. Dev only.
				[{ type: "module", src: "/@id/virtual:stylex:runtime" }]
			: [],
	}),
	// Route-level states shared by every group (t_alt_fnd_010): pending
	// skeletons, accessible not-found, and unexpected-error cards. Group
	// layouts and leaf routes override with shell-aware copies where the
	// authenticated chrome should persist.
	pendingComponent: () => <RoutePending label={formatMessage("routes.loadingSure")} />,
	notFoundComponent: () => (
		<PublicChrome>
			<RouteNotFound />
		</PublicChrome>
	),
	errorComponent: ({ error, reset }) => (
		<RouteErrorState
			message={error instanceof Error ? error.message : formatMessage("routes.errorFallback")}
			onRetry={reset}
		/>
	),
	component: RootComponent,
});

function RootComponent() {
	// Navigation tracking for focus management (t_alt_fnd_010): installed
	// once at the router root so it observes every client-side navigation
	// (login redirects, in-app moves, back/forward) and resets on full
	// page loads with the module state. PageHeader consults it to decide
	// whether a fresh heading may take focus.
	const router = useRouter();
	useMarkClientSideNavigations(router.history);
	// Theme choice (light/dark/system) resolves post-hydration via
	// `useThemeChoice`: SSR and the first client render agree on "no theme
	// yet" (null), so there is no hydration mismatch, and no inline script
	// is needed (ADR-0001 REQ-TRAN-02 forbids inline scripts under the
	// enforced CSP). Pre-hydration, data-theme stays absent so
	// sure-theme.css gives UA chrome the correct light/dark system default
	// via color-scheme, while app surfaces fall back to the compiled light
	// semantic variables (see RootDocument). The stored/system choice
	// resolves in the hook's effect (and follows OS changes while the
	// choice is "system"). Locale and privacy providers follow the same
	// default-until-hydration pattern (t_alt_fnd_011).
	const themeState = useThemeChoice();

	return (
		<RootDocument theme={themeState.theme}>
			<ThemeChoiceProvider value={themeState}>
				<LocaleProvider>
					<PrivacyProvider>
						<Outlet />
					</PrivacyProvider>
				</LocaleProvider>
			</ThemeChoiceProvider>
		</RootDocument>
	);
}

// Exported for SSR/hydration tests (t_alt_fnd_011): suites render this
// with `theme={null}` on both server and client and assert the markup
// agrees exactly (no data-theme, light fallback), then resolve stored or
// system themes post-hydration without mismatch.
//
// `ThemedHtml` is the pure document shell (no router context) so tests
// can server-render and hydrate it directly; `RootDocument` adds the
// TanStack head/scripts around the same shell.
export function ThemedHtml({
	head,
	body,
	theme,
}: {
	head: React.ReactNode;
	body: React.ReactNode;
	theme: SureThemeName | null;
}) {
	return (
		// The compiled StyleX theme class carries the semantic variables;
		// data-theme drives color-scheme via sure-theme.css. While theme is
		// null (SSR through hydration), data-theme stays absent so SSR output
		// matches the first client render exactly, and the light theme class
		// applies as the pre-hydration fallback: its values are identical to
		// the defineVars defaults, so app surfaces render light semantics
		// until the stored/OS choice resolves.
		<html
			lang="en"
			data-theme={theme ?? undefined}
			{...stylex.props(theme === "dark" ? sureDarkTheme : sureLightTheme, styles.root)}
		>
			<head>{head}</head>
			<body>{body}</body>
		</html>
	);
}

export function RootDocument({
	children,
	theme,
}: {
	children: React.ReactNode;
	theme: SureThemeName | null;
}) {
	return (
		<ThemedHtml
			theme={theme}
			head={<HeadContent />}
			body={
				<>
					{children}
					<Scripts />
				</>
			}
		/>
	);
}
