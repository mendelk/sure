import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useState } from "react";
import { SureAlert } from "~/components/ui/alert";
import { SureButton } from "~/components/ui/button";
import {
	SureCard,
	SureCardContent,
	SureCardDescription,
	SureCardHeader,
	SureCardTitle,
} from "~/components/ui/card";
import { BFF_SESSION_QUERY_KEY, clearLocalSessionState } from "~/lib/bff-auth-client";
import type { BffSessionStatus } from "~/lib/bff-auth-client";
import { splitNextTarget } from "~/lib/route-guards";
import { PublicChrome } from "~/components/shell/public-chrome";
import { bffLogoutFn } from "./login";

export const Route = createFileRoute("/logout")({
	validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => {
		const next = search["next"];
		return typeof next === "string" ? { next } : {};
	},
	component: LogoutPage,
});

/**
 * Explicit sign-out (t_alt_fnd_007): a confirmation card whose button POSTs
 * through the logout server function — never a state-changing GET. Success
 * clears local session state (query cache, user display) and returns to a
 * safe same-origin target. Logout always succeeds from the user's view:
 * even an already-stale session reports success and clears.
 */
function LogoutPage(): React.ReactElement {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);

	async function handleLogout(): Promise<void> {
		setPending(true);
		setFailed(false);
		try {
			await bffLogoutFn();
			clearLocalSessionState(queryClient);
			// Refresh the status entry to signed-out so header chrome flips.
			queryClient.setQueryData(BFF_SESSION_QUERY_KEY, {
				authenticated: false,
				reason: "missing",
			} satisfies BffSessionStatus);
			const target = splitNextTarget(search.next);
			await navigate({ to: target.to, search: target.search, replace: true });
		} catch {
			// Transport failure only (the server function always resolves
			// otherwise): stay signed in and say so.
			setFailed(true);
		} finally {
			setPending(false);
		}
	}

	return (
		<PublicChrome>
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>Log out of Sure</SureCardTitle>
					<SureCardDescription>
						This signs you out on this device and revokes the session.
					</SureCardDescription>
				</SureCardHeader>
				<SureCardContent>
					{failed ? (
						<SureAlert tone="warning" title="Could not log out">
							The sign-out service is unavailable. Try again in a moment.
						</SureAlert>
					) : null}
					<SureButton variant="primary" isPending={pending} onPress={() => void handleLogout()}>
						{pending ? "Logging out…" : "Log out"}
					</SureButton>
				</SureCardContent>
			</SureCard>
		</PublicChrome>
	);
}
