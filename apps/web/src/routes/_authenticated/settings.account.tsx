import { Link, createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { parseSettingsSearch } from "~/lib/app-search";

/**
 * Settings account page (t_alt_fnd_010): nested settings-group route
 * proving deep links (`/settings/account?section=notifications`) and
 * back/forward preserve the typed `section` search state.
 */
export const Route = createFileRoute("/_authenticated/settings/account")({
	validateSearch: (search: Record<string, unknown>) => parseSettingsSearch(search),
	head: () => ({ meta: [{ title: "Account settings · Sure Web" }] }),
	component: SettingsAccountPage,
});

function SettingsAccountPage(): React.ReactElement {
	const search = Route.useSearch();

	return (
		<SureCard>
			<SureCardHeader>
				<SureCardTitle>Account</SureCardTitle>
			</SureCardHeader>
			<SureCardContent>
				<p data-testid="settings-account-state">
					Account page, opened from section {search.section}.
				</p>
				<p>
					<Link to="/settings" search={{ section: search.section }} data-testid="account-back">
						Back to settings (keeps section)
					</Link>
				</p>
			</SureCardContent>
		</SureCard>
	);
}
