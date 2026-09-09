// Reactive authenticated shell (t_alt_fnd_021).
//
// The route-guard snapshot (`session`/`capabilities` from route context)
// is only valid at guard time: when a later authenticated query surfaces
// a session-ending failure, `SessionEndingGuard` replaces the shared
// `BFF_SESSION_QUERY_KEY` entry with the signed-out state. This shell
// subscribes to that entry (read-only cache subscription — no fetch, no
// queryFn, so the status server function stays in route loaders) and
// renders the effective session: both the header identity and the
// capability-derived navigation re-derive from it (fail closed), so no
// email, logout link, or admin nav can survive a session-ending query.
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppShell } from "./app-shell";
import type { AppCapabilities } from "~/lib/app-capabilities";
import { deriveCapabilities } from "~/lib/app-capabilities";
import { BFF_SESSION_QUERY_KEY } from "~/lib/bff-auth-client";
import type { BffSessionStatus } from "~/lib/bff-auth-client";

export interface AuthenticatedShellProps {
	/** Route-guard session snapshot (fallback while the query entry is empty). */
	session: BffSessionStatus;
	/** Route-guard capabilities (used only while the effective session is signed in). */
	capabilities: AppCapabilities;
	children: React.ReactNode;
}

/** Reactive read of the shared session entry (cache subscription, never a fetch). */
function useCachedBffSession(): BffSessionStatus | undefined {
	const queryClient = useQueryClient();
	return useSyncExternalStore(
		(notify) => queryClient.getQueryCache().subscribe(notify),
		() => queryClient.getQueryData<BffSessionStatus>(BFF_SESSION_QUERY_KEY),
		() => undefined,
	);
}

export function AuthenticatedShell({
	session,
	capabilities,
	children,
}: AuthenticatedShellProps): React.ReactElement {
	const cached = useCachedBffSession();
	const effective = cached ?? session;
	// Capabilities follow the effective session: the guard snapshot while
	// the entry is empty, re-derived (fail closed) once the cache speaks —
	// a cached signed-out state grants nothing even if the snapshot was
	// signed in, and vice versa.
	const effectiveCapabilities = cached === undefined ? capabilities : deriveCapabilities(effective);
	return (
		<AppShell session={effective} capabilities={effectiveCapabilities}>
			{children}
		</AppShell>
	);
}
