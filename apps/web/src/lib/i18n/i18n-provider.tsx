// Locale provider (t_alt_fnd_011).
//
// SSR-safe locale state: the server and the first client render both use
// the default locale ("en"), so markup agrees exactly (no hydration
// mismatch). A stored override resolves post-hydration in an effect via
// the presentation-preference loader — the same null-until-hydration
// pattern the theme runtime uses in `routes/__root.tsx`.

import * as React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { formatCurrency as formatCurrencyBase } from "./format";
import type { MessageVars } from "./messages";
import { DEFAULT_LOCALE, formatMessage } from "./messages";
import type { MessageKey } from "./messages";
import { loadPresentationPreferences } from "~/lib/preferences/presentation";

export interface LocaleContextValue {
	readonly locale: string;
	readonly t: (key: MessageKey, vars?: MessageVars) => string;
	readonly formatMoney: (amount: number, currency: string) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
	locale: DEFAULT_LOCALE,
	t: (key, vars) => formatMessage(key, vars, DEFAULT_LOCALE),
	formatMoney: (amount, currency) =>
		formatCurrencyBase({ amount, currency, locale: DEFAULT_LOCALE }),
});

export function LocaleProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	// Default until hydration: SSR and first client render agree on "en".
	const [locale, setLocale] = useState<string>(DEFAULT_LOCALE);

	useEffect(() => {
		setLocale(loadPresentationPreferences().locale);
	}, []);

	const value: LocaleContextValue = {
		locale,
		t: (key, vars) => formatMessage(key, vars, locale),
		formatMoney: (amount, currency) => formatCurrencyBase({ amount, currency, locale }),
	};
	return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Translate a message key with the active locale. */
export function useLocale(): LocaleContextValue {
	return useContext(LocaleContext);
}
