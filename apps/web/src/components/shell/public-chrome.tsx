// Public (unauthenticated) chrome (t_alt_fnd_010).
//
// Minimal banner + constrained main for the public group (`/`, `/login`,
// `/logout`, `/unauthorized`): one `header`, one `main`, semantic StyleX
// vars only. Authenticated routes use `AppShell` instead — never both.
import { Link } from "@tanstack/react-router";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { formatMessage } from "~/lib/i18n/messages";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFocus, sureFont } from "~/components/ui/sure-styles";

const publicStyles = stylex.create({
	wrap: {
		backgroundColor: vars.surface,
		color: vars.textPrimary,
		minHeight: "100vh",
	},
	nav: {
		display: "flex",
		alignItems: "center",
		gap: 16,
		paddingBlock: 12,
		paddingInline: 20,
		backgroundColor: vars.container,
		borderBottomStyle: "solid",
		borderBottomWidth: 1,
		borderBottomColor: vars.borderSubdued,
	},
	main: {
		maxWidth: 720,
		marginLeft: "auto",
		marginRight: "auto",
		paddingBlock: 32,
		paddingInline: 20,
	},
});

export function PublicChrome({ children }: { children: React.ReactNode }): React.ReactElement {
	return (
		<div {...stylex.props(sureFont.base, publicStyles.wrap)}>
			<a href="#public-main" {...stylex.props(sureFocus.ring)}>
				{formatMessage("public.skipToMain")}
			</a>
			<header {...stylex.props(publicStyles.nav)}>
				<Link to="/" activeOptions={{ exact: true }}>
					{formatMessage("public.brand")}
				</Link>{" "}
				<Link to="/login">{formatMessage("public.logIn")}</Link>
			</header>
			<main id="public-main" tabIndex={-1} {...stylex.props(publicStyles.main)}>
				{children}
			</main>
		</div>
	);
}
