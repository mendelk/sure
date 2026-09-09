// Session-ending guard (t_alt_fnd_021).
//
// Wraps the first real authenticated query output: when a proxied call
// surfaces a session-ending failure (`api-mismatch`, `api-too-old`,
// `api-too-new`, `api-missing-capability`, `logged-out`, `deactivated`,
// `session-expired`, `invalid-refresh`) after the route guard already
// passed (e.g. the session died between guard and query), the browser
// resets to signed-out — the `BFF_SESSION_QUERY_KEY` entry is cleared
// through `clearSessionOnEndingCode` and deliberately replaced with the
// signed-out state (the authenticated shell consumes that entry, so no
// authenticated chrome survives) while the signed-out card renders in
// place. Every other outcome renders `children` untouched so transport
// failures, throttles, and origin/CSRF guard rejections keep the cached
// session.
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import * as React from "react";
import { useEffect } from "react";
import {
	BFF_SESSION_QUERY_KEY,
	clearSessionOnEndingCode,
	isSessionEndingCode,
} from "~/lib/bff-auth-client";
import type { BffSessionStatus } from "~/lib/bff-auth-client";
import { formatMessage } from "~/lib/i18n/messages";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";

/** Authenticated-query outcome the guard classifies (subset both sides share). */
export type SessionEndingResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: { readonly code: string } };

export interface SessionEndingGuardProps {
	/** Resolved authenticated-query outcome (data, never a thrown error). */
	result: SessionEndingResult;
	children: React.ReactNode;
}

/**
 * Clear local session state on session-ending failures and render the
 * signed-out state; pass everything else through to `children`.
 */
export function SessionEndingGuard({
	result,
	children,
}: SessionEndingGuardProps): React.ReactElement {
	const queryClient = useQueryClient();
	const ending = !result.ok && isSessionEndingCode(result.error.code);

	useEffect(() => {
		if (!ending || result.ok) {
			return;
		}
		if (clearSessionOnEndingCode(queryClient, result.error.code)) {
			// Mirror the logout page: the cleared entry becomes signed-out
			// so query consumers flip chrome without a refetch round-trip.
			queryClient.setQueryData(BFF_SESSION_QUERY_KEY, {
				authenticated: false,
				reason: "missing",
			} satisfies BffSessionStatus);
		}
	}, [ending, result, queryClient]);

	if (ending) {
		return (
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>{formatMessage("session.signedOutTitle")}</SureCardTitle>
				</SureCardHeader>
				<SureCardContent>
					<p data-testid="session-signed-out">
						{formatMessage("session.signedOutBody")}{" "}
						<Link to="/login">{formatMessage("shell.logIn")}</Link>
					</p>
				</SureCardContent>
			</SureCard>
		);
	}
	return <>{children}</>;
}
