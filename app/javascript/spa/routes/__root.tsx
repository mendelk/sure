import { createRootRouteWithContext, Link } from "@tanstack/react-router";
import { AppShell } from "../app-shell";
import type { SpaBootstrap } from "../bootstrap";

function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight" id="not-found-title">
        SPA route not found
      </h1>
      <Link className="text-sm font-medium text-link hover:underline" to="/transactions">
        Return to transactions
      </Link>
    </section>
  );
}

export const Route = createRootRouteWithContext<{ bootstrap: SpaBootstrap }>()({
  component: AppShell,
  notFoundComponent: NotFoundPage,
});
