// Presentation controls (t_alt_fnd_011).
//
// User-facing theme (light/dark/system), privacy-mask toggle, and locale
// display, composed ONLY of DS primitives (SureSelect, SureSwitch,
// SureCard). All copy resolves through message keys; all choices persist
// as non-sensitive presentation preferences
// (`~/lib/preferences/presentation`).

import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import {
	SureCard,
	SureCardContent,
	SureCardDescription,
	SureCardHeader,
	SureCardTitle,
} from "~/components/ui/card";
import { SureSwitch } from "~/components/ui/checkbox";
import { SureSelect } from "~/components/ui/select";
import type { SureOption } from "~/components/ui/select";
import { useLocale } from "~/lib/i18n/i18n-provider";
import { SUPPORTED_LOCALES, formatMessage } from "~/lib/i18n/messages";
import { usePrivacy } from "~/lib/privacy/privacy-provider";
import type { SureThemeChoice } from "~/styles/theme";

const layout = stylex.create({
	row: {
		display: "flex",
		flexDirection: "column",
		gap: 16,
	},
});

const THEME_OPTIONS: readonly SureOption[] = [
	{ id: "system", label: formatMessage("prefs.themeSystem") },
	{ id: "light", label: formatMessage("prefs.themeLight") },
	{ id: "dark", label: formatMessage("prefs.themeDark") },
];

export interface PresentationControlsProps {
	/** Current theme choice; null until hydration (control stays neutral). */
	readonly themeChoice: SureThemeChoice | null;
	readonly onThemeChoice: (choice: SureThemeChoice) => void;
}

function isThemeChoiceKey(key: string | number): key is SureThemeChoice {
	return key === "light" || key === "dark" || key === "system";
}

/** Compact theme + privacy row for the app-shell header. */
export function PresentationControls({
	themeChoice,
	onThemeChoice,
}: PresentationControlsProps): React.ReactElement {
	const { t } = useLocale();
	const { masked, setMasked } = usePrivacy();

	return (
		<div {...stylex.props(layout.row)}>
			<SureSelect
				label={t("prefs.themeLabel")}
				description={t("prefs.themeDescription")}
				items={THEME_OPTIONS.map((option) => ({
					...option,
					label:
						option.id === "system"
							? t("prefs.themeSystem")
							: option.id === "light"
								? t("prefs.themeLight")
								: t("prefs.themeDark"),
				}))}
				selectedKey={themeChoice ?? "system"}
				onSelectionChange={(key) => {
					if (typeof key === "string" && isThemeChoiceKey(key)) {
						onThemeChoice(key);
					}
				}}
			/>
			<SureSwitch isSelected={masked} onChange={setMasked} aria-label={t("prefs.privacyLabel")}>
				{t("prefs.privacyLabel")}
			</SureSwitch>
		</div>
	);
}

/** Full display-preferences card for the settings page. */
export function PresentationSettingsCard({
	themeChoice,
	onThemeChoice,
}: PresentationControlsProps): React.ReactElement {
	const { t, locale } = useLocale();

	return (
		<SureCard>
			<SureCardHeader>
				<SureCardTitle>{t("prefs.settingsTitle")}</SureCardTitle>
				<SureCardDescription>{t("prefs.settingsDescription")}</SureCardDescription>
			</SureCardHeader>
			<SureCardContent>
				<div {...stylex.props(layout.row)}>
					<PresentationControls themeChoice={themeChoice} onThemeChoice={onThemeChoice} />
					<p data-testid="locale-state">
						{t("prefs.localeLabel")}: {locale} ({SUPPORTED_LOCALES.join(", ")})
					</p>
					<p data-testid="prefs-sync-note">{t("prefs.syncNote")}</p>
				</div>
			</SureCardContent>
		</SureCard>
	);
}
