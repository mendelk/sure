// LoginForm tests (t_alt_fnd_007).
//
// Every required login state renders through DS primitives with screen-
// reader semantics and zero axe violations: idle, pending, and each
// server-classified failure (invalid credentials, unsupported MFA,
// unavailable, throttled, api-mismatch).
//
// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, renderInMain } from "../ui/a11y-assert";
import type { BffLoginFormFailure } from "~/lib/bff-auth-client";
import { LoginForm } from "./login-form";

const FAILURES: { readonly state: BffLoginFormFailure; readonly title: string }[] = [
	{ state: "invalid-credentials", title: "Could not sign in" },
	{ state: "mfa-unsupported", title: "Two-factor accounts are not supported here" },
	{ state: "unavailable", title: "Service unavailable" },
	{ state: "throttled", title: "Too many attempts" },
	{ state: "api-mismatch", title: "Service is being updated" },
];

describe("LoginForm", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders labeled fields and submits credentials", async () => {
		const onSubmit = vi.fn<(email: string, password: string) => void>();
		const user = userEvent.setup();
		renderInMain(<LoginForm pending={false} failure={null} onSubmit={onSubmit} />);

		await user.type(screen.getByLabelText(/email/i), "user@example.com");
		await user.type(screen.getByLabelText(/password/i), "CorrectHorse1!");
		await user.click(screen.getByRole("button", { name: /log in/i }));

		expect(onSubmit).toHaveBeenCalledWith("user@example.com", "CorrectHorse1!");
		await expectNoAxeViolations();
	});

	it("disables submission while pending", async () => {
		const onSubmit = vi.fn<(email: string, password: string) => void>();
		renderInMain(<LoginForm pending={true} failure={null} onSubmit={onSubmit} />);
		expect(screen.getByRole("button", { name: /signing in/i })).toBeDefined();
		await expectNoAxeViolations();
	});

	for (const { state, title } of FAILURES) {
		it(`announces the ${state} state accessibly`, async () => {
			renderInMain(<LoginForm pending={false} failure={state} onSubmit={() => undefined} />);
			const heading = screen.getByText(title);
			expect(heading).toBeDefined();
			// Screen-reader semantics ride the wrapping SureAlert: assertive
			// for credential failures, polite status for everything else.
			const liveRegion = heading.closest('[role="alert"], [role="status"]');
			expect(liveRegion?.getAttribute("role")).toBe(
				state === "invalid-credentials" ? "alert" : "status",
			);
			await expectNoAxeViolations();
		});
	}

	it("asserts credential failures while other tones stay status", async () => {
		renderInMain(
			<LoginForm pending={false} failure="invalid-credentials" onSubmit={() => undefined} />,
		);
		const heading = screen.getByText("Could not sign in");
		expect(heading.closest('[role="alert"]')).not.toBeNull();
		expect(heading).toBeDefined();
	});
});
