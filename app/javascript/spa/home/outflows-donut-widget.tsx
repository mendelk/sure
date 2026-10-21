import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod/mini";
import { useSpaPaths } from "../api/paths";
import { CategoryIcon } from "../icon";
import { HomeApiError } from "./home-api";

const OutflowsCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  filter_value: z.nullable(z.string()),
  amount: z.number(),
  currency: z.string(),
  percentage: z.union([z.number(), z.string()]),
  color: z.string(),
  icon: z.nullable(z.string()),
  clickable: z.boolean(),
});

const OutflowsSchema = z.object({
  categories: z.array(OutflowsCategorySchema),
  total: z.number(),
  total_formatted: z.string(),
  currency: z.string(),
  currency_symbol: z.string(),
  period: z.object({
    start_date: z.string(),
    end_date: z.string(),
  }),
});

export type OutflowsData = z.infer<typeof OutflowsSchema>;
export type OutflowsCategory = z.infer<typeof OutflowsCategorySchema>;

const OutflowsEnvelopeSchema = z.object({ outflows: OutflowsSchema });

function extractOutflows(payload: unknown): OutflowsData {
  const envelope = OutflowsEnvelopeSchema.safeParse(payload);
  if (envelope.success) return envelope.data.outflows;
  return OutflowsSchema.parse(payload);
}

function outflowsQueryOptions(basePath: string) {
  return {
    queryKey: ["spa", "home", "outflows", basePath] as const,
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<OutflowsData> => {
      const response = await fetch(basePath, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new HomeApiError(`Outflows request failed (${response.status})`, response.status);
      return extractOutflows(payload);
    },
    staleTime: 30_000,
  };
}

export type OutflowsDonutText = {
  totalOutflows: string;
  categories: string;
  value: string;
  weight: string;
  loading: string;
  loadError: string;
};

const DEFAULT_TEXT: OutflowsDonutText = {
  totalOutflows: "Total Outflows",
  categories: "Categories",
  value: "Value",
  weight: "Weight",
  loading: "Loading…",
  loadError: "Outflows could not be loaded.",
};

/**
 * Builds the transaction drill-down URL for a category, mirroring the ERB
 * `transactions_path(q: { categories: [filter_value], start_date, end_date })`
 * params and `transactions_filter_url.mjs` (q[categories][], q[start/end_date]).
 */
function categoryTransactionsHref(
  category: OutflowsCategory,
  period: { start_date: string; end_date: string },
): string {
  const params = new URLSearchParams();
  params.append("q[categories][]", category.filter_value ?? category.name);
  params.append("q[start_date]", period.start_date);
  params.append("q[end_date]", period.end_date);
  return `/transactions?${params.toString()}`;
}

function DonutChart({
  categories,
  totalFormatted,
  hoveredId,
  period,
  onHover,
}: {
  categories: OutflowsCategory[];
  totalFormatted: string;
  hoveredId: string | null;
  period: { start_date: string; end_date: string };
  onHover: (id: string | null) => void;
}) {
  const size = 100;
  const radius = 38;
  const stroke = 12;
  const total = categories.reduce((sum, c) => sum + c.amount, 0);

  const segments = useMemo(() => {
    if (total <= 0) return [];
    const gap = 0.005;
    let angle = -Math.PI / 2;
    return categories.map((category) => {
      const fraction = category.amount / total;
      const sweep = Math.max(0.02, fraction * Math.PI * 2 - gap);
      const start = angle + gap / 2;
      const end = start + sweep;
      angle = end + gap / 2;
      const large = sweep > Math.PI ? 1 : 0;
      const x1 = size / 2 + radius * Math.cos(start);
      const y1 = size / 2 + radius * Math.sin(start);
      const x2 = size / 2 + radius * Math.cos(end);
      const y2 = size / 2 + radius * Math.sin(end);
      return {
        category,
        d: `M${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
      };
    });
  }, [categories, total]);

  const hovered = hoveredId === null ? undefined : categories.find((c) => c.id === hoveredId);

  return (
    <div className="relative h-[300px]">
      <div
        onMouseLeave={() => {
          onHover(null);
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="size-full" aria-label={totalFormatted}>
          {segments.map(({ category, d }) => {
            const dimmed = hoveredId !== null && hoveredId !== category.id;
            return (
              <path
                key={category.id}
                d={d}
                fill="none"
                stroke={
                  dimmed ? "var(--budget-unallocated-fill, var(--color-gray-200))" : category.color
                }
                strokeWidth={stroke}
                strokeLinecap="round"
                opacity={0.9}
                data-segment-id={category.id}
                style={{ pointerEvents: "all", cursor: category.clickable ? "pointer" : "default" }}
                onMouseEnter={() => {
                  onHover(category.id);
                }}
                onClick={() => {
                  if (category.clickable)
                    window.location.href = categoryTransactionsHref(category, period);
                }}
              >
                <title>{category.name}</title>
              </path>
            );
          })}
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {hovered !== undefined ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-secondary">{hovered.name}</p>
            <p className="text-3xl font-medium whitespace-nowrap text-primary privacy-sensitive">
              {hovered.amount.toLocaleString()}
            </p>
            <p className="text-sm text-secondary privacy-sensitive">
              {typeof hovered.percentage === "number"
                ? hovered.percentage
                : hovered.percentage.replace(/%$/u, "")}
              %
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="mb-2 text-sm text-secondary">
              <span>{DEFAULT_TEXT.totalOutflows}</span>
            </div>
            <div className="text-3xl font-medium whitespace-nowrap text-primary privacy-sensitive">
              {totalFormatted}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function OutflowsDonutWidget({
  homePath,
  text = DEFAULT_TEXT,
}: {
  homePath: string;
  text?: OutflowsDonutText;
}) {
  const paths = useSpaPaths();
  const resolvedPath = homePath.length > 0 ? homePath : paths.apiPaths.home;
  const query = useQuery({
    ...outflowsQueryOptions(resolvedPath),
    retry: (failureCount, error) =>
      !(error instanceof HomeApiError && error.status < 500) && failureCount < 2,
  });
  const data = query.data;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div id="outflows-donut-section" className="@container">
      <div className="px-4">
        {query.isError ? (
          <p className="text-sm text-destructive">{text.loadError}</p>
        ) : query.isLoading || data === undefined ? (
          <p className="text-sm text-secondary">{text.loading}</p>
        ) : (
          <div className="flex flex-col items-center gap-8 @2xl:flex-row">
            <div className="w-full max-w-[300px] px-4 @2xl:w-1/3">
              <DonutChart
                categories={data.categories}
                totalFormatted={data.total_formatted}
                hoveredId={hoveredId}
                period={data.period}
                onHover={setHoveredId}
              />
            </div>
            <div className="w-full space-y-1 overflow-x-auto rounded-xl bg-container-inset p-1 @2xl:w-2/3">
              <div className="flex items-center px-4 py-2 text-xs font-medium text-secondary uppercase">
                <div className="w-16 @2xl:w-40">
                  <p>
                    {text.categories}
                    <span className="mx-1 text-subdued">&middot;</span>
                    {data.categories.length}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-6 text-right">
                  <div className="w-16 @2xl:w-40">
                    <p>{text.value}</p>
                  </div>
                  <div className="w-16">
                    <p>{text.weight}</p>
                  </div>
                </div>
              </div>
              <div className="max-w-full rounded-lg bg-container py-3 font-medium shadow-border-xs">
                {data.categories.map((category, index) => (
                  <div key={category.id}>
                    {category.clickable ? (
                      <a
                        href={categoryTransactionsHref(category, data.period)}
                        data-category-id={category.id}
                        aria-label={`${category.name}: ${category.amount.toLocaleString()}`}
                        className="group mx-3 flex items-center justify-between gap-3 rounded-lg p-3"
                        onMouseEnter={() => {
                          setHoveredId(category.id);
                        }}
                        onMouseLeave={() => {
                          setHoveredId(null);
                        }}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 group-hover:scale-105"
                            style={{
                              backgroundColor: `color-mix(in oklab, ${category.color} 10%, transparent)`,
                              color: category.color,
                            }}
                          >
                            {category.icon !== null && category.icon.length > 0 ? (
                              <CategoryIcon name={category.icon} />
                            ) : (
                              <span className="text-xs font-medium">
                                {category.name.slice(0, 1)}
                              </span>
                            )}
                          </span>
                          <span className="truncate text-sm font-medium text-primary">
                            {category.name}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-4 text-right">
                          <span className="text-sm font-medium whitespace-nowrap text-primary privacy-sensitive">
                            {data.currency_symbol}
                            {category.amount.toLocaleString()}
                          </span>
                          <span className="w-10 text-sm whitespace-nowrap text-secondary @2xl:w-15 privacy-sensitive">
                            {typeof category.percentage === "number"
                              ? category.percentage
                              : category.percentage.replace(/%$/u, "")}
                            %
                          </span>
                        </span>
                      </a>
                    ) : (
                      <div
                        data-category-id={category.id}
                        className="group mx-3 flex items-center justify-between gap-3 rounded-lg p-3"
                        onMouseEnter={() => {
                          setHoveredId(category.id);
                        }}
                        onMouseLeave={() => {
                          setHoveredId(null);
                        }}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 group-hover:scale-105"
                            style={{
                              backgroundColor: `color-mix(in oklab, ${category.color} 10%, transparent)`,
                              color: category.color,
                            }}
                          >
                            {category.icon !== null && category.icon.length > 0 ? (
                              <CategoryIcon name={category.icon} />
                            ) : (
                              <span className="text-xs font-medium">
                                {category.name.slice(0, 1)}
                              </span>
                            )}
                          </span>
                          <span className="truncate text-sm font-medium text-primary">
                            {category.name}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-4 text-right">
                          <span className="text-sm font-medium whitespace-nowrap text-primary privacy-sensitive">
                            {data.currency_symbol}
                            {category.amount.toLocaleString()}
                          </span>
                          <span className="w-10 text-sm whitespace-nowrap text-secondary @2xl:w-15 privacy-sensitive">
                            {typeof category.percentage === "number"
                              ? category.percentage
                              : category.percentage.replace(/%$/u, "")}
                            %
                          </span>
                        </span>
                      </div>
                    )}
                    {index < data.categories.length - 1 ? (
                      <hr className="mx-3 border-secondary @2xl:mx-4" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
