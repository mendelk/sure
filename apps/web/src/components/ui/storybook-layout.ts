// Shared Storybook layout helpers for Sure UI primitive stories (apps/web).
//
// Imported only by `*.stories.tsx` (never by product code or tests), so it
// ships no bytes to the app bundle. Semantic tokens only — the
// `no-raw-palette` drift test scans this file.
import * as stylex from "@stylexjs/stylex";
import { vars } from "~/styles/sure-tokens.stylex";

export const storyLayout = stylex.create({
	column: {
		display: "flex",
		flexDirection: "column",
		gap: 16,
		maxWidth: 560,
	},
	row: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
		alignItems: "center",
	},
	narrow: {
		display: "flex",
		flexDirection: "column",
		gap: 16,
		maxWidth: 320,
	},
	caption: {
		fontSize: 12,
		color: vars.textSecondary,
	},
	sectionTitle: {
		marginTop: 8,
		marginBottom: 0,
		fontSize: 13,
		fontWeight: vars.fontWeightSemibold,
		color: vars.textSecondary,
	},
});

export const LONG_TEXT =
	"Dies ist eine ungewöhnlich lange Beschriftung, die Zeilenumbrüche, schmale Container (320 px) und beide Themes überstehen muss, ohne zu überlaufen oder die Tastaturbedienung zu beeinträchtigen.";
