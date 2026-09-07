// Storybook preview: theme toolbar, viewports, a11y defaults (apps/web).
//
// Runs in the browser — client-safe boundaries apply (semantic StyleX
// tokens only, no Node APIs). Every story renders inside the selected Sure
// theme so both themes are covered without duplicated stories.
import type { Decorator, Preview } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { sureDarkTheme, sureLightTheme } from "../src/styles/sure-tokens.stylex";
import { vars } from "../src/styles/sure-tokens.stylex";
import "../src/styles/sure-theme.css";

const canvasStyles = stylex.create({
	canvas: {
		minHeight: "100vh",
		boxSizing: "border-box",
		padding: 24,
		backgroundColor: vars.container,
		color: vars.textPrimary,
		fontFamily: vars.fontSans,
	},
	light: {
		colorScheme: "light",
	},
	dark: {
		colorScheme: "dark",
	},
});

type SurePreviewTheme = "light" | "dark";

function previewTheme(value: unknown): SurePreviewTheme {
	return value === "dark" ? "dark" : "light";
}

const themeDecorator: Decorator = (Story, context) => {
	const theme = previewTheme(context.globals["theme"]);
	return (
		<div
			data-theme={theme}
			{...stylex.props(
				theme === "dark" ? sureDarkTheme : sureLightTheme,
				canvasStyles.canvas,
				theme === "dark" ? canvasStyles.dark : canvasStyles.light,
			)}
		>
			<Story />
		</div>
	);
};

const preview: Preview = {
	decorators: [themeDecorator],
	globalTypes: {
		theme: {
			name: "Theme",
			description: "Sure semantic theme",
			defaultValue: "light",
			toolbar: {
				icon: "paintbrush",
				items: [
					{ value: "light", title: "Light" },
					{ value: "dark", title: "Dark" },
				],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: {
		viewport: { value: "responsive" },
	},
	parameters: {
		layout: "fullscreen",
		viewport: {
			options: {
				mobile: { name: "Mobile", styles: { width: "360px", height: "740px" } },
				tablet: { name: "Tablet", styles: { width: "768px", height: "1024px" } },
				desktop: { name: "Desktop", styles: { width: "1280px", height: "800px" } },
				responsive: { name: "Responsive", styles: { width: "100%", height: "100%" } },
			},
		},
		a11y: {
			// Fail the a11y panel on violations (checked in a real browser;
			// jsdom suites cover the same components in CI).
			test: "error",
		},
	},
};

export default preview;
