/**
 * Navigation-focus tracking tests (t_alt_fnd_010): fresh page loads
 * report no client navigation; the first history notification marks it.
 *
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import {
	hasClientSideNavigated,
	resetClientSideNavigationForTests,
	useMarkClientSideNavigations,
} from "./navigation-focus";

function Probe({
	history,
}: {
	history: { subscribe(listener: () => void): () => void };
}): React.ReactElement {
	useMarkClientSideNavigations(history);
	return <output data-testid="probe">probe</output>;
}

describe("navigation focus tracking", () => {
	it("starts unmarked until the first history notification", () => {
		resetClientSideNavigationForTests();
		const listeners = new Set<() => void>();
		const history = {
			subscribe: (listener: () => void): (() => void) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		};
		render(<Probe history={history} />);
		expect(hasClientSideNavigated()).toBe(false);
		for (const notify of listeners) {
			notify();
		}
		expect(hasClientSideNavigated()).toBe(true);
		resetClientSideNavigationForTests();
		expect(hasClientSideNavigated()).toBe(false);
	});
});
