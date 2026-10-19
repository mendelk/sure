import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";

const TEXT_SEARCH_KEYS = ["search", "q[search]"] as const;

// Search terms are literal text, not JSON: quotes select exact amount matching.
// Keep TanStack's structured serialization for the other route filters.
export function parseSpaSearch(search: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = defaultParseSearch(search);
  const params = new URLSearchParams(search);
  for (const key of TEXT_SEARCH_KEYS) {
    const value = params.get(key);
    if (value !== null) parsed[key] = value;
  }
  return parsed;
}

export function stringifySpaSearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams(defaultStringifySearch(search));
  for (const key of TEXT_SEARCH_KEYS) {
    const value = search[key];
    if (typeof value === "string") params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
