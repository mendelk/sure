/* eslint-disable import/max-dependencies -- Search combines API transport, accessible selection, queries, routing, and shared controls. */
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useDebouncedValue } from "@tanstack/react-pacer/debouncer";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import * as z from "zod/mini";
import { Icon } from "./icon";
import { Button } from "./components/button";
import { Modal } from "./modal";
import { apiFetch } from "./api/client";

const SearchHitSchema = z.object({
  id: z.string(),
  type: z.enum(["account", "transaction", "category", "merchant", "tag"]),
  title: z.string(),
  subtitle: z.string(),
  url: z.string(),
});

type SearchHit = z.infer<typeof SearchHitSchema>;

const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.object({
    accounts: z.array(SearchHitSchema),
    transactions: z.array(SearchHitSchema),
    categories: z.array(SearchHitSchema),
    merchants: z.array(SearchHitSchema),
    tags: z.array(SearchHitSchema),
  }),
});

type SearchGroup = keyof z.infer<typeof SearchResponseSchema>["results"];

const GROUP_LABELS: Record<SearchGroup, string> = {
  accounts: "Accounts",
  transactions: "Transactions",
  categories: "Categories",
  merchants: "Merchants",
  tags: "Tags",
};

const GROUP_ORDER: SearchGroup[] = ["merchants", "categories", "tags", "accounts", "transactions"];

const HIT_GROUP: Record<SearchHit["type"], SearchGroup> = {
  account: "accounts",
  transaction: "transactions",
  category: "categories",
  merchant: "merchants",
  tag: "tags",
};

// Module scope: captures nothing, so recreating it per render is waste.
function focusSearchInput(element: HTMLInputElement | null) {
  element?.focus();
}

async function requestSearch(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q: query, per_type: "6" });
  const response = await apiFetch(`/api/v1/search?${params.toString()}`, {
    signal,
  });
  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  const payload: unknown = await response.json();
  const parsed = SearchResponseSchema.parse(payload);
  return GROUP_ORDER.flatMap((group) => parsed.results[group]);
}

function searchQueryOptions(term: string) {
  return queryOptions({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => requestSearch(term, signal),
    queryKey: ["spa", "global-search", term] as const,
    staleTime: 30_000,
  });
}

export function GlobalSearchPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Debounce keystrokes so one request fires per pause, not per character.
  const [debouncedQuery] = useDebouncedValue(query, { wait: 200 });
  const term = debouncedQuery.trim();

  // React Query dedupes in-flight requests by key and aborts the previous
  // one when the term changes, so a slow early response can't overwrite
  // fresh hits.
  const searchQuery = useQuery({
    ...searchQueryOptions(term),
    enabled: open && term.length > 0,
  });
  const hits = term.length === 0 ? [] : (searchQuery.data ?? []);
  const searching = searchQuery.isFetching && term.length > 0;

  useHotkey(
    "Mod+K",
    (event) => {
      event.preventDefault();
      setOpen((value) => !value);
    },
    { preventDefault: true },
  );

  function close() {
    setOpen(false);
    setQuery("");
  }

  // Category/merchant/tag hits target the filtered transactions list; the
  // query string carries the name filter (?categories[]=X).
  function navigateToHit(hit: SearchHit) {
    const separator = hit.url.indexOf("?");
    if (separator === -1) {
      void navigate({ to: hit.url });
      return;
    }
    const params = new URLSearchParams(hit.url.slice(separator + 1));
    const categories = params.getAll("categories[]");
    const merchants = params.getAll("merchants[]");
    const tags = params.getAll("tags[]");
    void navigate({
      search: {
        ...(categories.length > 0 ? { categories } : {}),
        ...(merchants.length > 0 ? { merchants } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      },
      to: hit.url.slice(0, separator),
    });
  }

  function go(selected: SearchHit[] | null) {
    const hit = selected?.[0];
    if (hit === undefined) return;
    close();
    navigateToHit(hit);
  }

  return (
    <>
      <Button
        className="text-secondary hover:text-primary"
        iconProps={{ name: "search", size: "sm" }}
        onClick={() => {
          setOpen(true);
        }}
        variant="outline"
      >
        <span className="hidden md:inline">Search…</span>
        <kbd className="hidden rounded-sm border border-secondary px-1.5 text-xs font-normal md:inline">
          ⌘K
        </kbd>
      </Button>
      <Modal
        onClose={close}
        open={open}
        panelClassName="w-full max-w-xl overflow-hidden rounded-xl bg-container shadow-lg"
      >
        <Combobox immediate onChange={go} value={[]}>
          <div className="flex items-center gap-2 border-b border-tertiary px-4">
            <Icon className="shrink-0 text-secondary" name="search" size="sm" />
            <ComboboxInput
              autoComplete="off"
              className="h-12 w-full border-none bg-transparent text-base text-primary placeholder:text-secondary focus:outline-hidden focus:ring-0"
              displayValue={() => query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                // Headless consumes the first Escape to close the listbox;
                // claim it here so one press closes the whole palette.
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                close();
              }}
              placeholder="Search accounts, transactions, categories, merchants…"
              ref={focusSearchInput}
              value={query}
            />
            {searching ? (
              <output className="shrink-0 text-xs text-secondary">Searching…</output>
            ) : null}
          </div>
          {hits.length > 0 || (term.length > 0 && !searching) ? (
            <ComboboxOptions className="max-h-80 overflow-y-auto p-2" modal={false} static>
              {hits.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-secondary">No matches found</p>
              ) : null}
              {GROUP_ORDER.map((group) => {
                const groupHits = hits.filter((hit) => HIT_GROUP[hit.type] === group);
                if (groupHits.length === 0) return null;
                return (
                  <Fragment key={group}>
                    <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase text-secondary">
                      {GROUP_LABELS[group]}
                    </p>
                    {groupHits.map((hit) => (
                      <ComboboxOption
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-primary data-focus:bg-container-inset-hover"
                        key={`${hit.type}:${hit.id}`}
                        value={[hit]}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{hit.title}</span>
                          <span className="block truncate text-xs text-secondary">
                            {hit.subtitle}
                          </span>
                        </span>
                      </ComboboxOption>
                    ))}
                  </Fragment>
                );
              })}
            </ComboboxOptions>
          ) : null}
        </Combobox>
      </Modal>
    </>
  );
}
