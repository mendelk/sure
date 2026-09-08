// Masked money display (t_alt_fnd_011).
//
// Renders a locale-formatted currency amount that honors the global
// privacy control: when masked, visible text, `aria-label`, `title`
// (tooltip), clipboard text, and previews all expose only the generic
// "Hidden …" message — never the real amount. Source data is never
// mutated; the `amount` prop flows one way into display strings.

import * as React from "react";
import { useLocale } from "~/lib/i18n/i18n-provider";
import { formatMessage } from "~/lib/i18n/messages";
import { usePrivacy } from "~/lib/privacy/privacy-provider";
import { PRIVACY_MASK } from "~/lib/privacy/masking";

export interface SensitiveAmountProps {
	/** Source amount in major units (never mutated, never persisted). */
	readonly amount: number;
	readonly currency: string;
	/** Optional explicit mask override (defaults to the global control). */
	readonly masked?: boolean | undefined;
	readonly label?: string | undefined;
}

/**
 * Locale-aware amount that masks every channel (text, accessible name,
 * tooltip, copied text, preview) when privacy is on. Copying the value
 * (Ctrl+C / context menu) writes the masked text to the clipboard via
 * the `onCopy` interception below.
 */
export function SensitiveAmount({
	amount,
	currency,
	masked,
	label,
}: SensitiveAmountProps): React.ReactElement {
	const { locale } = useLocale();
	const { masked: globalMasked } = usePrivacy();
	const isMasked = masked ?? globalMasked;

	const exposed = new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
	}).format(amount);
	const display = isMasked ? PRIVACY_MASK : exposed;
	const accessibleName = isMasked ? formatMessage("privacy.maskedBalance") : (label ?? exposed);
	const tooltip = isMasked ? formatMessage("privacy.maskedBalance") : exposed;

	function handleCopy(event: React.ClipboardEvent<HTMLSpanElement>): void {
		if (!isMasked) {
			return;
		}
		event.preventDefault();
		// Fixed mask, independent of the locale's numeral script or separators.
		event.clipboardData.setData("text/plain", PRIVACY_MASK);
	}

	return (
		<span
			data-sensitive={true}
			data-privacy-masked={isMasked || undefined}
			data-testid="sensitive-amount"
		>
			<span role="text" aria-label={accessibleName} title={tooltip} onCopy={handleCopy}>
				{display}
			</span>
		</span>
	);
}
