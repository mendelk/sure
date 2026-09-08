/**
 * Structured `Set-Cookie` instruction shared by the pure session policy
 * (`./bff-session`) and the server-only session store
 * (`./sure-auth-session.server`), which applies it via the framework's
 * `setCookie`/`deleteCookie` inside request-scoped server functions.
 *
 * Values travel structured (never pre-serialized) so there is exactly one
 * serializer — the framework's — and cookie attributes stay type-checked.
 */

export type BffSameSite = "lax" | "strict" | "none";

export interface BffSetCookie {
	readonly name: string;
	readonly value: string;
	readonly httpOnly: boolean;
	readonly secure: boolean;
	readonly sameSite: BffSameSite;
	readonly path: string;
	/** `Max-Age` in seconds; omitted for session-lifetime cookies. */
	readonly maxAge?: number | undefined;
}
