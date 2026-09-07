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
import {
	getInitialTheme,
	sureThemeInlineScript,
} from "~/styles/theme";
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
	// Stored choice wins, otherwise the OS default. Resolved on mount (SSR
	// has no access to either); the inline script below already set
	// data-theme pre-paint so there is no light flash on dark systems.
	const [theme, setTheme] = useState<SureThemeName>("light");
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
	theme: SureThemeName;
}) {
	return (
		// The compiled StyleX theme class carries the semantic variables;
		// data-theme drives color-scheme via sure-theme.css.
		<html
			lang="en"
			data-theme={theme}
			{...stylex.props(theme === "dark" ? sureDarkTheme : sureLightTheme)}
		>
			<head>
				<HeadContent />
			</head>
			<body>
				<script dangerouslySetInnerHTML={{ __html: sureThemeInlineScript }} />
				{children}
				<Scripts />
			</body>
		</html>
	);
}
