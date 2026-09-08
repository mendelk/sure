import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { PublicChrome } from "~/components/shell/public-chrome";
import { describeApiCompatibility } from "~/lib/sure-api-compat";
import type { ApiCompatibility } from "~/lib/sure-api-compat";
import { checkApiCompatibility } from "~/lib/sure-api-compat.server";
import { getSureApiOrigin } from "~/lib/sure-api.server";

export interface SureApiStatus {
	renderedAt: string;
	/** Deployment contract decision (`t_alt_fnd_015`): never carries origins. */
	compatibility: ApiCompatibility;
}

const getSureApiStatus = createServerFn({ method: "GET" }).handler(
	async (): Promise<SureApiStatus> => {
		// Runs on the server during SSR: still throws a clear error at
		// startup when SURE_API_ORIGIN is missing or invalid, but the
		// origin itself never enters the browser-visible response
		// (`t_alt_fnd_015` origin hygiene). No `await` here for the origin
		// itself: getSureApiOrigin is synchronous (type-aware lint flags
		// awaiting non-promises via typescript/await-thenable).
		getSureApiOrigin();

		// Readiness (`t_alt_fnd_015`): reject an incompatible Sure API
		// before the browser issues arbitrary requests. The decision is
		// server-side and origin-free; only the state (plus the truncated
		// server version and missing capability tokens) reaches the client.
		const compatibility = await checkApiCompatibility();

		return { renderedAt: new Date().toISOString(), compatibility };
	},
);

const sureApiStatusQuery = queryOptions({
	queryKey: ["sure-api-status"],
	queryFn: () => getSureApiStatus(),
});

export const Route = createFileRoute("/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(sureApiStatusQuery),
	component: Home,
});

function Home() {
	const { data } = useSuspenseQuery(sureApiStatusQuery);
	const message = describeApiCompatibility(data.compatibility);

	return (
		<PublicChrome>
			<section className="sure-starter">
				<h1>Sure Web starter route</h1>
				<p data-testid="ssr-status">
					Rendered on the server at <time dateTime={data.renderedAt}>{data.renderedAt}</time>.
				</p>
				<p data-testid="hydration-status">Hydrated in the browser with TanStack Query.</p>
				<p data-testid="api-compatibility" data-state={data.compatibility.state}>
					<strong>{message.title}:</strong> {message.detail}
				</p>
			</section>
		</PublicChrome>
	);
}
