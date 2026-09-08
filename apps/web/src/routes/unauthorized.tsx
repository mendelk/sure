import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { PublicChrome } from "~/components/shell/public-chrome";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { RouteUnauthorized } from "~/components/shell/route-states";

/**
 * Unauthorized route (t_alt_fnd_010): route-level 403 state for
 * authenticated sessions lacking a capability (e.g. non-admins visiting
 * `/admin`, redirected here as `/unauthorized?from=/admin`). Public so
 * the guard can always land somewhere renderable; the card title is the
 * page heading for focus management.
 */
export const Route = createFileRoute("/unauthorized")({
	validateSearch: (search: Record<string, unknown>): { from?: string | undefined } => {
		const from = search["from"];
		return typeof from === "string" ? { from } : {};
	},
	head: () => ({ meta: [{ title: "Not authorized · Sure Web" }] }),
	component: UnauthorizedPage,
});

function UnauthorizedPage(): React.ReactElement {
	const search = Route.useSearch();

	return (
		<PublicChrome>
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>Not authorized</SureCardTitle>
				</SureCardHeader>
				<SureCardContent>
					<RouteUnauthorized />
					{search.from !== undefined && search.from !== "" ? (
						<p data-testid="unauthorized-from">
							Requested page: <code>{search.from}</code>
						</p>
					) : null}
				</SureCardContent>
			</SureCard>
		</PublicChrome>
	);
}
