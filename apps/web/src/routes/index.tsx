import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { PublicChrome } from "~/components/shell/public-chrome";
import { getSureApiOrigin } from "~/lib/sure-api.server";

export interface SureApiStatus {
	apiOrigin: string;
	renderedAt: string;
}

const getSureApiStatus = createServerFn({ method: "GET" }).handler(
	async (): Promise<SureApiStatus> => {
		// Runs on the server during SSR: throws a clear error at startup
		// when SURE_API_ORIGIN is missing or invalid. No `await` here:
		// getSureApiOrigin is synchronous (type-aware lint flags awaiting
		// non-promises via typescript/await-thenable).
		const apiOrigin = getSureApiOrigin();

		return { apiOrigin, renderedAt: new Date().toISOString() };
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

	return (
		<PublicChrome>
			<section className="sure-starter">
				<h1>Sure Web starter route</h1>
				<p data-testid="ssr-status">
					Rendered on the server against Sure API origin <code>{data.apiOrigin}</code> at{" "}
					<time dateTime={data.renderedAt}>{data.renderedAt}</time>.
				</p>
				<p data-testid="hydration-status">Hydrated in the browser with TanStack Query.</p>
			</section>
		</PublicChrome>
	);
}
