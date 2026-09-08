import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { PresentationSettingsCard } from "~/components/preferences/presentation-controls";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { SureTabs } from "~/components/ui/tabs";
import { formatMessage } from "~/lib/i18n/messages";
import type { SettingsSection } from "~/lib/app-search";
import { parseSettingsSearch } from "~/lib/app-search";
import { useThemeChoiceContext } from "~/styles/theme-choice-context";

/**
 * Settings home (t_alt_fnd_010): typed `?section=` state preserved
 * through deep links and history. Tabs write back through the router;
 * the account page links forward with the current section intact.
 */
export const Route = createFileRoute("/_authenticated/settings/")({
	validateSearch: (search: Record<string, unknown>) => parseSettingsSearch(search),
	head: () => ({
		meta: [
			{
				title: formatMessage("app.documentTitle", {
					title: formatMessage("settings.title"),
				}),
			},
		],
	}),
	component: SettingsIndexPage,
});

const SECTIONS: readonly { id: SettingsSection; label: string; content: string }[] = [
	{
		id: "profile",
		label: formatMessage("settings.profile"),
		content: formatMessage("settings.profileBody"),
	},
	{
		id: "account",
		label: formatMessage("settings.account"),
		content: formatMessage("settings.accountBody"),
	},
	{
		id: "notifications",
		label: formatMessage("settings.notifications"),
		content: formatMessage("settings.notificationsBody"),
	},
];

function SettingsIndexPage(): React.ReactElement {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { choice: themeChoice, setChoice: setThemeChoice } = useThemeChoiceContext();

	return (
		<>
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>{formatMessage("settings.sectionsTitle")}</SureCardTitle>
				</SureCardHeader>
				<SureCardContent>
					<SureTabs
						label={formatMessage("settings.sectionsLabel")}
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
							{formatMessage("settings.openAccount")}
						</Link>
					</p>
					<p data-testid="settings-search-state">
						{formatMessage("settings.currentSection", { section: search.section })}
					</p>
				</SureCardContent>
			</SureCard>
			<PresentationSettingsCard themeChoice={themeChoice} onThemeChoice={setThemeChoice} />
		</>
	);
}
