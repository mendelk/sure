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
				<SureAlert tone="destructive" title="Could not sign in">
					Invalid email or password. Check your credentials and try again.
				</SureAlert>
			);
		case "mfa-unsupported":
			return (
				<SureAlert tone="warning" title="Two-factor accounts are not supported here">
					This account uses two-factor authentication, which the web app does not support yet.
					Please sign in with the mobile app instead.
				</SureAlert>
			);
		case "throttled":
			return (
				<SureAlert tone="warning" title="Too many attempts">
					Too many sign-in attempts. Wait a few minutes and try again.
				</SureAlert>
			);
		case "api-mismatch":
			return (
				<SureAlert tone="warning" title="Service is being updated">
					The service is being updated right now. Try signing in again in a moment.
				</SureAlert>
			);
		case "api-too-old":
			return (
				<SureAlert tone="warning" title="Sure server is too old">
					The server version is older than this app supports. Ask your administrator to upgrade the
					Sure server, then try again.
				</SureAlert>
			);
		case "api-too-new":
			return (
				<SureAlert tone="warning" title="App update required">
					The server version is newer than this app supports. Update the web app to continue.
				</SureAlert>
			);
		case "api-missing-capability":
			return (
				<SureAlert tone="warning" title="Server is missing required features">
					The server lacks features this app needs. Ask your administrator to upgrade the Sure
					server, then try again.
				</SureAlert>
			);
		case "unavailable":
			return (
				<SureAlert tone="warning" title="Service unavailable">
					The sign-in service is unavailable. Check your connection and try again.
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
				<SureCardTitle>Log in to Sure</SureCardTitle>
				<SureCardDescription>Sign in with your Sure account to continue.</SureCardDescription>
			</SureCardHeader>
			<SureCardContent>
				<form
					aria-label="Log in to Sure"
					noValidate={false}
					onSubmit={handleSubmit}
					{...stylex.props(formStyles.form)}
				>
					{failure !== null ? <FailureAlert failure={failure} /> : null}
					<SureTextField
						label="Email"
						name="email"
						type="email"
						autoComplete="email"
						isRequired
						isDisabled={pending}
						placeholder="you@example.com"
						value={email}
						onChange={setEmail}
					/>
					<SureTextField
						label="Password"
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
							{pending ? "Signing in…" : "Log in"}
						</SureButton>
					</div>
				</form>
			</SureCardContent>
		</SureCard>
	);
}
