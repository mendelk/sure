// LoginForm (apps/web).
//
// Accessible sign-in form composed ONLY of DS primitives
// (`~/components/ui`): SureCard shell, SureTextField inputs, SureButton
// submit, SureAlert failure states. No hand-rolled form shapes, no raw
// palette, no raw SVG (per repo design-system hygiene).
//
// States (t_alt_fnd_007 acceptance + t_alt_fnd_015 compatibility): idle/pending,
// invalid-credential, unavailable-server, throttled, api-mismatch,
// api-too-old, api-too-new, api-missing-capability, and unsupported-MFA.
// Every failure renders as a SureAlert (destructive → role="alert", others →
// role="status") so assistive technology announces the outcome; field
// errors stay on the inputs via `errorMessage`.
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
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
import { SureTextField } from "~/components/ui/text-field";
import { formatMessage } from "~/lib/i18n/messages";
import type { BffLoginFormFailure } from "~/lib/bff-auth-client";

export interface LoginFormProps {
	/** Submission in flight: disables inputs, shows the pending button. */
	pending: boolean;
	/** Server-classified failure, or null when no failure is shown. */
	failure: BffLoginFormFailure | null;
	/** Called with the entered credentials (never stored, never logged). */
	onSubmit: (email: string, password: string) => void;
}

const formStyles = stylex.create({
	form: {
		display: "flex",
		flexDirection: "column",
		gap: 16,
	},
	actions: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
	},
});

function FailureAlert({ failure }: { failure: BffLoginFormFailure }): React.ReactElement {
	switch (failure) {
		case "invalid-credentials":
			return (
				<SureAlert tone="destructive" title={formatMessage("auth.invalidTitle")}>
					{formatMessage("auth.invalidBody")}
				</SureAlert>
			);
		case "mfa-unsupported":
			return (
				<SureAlert tone="warning" title={formatMessage("auth.mfaTitle")}>
					{formatMessage("auth.mfaBody")}
				</SureAlert>
			);
		case "throttled":
			return (
				<SureAlert tone="warning" title={formatMessage("auth.throttledTitle")}>
					{formatMessage("auth.throttledBody")}
				</SureAlert>
			);
		case "api-mismatch":
			return (
				<SureAlert tone="warning" title={formatMessage("auth.mismatchTitle")}>
					{formatMessage("auth.mismatchBody")}
				</SureAlert>
			);
		case "api-too-old":
			return (
				<SureAlert tone="warning" title={formatMessage("compat.tooOldTitle")}>
					{formatMessage("auth.tooOldBody")}
				</SureAlert>
			);
		case "api-too-new":
			return (
				<SureAlert tone="warning" title={formatMessage("compat.tooNewTitle")}>
					{formatMessage("auth.tooNewBody")}
				</SureAlert>
			);
		case "api-missing-capability":
			return (
				<SureAlert tone="warning" title={formatMessage("compat.missingTitle")}>
					{formatMessage("auth.missingCapabilityBody")}
				</SureAlert>
			);
		case "unavailable":
			return (
				<SureAlert tone="warning" title={formatMessage("auth.unavailableTitle")}>
					{formatMessage("auth.unavailableBody")}
				</SureAlert>
			);
		default: {
			const exhaustive: never = failure;
			throw new Error(`Unhandled login failure: ${String(exhaustive)}`);
		}
	}
}

export function LoginForm({ pending, failure, onSubmit }: LoginFormProps): React.ReactElement {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		if (!pending) {
			onSubmit(email, password);
		}
	}

	return (
		<SureCard>
			<SureCardHeader>
				<SureCardTitle>{formatMessage("auth.loginTitle")}</SureCardTitle>
				<SureCardDescription>{formatMessage("auth.loginDescription")}</SureCardDescription>
			</SureCardHeader>
			<SureCardContent>
				<form
					aria-label={formatMessage("auth.loginTitle")}
					noValidate={false}
					onSubmit={handleSubmit}
					{...stylex.props(formStyles.form)}
				>
					{failure !== null ? <FailureAlert failure={failure} /> : null}
					<SureTextField
						label={formatMessage("auth.email")}
						name="email"
						type="email"
						autoComplete="email"
						isRequired
						isDisabled={pending}
						placeholder={formatMessage("auth.emailPlaceholder")}
						value={email}
						onChange={setEmail}
					/>
					<SureTextField
						label={formatMessage("auth.password")}
						name="password"
						type="password"
						autoComplete="current-password"
						isRequired
						isDisabled={pending}
						value={password}
						onChange={setPassword}
					/>
					<div {...stylex.props(formStyles.actions)}>
						<SureButton type="submit" variant="primary" isPending={pending}>
							{pending ? formatMessage("auth.submitting") : formatMessage("auth.submit")}
						</SureButton>
					</div>
				</form>
			</SureCardContent>
		</SureCard>
	);
}
