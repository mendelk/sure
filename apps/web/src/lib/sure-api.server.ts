import { createServerOnlyFn } from "@tanstack/react-start";
import { SURE_API_ORIGIN_ENV_VAR, assertSureApiOrigin } from "./sure-api-origin";

/**
 * Server-only accessor for the deployment-level Sure API origin.
 *
 * Throws with a clear, actionable message when the origin is missing or
 * invalid so SSR fails fast instead of rendering against a broken backend.
 * Never import this (transitively) from client components.
 */
export const getSureApiOrigin = createServerOnlyFn((): string => {
	const result = assertSureApiOrigin(process.env[SURE_API_ORIGIN_ENV_VAR]);

	if (!result.ok) {
		throw new Error(
			`${result.error} Set ${SURE_API_ORIGIN_ENV_VAR} to the Rails API origin ` +
				`(e.g. ${SURE_API_ORIGIN_ENV_VAR}=http://localhost:3000).`,
		);
	}

	return result.origin;
});
