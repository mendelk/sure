// SSR-safe chart environment (t_alt_fnd_016).
//
// Follows the root-route theme convention (`src/routes/__root.tsx`): SSR and
// the first client render agree on deterministic fallbacks (light theme,
// reduced motion assumed), then effects resolve the live values. The TanStack
// definition therefore never differs between server HTML and hydration —
// theme/motion resolution only rebuilds the definition afterwards, which the
// adapter applies without replacing the mounted surface.
import { useEffect, useState } from "react";
import type { SureThemeName } from "~/styles/theme";

export interface ChartEnvironment {
	readonly theme: SureThemeName;
	/** True until proven otherwise: animations stay off unless allowed. */
	readonly reducedMotion: boolean;
}

function readTheme(): SureThemeName {
	if (typeof document === "undefined") {
		return "light";
	}
	return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function readReducedMotion(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return true;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useChartEnvironment(): ChartEnvironment {
	const [theme, setTheme] = useState<SureThemeName>("light");
	const [reducedMotion, setReducedMotion] = useState<boolean>(true);

	useEffect(() => {
		setTheme(readTheme());
		setReducedMotion(readReducedMotion());

		const root = document.documentElement;
		const observer = new MutationObserver(() => {
			setTheme(readTheme());
		});
		observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

		// jsdom (unit tests) has no matchMedia: theme observation still
		// applies, motion stays at the reduced fallback.
		if (typeof window.matchMedia !== "function") {
			return () => {
				observer.disconnect();
			};
		}
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onChange = (): void => {
			setReducedMotion(media.matches);
		};
		media.addEventListener("change", onChange);
		return () => {
			observer.disconnect();
			media.removeEventListener("change", onChange);
		};
	}, []);

	return { theme, reducedMotion };
}
