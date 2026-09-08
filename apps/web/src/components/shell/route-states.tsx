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
import { formatMessage } from "~/lib/i18n/messages";

export function RoutePending({ label }: { label?: string }): React.ReactElement {
	return <SureSkeleton label={label ?? formatMessage("routes.loading")} lines={3} />;
}

export function RouteNotFound({
	title,
	description,
}: {
	title?: string;
	description?: string;
}): React.ReactElement {
	const resolvedTitle = title ?? formatMessage("routes.notFoundTitle");
	const resolvedDescription = description ?? formatMessage("routes.notFoundDescription");
	return (
		<SureEmptyState
			title={resolvedTitle}
			description={resolvedDescription}
			action={
				<Link to="/dashboard" search={{ q: "", filter: "all" }}>
					<SureButton variant="secondary">{formatMessage("routes.backToDashboard")}</SureButton>
				</Link>
			}
		/>
	);
}

export function RouteUnauthorized({
	title,
	description,
}: {
	title?: string;
	description?: string;
}): React.ReactElement {
	const resolvedTitle = title ?? formatMessage("routes.unauthorizedTitle");
	const resolvedDescription = description ?? formatMessage("routes.unauthorizedDescription");
	return (
		<SureEmptyState
			title={resolvedTitle}
			description={resolvedDescription}
			action={
				<Link to="/dashboard" search={{ q: "", filter: "all" }}>
					<SureButton variant="secondary">{formatMessage("routes.backToDashboard")}</SureButton>
				</Link>
			}
		/>
	);
}

export function RouteErrorState({
	title,
	message,
	onRetry,
}: {
	title?: string;
	message?: string;
	onRetry?: () => void | undefined;
}): React.ReactElement {
	const resolvedTitle = title ?? formatMessage("routes.errorTitle");
	const resolvedMessage = message ?? formatMessage("routes.errorDescription");
	return (
		<SureCard>
			<SureCardHeader>
				<SureCardTitle>{resolvedTitle}</SureCardTitle>
			</SureCardHeader>
			<SureCardContent>
				<SureAlert tone="destructive" title={resolvedTitle}>
					{resolvedMessage}
				</SureAlert>
				{onRetry !== undefined ? (
					<p>
						<SureButton variant="secondary" onPress={onRetry}>
							{formatMessage("routes.retry")}
						</SureButton>
					</p>
				) : null}
			</SureCardContent>
		</SureCard>
	);
}
