/// <reference types="vite/client" />
import {
	HeadContent,
	Link,
	Outlet,
	Scripts,
	createRootRouteWithContext,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { useEffect, useState } from "react";
import { sureDarkTheme, sureLightTheme } from "~/styles/sure-tokens.stylex";
import { getInitialTheme } from "~/styles/theme";
import type { SureThemeName } from "~/styles/theme";
import appCss from "~/styles/app.css?url";
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
			{ title: "Sure Web" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootComponent,
});

function RootComponent() {
	// Stored choice wins, otherwise the OS default. Unresolved (null) until
	// hydration: SSR and the first client render agree on "no theme yet", so
	// there is no hydration mismatch, and no inline script is needed
	// (ADR-0001 REQ-TRAN-02 forbids inline scripts under the enforced CSP).
	// Pre-hydration, data-theme stays absent so sure-theme.css gives UA chrome
	// the correct light/dark system default via color-scheme, while app
	// surfaces fall back to the compiled light semantic variables (see
	// RootDocument). The stored/OS choice resolves in the effect below.
	const [theme, setTheme] = useState<SureThemeName | null>(null);
	useEffect(() => {
		setTheme(
			getInitialTheme(
				localStorage.getItem("sure-theme"),
				window.matchMedia("(prefers-color-scheme: dark)").matches,
			),
		);
	}, []);

	return (
		<RootDocument theme={theme}>
			<header className="sure-nav">
				<Link to="/" activeOptions={{ exact: true }}>
					Sure Web
				</Link>
			</header>
			<main>
				<Outlet />
			</main>
		</RootDocument>
	);
}

function RootDocument({
	children,
	theme,
}: {
	children: React.ReactNode;
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
			{...stylex.props(theme === "dark" ? sureDarkTheme : sureLightTheme)}
		>
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
