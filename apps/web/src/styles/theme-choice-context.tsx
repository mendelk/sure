// Shared theme-choice context (t_alt_fnd_011).
//
// RootComponent owns the single `useThemeChoice` instance because only it
// can apply the resolved StyleX theme to <html>. Shell/settings controls
// consume that same state through this context, so choosing light/dark/
// system repaints immediately instead of merely persisting for a reload.
import * as React from "react";
import { createContext, useContext } from "react";
import type { ThemeChoiceState } from "./use-theme-choice";

const UNRESOLVED_THEME: ThemeChoiceState = {
	choice: null,
	theme: null,
	setChoice: () => {},
};

const ThemeChoiceContext = createContext<ThemeChoiceState>(UNRESOLVED_THEME);

export function ThemeChoiceProvider({
	children,
	value,
}: {
	children: React.ReactNode;
	value: ThemeChoiceState;
}): React.ReactElement {
	return <ThemeChoiceContext.Provider value={value}>{children}</ThemeChoiceContext.Provider>;
}

/** Shared root theme state for shell/settings presentation controls. */
export function useThemeChoiceContext(): ThemeChoiceState {
	return useContext(ThemeChoiceContext);
}
