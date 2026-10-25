import Fuse from "fuse.js";

// Shared client-side fuzzy matching for SPA search fields (dropdown
// pickers, checkbox filter lists, search boxes).
//
// Empty/blank queries return every item in order, preserving the "show
// all" behavior of the substring filters this replaced. Non-empty
// queries return matches in Fuse rank order (best match first), so
// typos and transposed characters still find the right row.
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  pick: (item: T) => string | readonly string[],
): T[] {
  if (query.trim().length === 0) return [...items];
  const entries = items.map((item) => ({ haystack: pick(item), item }));
  const fuse = new Fuse(entries, {
    ignoreLocation: true,
    keys: ["haystack"],
    minMatchCharLength: 1,
    threshold: 0.6,
  });
  return fuse.search(query).map((result) => result.item.item);
}
