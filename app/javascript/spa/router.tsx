import {
  Link,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { Router } from "@tanstack/react-router";
import type { SpaBootstrap } from "./bootstrap";

type RouterContext = {
  bootstrap: SpaBootstrap;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: SpaFrame,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/spa",
  component: HomePage,
});

const routingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/spa/routing",
  component: RoutingPage,
});

// SPA routes use their real application URLs. Each route is mirrored explicitly
// in config/routes.rb, so React and Rails pages can coexist at the same root.
const routeTree = rootRoute.addChildren([indexRoute, routingRoute]);

export type SpaRouter = Router<typeof routeTree>;

export function createSpaRouter(bootstrap: SpaBootstrap): SpaRouter {
  return createRouter({
    context: { bootstrap },
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: SpaRouter;
  }
}

function SpaFrame() {
  const { bootstrap } = rootRoute.useRouteContext();

  return (
    <div className="min-h-dvh bg-surface text-primary">
      <header className="border-b border-tertiary bg-container">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
          <a
            className="font-semibold tracking-tight"
            href={bootstrap.railsPaths.home}
          >
            Sure
          </a>
          <nav aria-label="SPA navigation">
            <ul className="flex items-center gap-1 text-sm">
              <li>
                <Link
                  activeProps={{ className: "bg-container-inset text-primary" }}
                  className="block rounded-lg px-3 py-2 text-secondary transition-colors hover:bg-container-hover hover:text-primary"
                  to="/spa"
                >
                  Start
                </Link>
              </li>
              <li>
                <Link
                  activeProps={{ className: "bg-container-inset text-primary" }}
                  className="block rounded-lg px-3 py-2 text-secondary transition-colors hover:bg-container-hover hover:text-primary"
                  to="/spa/routing"
                >
                  Routing
                </Link>
              </li>
              <li>
                <a
                  className="block rounded-lg px-3 py-2 text-secondary transition-colors hover:bg-container-hover hover:text-primary"
                  href={bootstrap.railsPaths.home}
                >
                  Rails app
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function HomePage() {
  const { bootstrap } = rootRoute.useRouteContext();

  return (
    <section aria-labelledby="spa-title" className="max-w-2xl space-y-6">
      <p className="text-sm font-medium text-secondary">Incremental frontend</p>
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight" id="spa-title">
          TanStack Router is mounted inside Rails.
        </h1>
        <p className="text-base leading-7 text-secondary">
          This route uses React while the existing application continues to use
          Rails and Hotwire. Routes can move across this boundary one at a time.
        </p>
      </div>
      <div className="rounded-xl border border-primary bg-container p-5">
        <p className="text-sm text-secondary">Authenticated Rails session</p>
        <p className="mt-1 font-medium">
          Signed in as {bootstrap.currentUser.name}
        </p>
      </div>
      <Link
        className="inline-flex rounded-lg button-bg-primary px-4 py-2.5 text-sm font-medium text-inverse transition-colors hover:button-bg-primary-hover"
        to="/spa/routing"
      >
        Test client-side routing
      </Link>
    </section>
  );
}

function RoutingPage() {
  return (
    <section aria-labelledby="routing-title" className="max-w-2xl space-y-6">
      <p className="text-sm font-medium text-secondary">
        Client-side navigation
      </p>
      <div className="space-y-3">
        <h1
          className="text-4xl font-semibold tracking-tight"
          id="routing-title"
        >
          The URL changed without leaving the SPA.
        </h1>
        <p className="text-base leading-7 text-secondary">
          Reloading this URL still reaches Rails first, which authenticates the
          request and serves the same React shell.
        </p>
      </div>
      <Link className="text-sm font-medium text-link hover:underline" to="/spa">
        Back to the SPA start
      </Link>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="space-y-4">
      <h1
        className="text-3xl font-semibold tracking-tight"
        id="not-found-title"
      >
        SPA route not found
      </h1>
      <Link className="text-sm font-medium text-link hover:underline" to="/spa">
        Return to the SPA start
      </Link>
    </section>
  );
}
