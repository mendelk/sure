// Theme-choice state (t_alt_fnd_011).
//
// SSR-safe light/dark/system selection: choice AND resolution stay null
// until hydration (server markup and the first client render agree
// exactly), then the stored choice + OS preference resolve in an effect.
// While `choice` is "system", OS color-scheme changes re-resolve live via
// `subscribeToSystemTheme`. Choices persist through
// `~/lib/preferences/presentation` (theme key contract unchanged).

import { useCallback, useEffect, useState } from "react";
import {
	loadPresentationPreferences,
	savePresentationPreferences,
} from "~/lib/preferences/presentation";
import { readSystemPrefersDark, resolveThemeChoice, subscribeToSystemTheme } from "~/styles/theme";
import type { SureThemeChoice, SureThemeName } from "~/styles/theme";

export interface ThemeChoiceState {
	/** Stored choice; null until hydration (SSR/first render agree). */
	readonly choice: SureThemeChoice | null;
	/** Resolved concrete theme; null until hydration. */
	readonly theme: SureThemeName | null;
	readonly setChoice: (choice: SureThemeChoice) => void;
}

/** Resolve + persist the user's light/dark/system theme choice. */
export function useThemeChoice(): ThemeChoiceState {
	const [choice, setChoiceState] = useState<SureThemeChoice | null>(null);
	const [prefersDark, setPrefersDark] = useState(false);

	useEffect(() => {
		setChoiceState(loadPresentationPreferences().themeChoice);
		setPrefersDark(readSystemPrefersDark());
		return subscribeToSystemTheme(setPrefersDark);
	}, []);

	const setChoice = useCallback((next: SureThemeChoice): void => {
		setChoiceState(next);
		savePresentationPreferences({ themeChoice: next });
	}, []);

	const theme = choice === null ? null : resolveThemeChoice(choice, prefersDark);
	return { choice, theme, setChoice };
}
