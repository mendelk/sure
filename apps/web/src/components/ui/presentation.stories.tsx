// Foundations stories (t_alt_fnd_011): localization, theme, and privacy.
//
// Rendered in real Chromium (light + dark) by `pnpm test:browser` with
// the full axe rule set, including color-contrast. Deterministic by
// construction: stored presentation prefs are cleared on mount (effects
// run child-first, so providers below read the cleared storage), and
// privacy-sensitive rows take explicit `masked` props instead of the
// global flag.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { useEffect } from "react";
import { LocaleProvider } from "~/lib/i18n/i18n-provider";
import { getEnglishMessages } from "~/lib/i18n/messages";
import { LONG_TEXT_FIXTURES, pseudolocalizeDictionary, toPseudolocale } from "~/lib/i18n/fixtures";
import { PrivacyProvider } from "~/lib/privacy/privacy-provider";
import { SURE_LOCALE_STORAGE_KEY, SURE_PRIVACY_STORAGE_KEY } from "~/lib/preferences/presentation";
import { SURE_THEME_STORAGE_KEY } from "~/styles/theme";
import { ThemeChoiceProvider } from "~/styles/theme-choice-context";
import { useThemeChoice } from "~/styles/use-theme-choice";
import { SensitiveAmount } from "../privacy/sensitive-amount";
import {
	PresentationControls,
	PresentationSettingsCard,
} from "../preferences/presentation-controls";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "./card";
import { storyLayout } from "./storybook-layout";

const meta: Meta = {
	title: "Foundations/Presentation",
	parameters: {
		docs: {
			description: {
				component:
					"Localization, theme, and privacy foundations: message keys, light/dark/system selection, and the global sensitive-value mask.",
			},
		},
	},
};

export default meta;
type Story = StoryObj;

function FoundationsShell({ children }: { children: React.ReactNode }): React.ReactElement {
	useEffect(() => {
		localStorage.removeItem(SURE_THEME_STORAGE_KEY);
		localStorage.removeItem(SURE_LOCALE_STORAGE_KEY);
		localStorage.removeItem(SURE_PRIVACY_STORAGE_KEY);
	}, []);
	return (
		<LocaleProvider>
			<PrivacyProvider>{children}</PrivacyProvider>
		</LocaleProvider>
	);
}

function ControlledControls(): React.ReactElement {
	const themeState = useThemeChoice();
	return (
		<ThemeChoiceProvider value={themeState}>
			<div {...stylex.props(storyLayout.column)}>
				<PresentationControls
					themeChoice={themeState.choice}
					onThemeChoice={themeState.setChoice}
				/>
				<SensitiveAmount amount={1234.5} currency="USD" />
			</div>
		</ThemeChoiceProvider>
	);
}

function ControlledSettingsCard(): React.ReactElement {
	const themeState = useThemeChoice();
	return (
		<ThemeChoiceProvider value={themeState}>
			<PresentationSettingsCard
				themeChoice={themeState.choice}
				onThemeChoice={themeState.setChoice}
			/>
		</ThemeChoiceProvider>
	);
}

export const Controls: Story = {
	render: () => (
		<FoundationsShell>
			<div {...stylex.props(storyLayout.column)}>
				<ControlledControls />
			</div>
		</FoundationsShell>
	),
};

export const SettingsCard: Story = {
	render: () => (
		<FoundationsShell>
			<div {...stylex.props(storyLayout.column)}>
				<ControlledSettingsCard />
			</div>
		</FoundationsShell>
	),
};

export const MaskedAmounts: Story = {
	render: () => (
		<FoundationsShell>
			<div {...stylex.props(storyLayout.column)}>
				<SureCard>
					<SureCardHeader>
						<SureCardTitle>Exposed</SureCardTitle>
					</SureCardHeader>
					<SureCardContent>
						<SensitiveAmount amount={1234.5} currency="USD" masked={false} />
					</SureCardContent>
				</SureCard>
				<SureCard>
					<SureCardHeader>
						<SureCardTitle>Masked</SureCardTitle>
					</SureCardHeader>
					<SureCardContent>
						<SensitiveAmount amount={9876.54} currency="USD" masked={true} />
					</SureCardContent>
				</SureCard>
			</div>
		</FoundationsShell>
	),
};

const pseudoMessages = pseudolocalizeDictionary(getEnglishMessages());

export const PseudolocalePreview: Story = {
	render: () => (
		<FoundationsShell>
			<div {...stylex.props(storyLayout.column)}>
				<SureCard>
					<SureCardHeader>
						<SureCardTitle>{pseudoMessages["shell.brand"]}</SureCardTitle>
					</SureCardHeader>
					<SureCardContent>
						<p>{pseudoMessages["dashboard.overview"]}</p>
						<p>{toPseudolocale("Showing active items matching rent")}</p>
						<SensitiveAmount amount={1234.5} currency="USD" masked={true} />
					</SureCardContent>
				</SureCard>
			</div>
		</FoundationsShell>
	),
};

export const LongText: Story = {
	render: () => (
		<FoundationsShell>
			<div {...stylex.props(storyLayout.narrow)}>
				<SureCard>
					<SureCardHeader>
						<SureCardTitle>{LONG_TEXT_FIXTURES.short}</SureCardTitle>
					</SureCardHeader>
					<SureCardContent>
						<p>{LONG_TEXT_FIXTURES.medium}</p>
						<p>{LONG_TEXT_FIXTURES.paragraph}</p>
						<p>{LONG_TEXT_FIXTURES.balanceLabel}</p>
						<SensitiveAmount
							amount={1234567.89}
							currency="USD"
							masked={false}
							label={LONG_TEXT_FIXTURES.balanceLabel}
						/>
					</SureCardContent>
				</SureCard>
			</div>
		</FoundationsShell>
	),
};
