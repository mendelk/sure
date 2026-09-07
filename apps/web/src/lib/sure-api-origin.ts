export const SURE_API_ORIGIN_ENV_VAR = "SURE_API_ORIGIN";

export type SureApiOriginResult = { ok: true; origin: string } | { ok: false; error: string };

function invalid(message: string): SureApiOriginResult {
	return {
		ok: false,
		error: `${SURE_API_ORIGIN_ENV_VAR} is invalid: ${message}`,
	};
}

/**
 * Validate the deployment-level Sure API origin.
 *
 * Pure (no `process.env` access) so it can be unit-tested and reused from
 * both the Vite serve-time startup check and the server-only runtime
 * accessor. Returns the origin normalized without a trailing slash.
 */
export function assertSureApiOrigin(rawValue: string | undefined): SureApiOriginResult {
	const value = (rawValue ?? "").trim();

	if (value === "") {
		return invalid("value is missing or empty.");
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return invalid(`"${value}" is not an absolute URL.`);
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return invalid(`protocol must be http or https, got "${url.protocol}".`);
	}

	if (url.username !== "" || url.password !== "") {
		return invalid("must not include credentials.");
	}

	if (url.pathname !== "/") {
		return invalid(`must not include a path, got "${url.pathname}".`);
	}

	if (url.search !== "") {
		return invalid(`must not include a query string, got "${url.search}".`);
	}

	if (url.hash !== "") {
		return invalid(`must not include a fragment, got "${url.hash}".`);
	}

	return { ok: true, origin: url.origin };
}
