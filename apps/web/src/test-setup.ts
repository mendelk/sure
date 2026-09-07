// Shared vitest setup (apps/web). Registers jest-dom matchers once for
// every suite; suites stay hermetic (no network, no deployment env).
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// testing-library only auto-cleans when the runner exposes globals; this
// repo runs vitest without globals, so unmount explicitly — otherwise
// renders (and open overlay portals) leak across tests in a file and axe
// reports duplicate landmarks.
afterEach(() => {
	cleanup();
});
