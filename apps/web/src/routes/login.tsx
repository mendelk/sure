import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
	getCookie,
	getRequestHeader,
	getRequestIP,
	getRequestUrl,
	setCookie,
} from "@tanstack/react-start/server";
import * as React from "react";
import { useEffect, useState } from "react";
import { LoginForm } from "~/components/auth/login-form";
import { PublicChrome } from "~/components/shell/public-chrome";
import { BFF_SESSION_QUERY_KEY, mapLoginErrorToFailure } from "~/lib/bff-auth-client";
import type {
	BffLoginErrorCode,
	BffLoginFormFailure,
	BffSessionStatus,
	BffSessionUser,
} from "~/lib/bff-auth-client";
import { formatMessage } from "~/lib/i18n/messages";
import { splitNextTarget } from "~/lib/route-guards";
import {
	getBffSessionStatus,
	loginToBffSession,
	logoutOfBffSession,
} from "~/lib/sure-auth-session.server";

function applyBffCookies(
	cookies: readonly {
		name: string;
		value: string;
		httpOnly: boolean;
		secure: boolean;
		sameSite: "lax" | "strict" | "none";
		path: string;
		maxAge?: number | undefined;
	}[],
): void {
	for (const cookie of cookies) {
		setCookie(cookie.name, cookie.value, {
			httpOnly: cookie.httpOnly,
			secure: cookie.secure,
			sameSite: cookie.sameSite,
			path: cookie.path,
			...(cookie.maxAge === undefined ? {} : { maxAge: cookie.maxAge }),
		});
	}
}

function requestBffOrigin(): string {
	return new URL(getRequestUrl()).origin;
}

/** Browser-visible session status (display data only, never tokens). */
export const bffSessionStatusFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<BffSessionStatus> => {
		return getBffSessionStatus(getRequestHeader("Cookie") ?? null);
	},
);

interface BffLoginFnInput {
	readonly email: string;
	readonly password: string;
}

type BffLoginFnResult =
	| {
			readonly ok: true;
			readonly user: BffSessionUser;
			readonly csrfToken: string;
	  }
	| { readonly ok: false; readonly error: { readonly code: BffLoginErrorCode } };

/** Server-side login: credentials travel only BFF→Rails (REQ-AUTH-01). */
export const bffLoginFn = createServerFn({ method: "POST" })
	.validator((data: unknown): BffLoginFnInput => {
		if (typeof data !== "object" || data === null) {
			throw new Error(formatMessage("auth.invalidData"));
		}
		// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Narrowing boundary: server-function input is untyped JSON; both fields are re-validated as strings immediately below.
		const record = data as { email?: unknown; password?: unknown };
		if (typeof record.email !== "string" || typeof record.password !== "string") {
			throw new Error(formatMessage("auth.invalidData"));
		}
		return { email: record.email, password: record.password };
	})
	.handler(async ({ data }): Promise<BffLoginFnResult> => {
		const result = await loginToBffSession({
			email: data.email,
			password: data.password,
			origin: getRequestHeader("Origin") ?? null,
			bffOrigin: requestBffOrigin(),
			cookieHeader: getRequestHeader("Cookie") ?? null,
			clientKey: getRequestIP() ?? "unknown",
		});
		if (!result.ok) {
			return { ok: false, error: { code: result.error.code } };
		}
		applyBffCookies(result.cookies);
		return { ok: true, user: result.user, csrfToken: result.csrfToken };
	});

/** Three-step server-side logout (session destroy + revocation + clearing). */
export const bffLogoutFn = createServerFn({ method: "POST" }).handler(
	async (): Promise<{ readonly ok: true }> => {
		const result = await logoutOfBffSession({
			cookieHeader: getRequestHeader("Cookie") ?? null,
			origin: getRequestHeader("Origin") ?? null,
			csrfToken: getRequestHeader("X-Csrf-Token") ?? getCookie("__Host-sure-bff-csrf") ?? null,
			bffOrigin: requestBffOrigin(),
		});
		applyBffCookies(result.cookies);
		return { ok: true };
	},
);

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => {
		const next = search["next"];
		return typeof next === "string" ? { next } : {};
	},
	component: LoginPage,
});

function LoginPage(): React.ReactElement {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [failure, setFailure] = useState<BffLoginFormFailure | null>(null);

	// Already signed in (e.g. SSR status): leave the login page.
	const [status, setStatus] = useState<BffSessionStatus | null>(null);
	useEffect(() => {
		let cancelled = false;
		void bffSessionStatusFn().then((next) => {
			if (!cancelled) {
				setStatus(next);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);
	useEffect(() => {
		if (status !== null && status.authenticated) {
			const target = splitNextTarget(search.next);
			void navigate({ to: target.to, search: target.search, replace: true });
		}
	}, [status, search.next, navigate]);

	async function handleSubmit(email: string, password: string): Promise<void> {
		setPending(true);
		setFailure(null);
		try {
			const result = await bffLoginFn({ data: { email, password } });
			if (result.ok) {
				queryClient.setQueryData(BFF_SESSION_QUERY_KEY, {
					authenticated: true,
					user: result.user,
					csrfToken: result.csrfToken,
				} satisfies BffSessionStatus);
				const target = splitNextTarget(search.next);
				await navigate({ to: target.to, search: target.search, replace: true });
			} else {
				setFailure(mapLoginErrorToFailure(result.error.code));
			}
		} catch {
			setFailure("unavailable");
		} finally {
			setPending(false);
		}
	}

	// The card title ("Log in to Sure") is the page heading.
	return (
		<PublicChrome>
			<LoginForm
				pending={pending}
				failure={failure}
				onSubmit={(email, password) => void handleSubmit(email, password)}
			/>
		</PublicChrome>
	);
}
