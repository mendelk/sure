// Global privacy control (t_alt_fnd_011).
//
// React state for the privacy mask flag: `masked` hides sensitive values
// app-wide (balances, chart values, tooltips, accessible names, copied
// text, previews) without touching source data — masking happens at
// render/copy time via `~/lib/privacy/masking`. The flag itself is a
// non-sensitive presentation preference (persisted by
// `~/lib/preferences/presentation`); the masked VALUES never persist.
//
// SSR-safe and fail-closed: unresolved state is masked during SSR and the
// first client render, then the stored flag resolves in an effect. This
// prevents sensitive text from entering the HTML or accessibility tree
// before hydration for users whose browser preference is masked.

import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
	loadPresentationPreferences,
	savePresentationPreferences,
} from "~/lib/preferences/presentation";

export interface PrivacyContextValue {
	readonly masked: boolean;
	readonly setMasked: (masked: boolean) => void;
	readonly toggleMasked: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
	masked: true,
	setMasked: () => {},
	toggleMasked: () => {},
});

export function PrivacyProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	// Fail closed until hydration: SSR and first render agree on masked.
	const [masked, setMaskedState] = useState(true);

	useEffect(() => {
		setMaskedState(loadPresentationPreferences().privacyMasked);
	}, []);

	const setMasked = useCallback((next: boolean): void => {
		setMaskedState(next);
		savePresentationPreferences({ privacyMasked: next });
	}, []);

	const toggleMasked = useCallback((): void => {
		setMaskedState((current) => {
			const next = !current;
			savePresentationPreferences({ privacyMasked: next });
			return next;
		});
	}, []);

	return (
		<PrivacyContext.Provider value={{ masked, setMasked, toggleMasked }}>
			{children}
		</PrivacyContext.Provider>
	);
}

/** Read the global privacy-mask flag and its toggles. */
export function usePrivacy(): PrivacyContextValue {
	return useContext(PrivacyContext);
}
