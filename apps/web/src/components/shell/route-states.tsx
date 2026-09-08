// Shared route-level states (t_alt_fnd_010).
//
// One accessible shape per route outcome, composed ONLY of DS primitives:
// pending → SureSkeleton, not-found/unauthorized → SureEmptyState, errors
// → SureAlert. Routes reference these as `pendingComponent`,
// `notFoundComponent`, and `errorComponent` so every group renders the
// same states.
import { Link } from "@tanstack/react-router";
import type * as React from "react";
import { SureAlert } from "~/components/ui/alert";
import { SureButton } from "~/components/ui/button";
import { SureCard, SureCardContent, SureCardHeader, SureCardTitle } from "~/components/ui/card";
import { SureEmptyState, SureSkeleton } from "~/components/ui/card";

export function RoutePending({ label = "Loading" }: { label?: string }): React.ReactElement {
	return <SureSkeleton label={label} lines={3} />;
}

export function RouteNotFound({
	title = "Page not found",
	description = "The page you are looking for does not exist. Check the address or return to the dashboard.",
}: {
	title?: string;
	description?: string;
}): React.ReactElement {
	return (
		<SureEmptyState
			title={title}
			description={description}
			action={
				<Link to="/dashboard" search={{ q: "", filter: "all" }}>
					<SureButton variant="secondary">Back to dashboard</SureButton>
				</Link>
			}
		/>
	);
}

export function RouteUnauthorized({
	title = "Not authorized",
	description = "You are signed in, but this area needs a capability your account does not have. Contact a family admin if you need access.",
}: {
	title?: string;
	description?: string;
}): React.ReactElement {
	return (
		<SureEmptyState
			title={title}
			description={description}
			action={
				<Link to="/dashboard" search={{ q: "", filter: "all" }}>
					<SureButton variant="secondary">Back to dashboard</SureButton>
				</Link>
			}
		/>
	);
}

export function RouteErrorState({
	title = "Something went wrong",
	message = "The page could not be loaded. Try again in a moment.",
	onRetry,
}: {
	title?: string;
	message?: string;
	onRetry?: () => void | undefined;
}): React.ReactElement {
	return (
		<SureCard>
			<SureCardHeader>
				<SureCardTitle>{title}</SureCardTitle>
			</SureCardHeader>
			<SureCardContent>
				<SureAlert tone="destructive" title={title}>
					{message}
				</SureAlert>
				{onRetry !== undefined ? (
					<p>
						<SureButton variant="secondary" onPress={onRetry}>
							Try again
						</SureButton>
					</p>
				) : null}
			</SureCardContent>
		</SureCard>
	);
}
