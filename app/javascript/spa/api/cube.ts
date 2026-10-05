import * as z from "zod/mini";
import {
  CubeApi,
  type ITransport,
  type ITransportResponse,
  type ResultSet,
} from "@cubejs-client/core";
import { readCsrfToken } from "./transactions";

export const CUBE_MEASURES = [
  "cash_flow.income",
  "cash_flow.expenses",
  "cash_flow.savings",
  "cash_flow.count",
] as const;
export const CUBE_DIMENSIONS = ["cash_flow.category", "cash_flow.account"] as const;
export const CUBE_GRANULARITIES = ["day", "week", "month", "quarter", "year"] as const;
export const CubeQuerySchema = z.object({
  measures: z.array(z.enum(CUBE_MEASURES)),
  dimensions: z.optional(z.array(z.enum(CUBE_DIMENSIONS))),
  timeDimensions: z.array(
    z.object({
      dimension: z.literal("cash_flow.date"),
      dateRange: z.tuple([z.string(), z.string()]),
      granularity: z.optional(z.enum(CUBE_GRANULARITIES)),
    }),
  ),
  order: z.record(z.string(), z.enum(["asc", "desc"])),
  limit: z.number(),
});
export type CubeQuery = z.infer<typeof CubeQuerySchema>;
export type CubeMeasure = (typeof CUBE_MEASURES)[number];
export type CubeGranularity = (typeof CUBE_GRANULARITIES)[number];
const CubeCatalogSchema = z.object({
  measures: z.array(z.object({ name: z.enum(CUBE_MEASURES), title: z.string(), type: z.string() })),
  dimensions: z.array(
    z.object({
      name: z.enum(["cash_flow.date", ...CUBE_DIMENSIONS]),
      title: z.string(),
      type: z.string(),
    }),
  ),
  granularities: z.array(z.enum(CUBE_GRANULARITIES)),
  configured: z.boolean(),
});
const AnnotationSchema = z.looseObject({
  title: z.string(),
  shortTitle: z.string(),
  type: z.string(),
});
const CubeWireResultSchema = z.object({
  query: CubeQuerySchema,
  data: z.array(z.record(z.string(), z.nullable(z.union([z.string(), z.number()])))),
  annotation: z.object({
    measures: z.record(z.string(), AnnotationSchema),
    dimensions: z.record(z.string(), AnnotationSchema),
    timeDimensions: z.record(z.string(), AnnotationSchema),
    segments: z.record(z.string(), AnnotationSchema),
  }),
  currency: z.string(),
  lastRefreshTime: z.nullable(z.string()),
  truncated: z.boolean(),
});
export interface CubeResult {
  resultSet: ResultSet<Record<string, string | number | boolean | null>>;
  currency: string;
  truncated: boolean;
}
export type CubeCatalog = z.infer<typeof CubeCatalogSchema>;

export class CubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly invalidResponse = false,
  ) {
    super(message);
    this.name = "CubeApiError";
  }
}

async function postCube(endpoint: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "";
    throw new CubeApiError(message, response.status);
  }
  return payload;
}

// The SDK sees a standard single-query load response; Rails remains responsible
// for authorization, fresh account scope, limits, and the private Cube token.
function createRailsCubeTransport(endpoint: string, signal?: AbortSignal) {
  let response: z.infer<typeof CubeWireResultSchema> | undefined;
  const transport: ITransport<Response> = {
    authorization: undefined,
    request(method, params) {
      if (method !== "load") throw new CubeApiError("", 422);
      const subscribe: ITransportResponse<Response>["subscribe"] = async (callback) => {
        const parsed = CubeWireResultSchema.safeParse(
          await postCube(endpoint, { query: params.query }, signal),
        );
        if (!parsed.success) throw new CubeApiError("", 200, true);
        response = parsed.data;
        const query = { ...parsed.data.query, timezone: "UTC" };
        return callback(
          Response.json({
            queryType: "regularQuery",
            results: [
              {
                query,
                data: parsed.data.data,
                annotation: parsed.data.annotation,
                lastRefreshTime: parsed.data.lastRefreshTime,
              },
            ],
            pivotQuery: { ...query, queryType: "regularQuery" },
          }),
          () => subscribe(callback),
        );
      };
      return { subscribe };
    },
  };
  return {
    transport,
    get response() {
      return response;
    },
  };
}

export async function fetchCubeCatalog(
  endpoint: string,
  signal?: AbortSignal,
): Promise<CubeCatalog> {
  const parsed = CubeCatalogSchema.safeParse(await postCube(endpoint, { catalog: true }, signal));
  if (!parsed.success) throw new CubeApiError("", 200, true);
  return parsed.data;
}

export async function executeCubeQuery(
  endpoint: string,
  query: CubeQuery,
  signal?: AbortSignal,
): Promise<CubeResult> {
  const request = createRailsCubeTransport(endpoint, signal);
  const api = new CubeApi({ apiUrl: endpoint, transport: request.transport, castNumerics: false });
  const resultSet = await api.load(query, { signal, castNumerics: false, cache: "no-cache" });
  if (request.response === undefined) throw new CubeApiError("", 200, true);
  return {
    resultSet,
    currency: request.response.currency,
    truncated: request.response.truncated,
  };
}

export function cubeErrorText(error: unknown, text: Record<string, string>): string {
  if (error instanceof CubeApiError) {
    if (error.invalidResponse) return text.invalid_response;
    if (error.message) return error.message;
    if (error.status === 503) return text.unavailable;
  }
  return text.query_error;
}
