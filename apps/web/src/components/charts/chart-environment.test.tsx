// useChartEnvironment tests: SSR-safe fallbacks + live resolution.
//
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { useChartEnvironment } from "./chart-environment";

function Probe(): React.ReactElement {
	const { theme, reducedMotion } = useChartEnvironment();
	return (
		<p data-testid="env">
			{theme}:{reducedMotion ? "reduced" : "motion"}
		</p>
	);
}

describe("useChartEnvironment", () => {
	it("falls back to light + reduced before hydration effects", () => {
		document.documentElement.removeAttribute("data-theme");
		render(<Probe />);
		// jsdom has no matchMedia: motion stays at the reduced fallback.
		expect(screen.getByTestId("env").textContent).toBe("light:reduced");
	});

	it("follows the data-theme attribute after hydration", async () => {
		document.documentElement.setAttribute("data-theme", "dark");
		render(<Probe />);
		await act(async () => {
			await Promise.resolve();
		});
		expect(screen.getByTestId("env").textContent).toBe("dark:reduced");
		document.documentElement.removeAttribute("data-theme");
	});
});
