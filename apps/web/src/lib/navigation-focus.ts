/**
 * Client-side navigation tracking for focus management (t_alt_fnd_010).
 *
 * Client-safe (no Node imports, no `process.env`, no `*.server.*`
 * imports): safe for route components and unit tests. The counter is
 * module state, but it is only read and written inside React effects and
 * history callbacks — which never run during SSR — so server renders
 * always observe the initial value and no state leaks between requests.
 *
 * Contract: fresh page loads leave focus at the top of the document (the
 * tab order starts at the skip links); client-side SPA navigations
 * (PUSH/REPLACE/POP, including the post-login redirect) move focus to
 * the new page heading. `PageHeader` implements the focus side; the root
 * route component installs the tracking side once via
 * `useMarkClientSideNavigations`, where it persists across SPA
 * navigations and resets with the module on full page loads.
 */
import { useEffect } from "react";

let clientSideNavigations = 0;

/** Whether any client-side history navigation has occurred since boot. */
export function hasClientSideNavigated(): boolean {
	return clientSideNavigations > 0;
}

/** Test hook: reset the counter so suites start from a fresh page load. */
export function resetClientSideNavigationForTests(): void {
	clientSideNavigations = 0;
}

interface SubscribableHistory {
	subscribe(listener: () => void): () => void;
}

/**
 * Record every client-side history navigation. Mount once near the
 * router root (the root route component owns it in production): the
 * subscription survives SPA navigations and dies with the page.
 */
export function useMarkClientSideNavigations(history: SubscribableHistory): void {
	useEffect(() => {
		const unsubscribe = history.subscribe(() => {
			clientSideNavigations += 1;
		});
		return unsubscribe;
	}, [history]);
}
