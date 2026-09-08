import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { SureTabs } from "~/components/ui/tabs";
import type { SettingsSection } from "~/lib/app-search";
import { parseSettingsSearch } from "~/lib/app-search";

/**
 * Settings home (t_alt_fnd_010): typed `?section=` state preserved
 * through deep links and history. Tabs write back through the router;
 * the account page links forward with the current section intact.
 */
export const Route = createFileRoute("/_authenticated/settings/")({
	validateSearch: (search: Record<string, unknown>) => parseSettingsSearch(search),
	head: () => ({ meta: [{ title: "Settings · Sure Web" }] }),
	component: SettingsIndexPage,
});

const SECTIONS: readonly { id: SettingsSection; label: string; content: string }[] = [
	{ id: "profile", label: "Profile", content: "Profile preferences live here." },
	{ id: "account", label: "Account", content: "Account details live here." },
	{ id: "notifications", label: "Notifications", content: "Notification preferences live here." },
];

function SettingsIndexPage(): React.ReactElement {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	return (
		<SureCard>
			<SureCardHeader>
				<SureCardTitle>Settings sections</SureCardTitle>
			</SureCardHeader>
			<SureCardContent>
				<SureTabs
					label="Settings sections"
					selectedKey={search.section}
					onSelectionChange={(key) => {
						// Tab selection writes typed search so the URL is the
						// source of truth (deep-linkable, history-safe).
						// Keyboard arrows come from React Aria natively.
						if (key === "profile" || key === "account" || key === "notifications") {
							void navigate({ search: { section: key } });
						}
					}}
					items={SECTIONS.map((section) => ({
						id: section.id,
						label: section.label,
						children: <p data-testid="settings-section-body">{section.content}</p>,
					}))}
				/>
				<p>
					<Link
						to="/settings/account"
						data-testid="settings-to-account"
						search={{ section: search.section }}
					>
						Open the account page (keeps section)
					</Link>
				</p>
				<p data-testid="settings-search-state">Current section: {search.section}.</p>
			</SureCardContent>
		</SureCard>
	);
}
