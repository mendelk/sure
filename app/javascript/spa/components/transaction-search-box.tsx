import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { useRef, useState } from "react";
import { Icon } from "../icon";
import { useSearchShortcut } from "../use-search-shortcut";
import type { AccountId, CategoryId, MerchantId, TagId } from "../ids";
import type { ReferenceOption } from "../api/transactions";

export type SearchFilters = {
  search?: string;
  start_date?: string;
  end_date?: string;
  amount?: number;
  amount_operator?: "equal" | "greater" | "less";
  types?: ("income" | "expense" | "transfer")[];
  status?: ("pending" | "confirmed")[];
  uncategorized?: boolean;
  accounts?: string[];
  account_ids?: AccountId[];
  categories?: string[];
  merchants?: string[];
  tags?: string[];
  excluded_categories?: string[];
  excluded_merchants?: string[];
  excluded_tags?: string[];
  excluded_accounts?: string[];
  excluded_account_ids?: AccountId[];
  excluded_types?: ("income" | "expense" | "transfer")[];
  excluded_status?: ("pending" | "confirmed")[];
};

type SlackFilterDefinition =
  | {
      key: string;
      kind: "options";
      label: string;
      positiveKey: "accounts" | "categories" | "merchants" | "tags" | "types" | "status" | null;
      excludedKey:
        | "excluded_accounts"
        | "excluded_categories"
        | "excluded_merchants"
        | "excluded_tags"
        | "excluded_types"
        | "excluded_status"
        | null;
      options: { label: string; value: string }[];
    }
  | {
      key: string;
      kind: "branch";
      label: string;
      options: { key: string; label: string }[];
    }
  | {
      key: string;
      kind: "value";
      label: string;
      valueKey: "start_date" | "end_date" | "amount-equal" | "amount-greater" | "amount-less";
    };

type SlackTerm = {
  key: string;
  negated: boolean;
  query: string;
  start: number;
};

function filterDefinitions({
  accounts,
  categories,
  merchants,
  tags,
}: {
  accounts?: ReferenceOption<AccountId>[];
  categories: ReferenceOption<CategoryId>[];
  merchants?: ReferenceOption<MerchantId>[];
  tags: ReferenceOption<TagId>[];
}): SlackFilterDefinition[] {
  const definitions: SlackFilterDefinition[] = [];

  if (accounts !== undefined && accounts.length > 0) {
    definitions.push({
      excludedKey: "excluded_accounts",
      key: "account",
      kind: "options",
      label: "Account",
      options: accounts.map((account) => ({
        label: account.name,
        value: account.name,
      })),
      positiveKey: "accounts",
    });
  }

  definitions.push(
    {
      key: "date",
      kind: "branch",
      label: "Date",
      options: [
        { key: "start-date", label: "Start date" },
        { key: "end-date", label: "End date" },
      ],
    },
    {
      excludedKey: "excluded_types",
      key: "type",
      kind: "options",
      label: "Type",
      options: [
        { label: "Income", value: "income" },
        { label: "Expenses", value: "expense" },
        { label: "Transfers", value: "transfer" },
      ],
      positiveKey: "types",
    },
    {
      excludedKey: "excluded_status",
      key: "status",
      kind: "options",
      label: "Status",
      options: [
        { label: "Confirmed", value: "confirmed" },
        { label: "Pending", value: "pending" },
      ],
      positiveKey: "status",
    },
    {
      key: "amount",
      kind: "branch",
      label: "Amount",
      options: [
        { key: "amount-equal", label: "Amount equal to" },
        { key: "amount-greater", label: "Amount greater than" },
        { key: "amount-less", label: "Amount less than" },
      ],
    },
    {
      excludedKey: "excluded_categories",
      key: "category",
      kind: "options",
      label: "Category",
      options: [
        { label: "Uncategorized", value: "Uncategorized" },
        ...categories.map((category) => ({
          label: category.name,
          value: category.name,
        })),
      ],
      positiveKey: "categories",
    },
    {
      excludedKey: "excluded_tags",
      key: "tag",
      kind: "options",
      label: "Tag",
      options: [
        { label: "Untagged", value: "Untagged" },
        ...tags.map((tag) => ({ label: tag.name, value: tag.name })),
      ],
      positiveKey: "tags",
    },
  );

  if (merchants !== undefined && merchants.length > 0) {
    definitions.push({
      excludedKey: "excluded_merchants",
      key: "merchant",
      kind: "options",
      label: "Merchant",
      options: [
        { label: "No merchant", value: "No merchant" },
        ...merchants.map((merchant) => ({
          label: merchant.name,
          value: merchant.name,
        })),
      ],
      positiveKey: "merchants",
    });
  }

  definitions.push(
    {
      key: "start-date",
      kind: "value",
      label: "Start date",
      valueKey: "start_date",
    },
    { key: "end-date", kind: "value", label: "End date", valueKey: "end_date" },
    {
      key: "amount-equal",
      kind: "value",
      label: "Amount equal to",
      valueKey: "amount-equal",
    },
    {
      key: "amount-greater",
      kind: "value",
      label: "Amount greater than",
      valueKey: "amount-greater",
    },
    {
      key: "amount-less",
      kind: "value",
      label: "Amount less than",
      valueKey: "amount-less",
    },
  );

  return definitions;
}

function currentTerm(text: string): SlackTerm | null {
  const match: RegExpExecArray | null = /(^|\s)(-?)([a-z-]+):([^:]*)$/iu.exec(text);
  if (match === null) return null;
  const leading = match[1] as string | undefined;
  const negated = match[2] as string | undefined;
  const rawKey = match[3] as string | undefined;
  const rawQuery = match[4] as string | undefined;
  return {
    key: (rawKey ?? "").toLowerCase(),
    negated: negated === "-",
    query: rawQuery ?? "",
    start: match.index + (leading ?? "").length,
  };
}

function findFilter(
  definitions: SlackFilterDefinition[],
  key: string,
): SlackFilterDefinition | null {
  for (const definition of definitions) {
    if (definition.key === key) return definition;
    if (definition.kind === "branch") {
      const child = definition.options.find((option) => option.key === key);
      if (child !== undefined) {
        const leaf = definitions.find((entry) => entry.key === child.key);
        if (leaf !== undefined) return leaf;
      }
    }
  }
  return null;
}

function optionsFor(
  definition: SlackFilterDefinition,
  query: string,
  routeSearch: SearchFilters,
): { key?: string; label: string; value: string }[] {
  const needle = query.trim().toLowerCase();
  if (definition.kind === "branch") {
    return definition.options
      .filter((option) => option.label.toLowerCase().includes(needle))
      .map((option) => ({
        key: option.key,
        label: option.label,
        value: option.label,
      }));
  }
  if (definition.kind === "value") {
    const value = query.trim();
    return value.length > 0 ? [{ label: value, value }] : [];
  }
  const selected = new Set<string>();
  const positiveValues =
    definition.positiveKey === null ? [] : (routeSearch[definition.positiveKey] ?? []);
  for (const value of positiveValues) {
    selected.add(value);
    if (value === "__uncategorized__") selected.add("Uncategorized");
    if (value === "Uncategorized") selected.add("__uncategorized__");
    if (value === "__no_merchant__") selected.add("No merchant");
    if (value === "No merchant") selected.add("__no_merchant__");
    if (value === "__untagged__") selected.add("Untagged");
    if (value === "Untagged") selected.add("__untagged__");
  }
  const excludedValues =
    definition.excludedKey === null ? [] : (routeSearch[definition.excludedKey] ?? []);
  for (const value of excludedValues) {
    selected.add(value);
    if (value === "__uncategorized__") selected.add("Uncategorized");
    if (value === "Uncategorized") selected.add("__uncategorized__");
    if (value === "__no_merchant__") selected.add("No merchant");
    if (value === "No merchant") selected.add("__no_merchant__");
    if (value === "__untagged__") selected.add("Untagged");
    if (value === "Untagged") selected.add("__untagged__");
  }
  return definition.options
    .filter((option) => !selected.has(option.value))
    .filter((option) => option.label.toLowerCase().includes(needle))
    .slice(0, 30);
}

function applyValueFilter(
  definition: Extract<SlackFilterDefinition, { kind: "value" }>,
  value: string,
  updateSearch: (changes: Partial<SearchFilters>) => void,
) {
  const trimmed = value.trim();
  if (definition.valueKey === "start_date" || definition.valueKey === "end_date") {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return;
    updateSearch(
      definition.valueKey === "start_date" ? { start_date: trimmed } : { end_date: trimmed },
    );
    return;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return;
  if (definition.valueKey === "amount-equal")
    updateSearch({ amount: parsed, amount_operator: "equal" });
  if (definition.valueKey === "amount-greater")
    updateSearch({ amount: parsed, amount_operator: "greater" });
  if (definition.valueKey === "amount-less")
    updateSearch({ amount: parsed, amount_operator: "less" });
}

function formatFilterToken(value: string): string {
  if (value === "__uncategorized__") return "Uncategorized";
  if (value === "__no_merchant__") return "No merchant";
  if (value === "__untagged__") return "Untagged";
  return value;
}

function selectedTokens(routeSearch: SearchFilters): {
  displayValue: string;
  inputKey: string;
  label: string;
  remove: (updateSearch: (changes: Partial<SearchFilters>) => void) => void;
  value: string;
}[] {
  const tokens: {
    displayValue: string;
    inputKey: string;
    label: string;
    remove: (updateSearch: (changes: Partial<SearchFilters>) => void) => void;
    value: string;
  }[] = [];

  function pushOptions(
    values: readonly string[] | undefined,
    label: string,
    inputKey: string,
    remove: (value: string) => Partial<SearchFilters>,
  ) {
    for (const value of values ?? []) {
      tokens.push({
        displayValue: formatFilterToken(value),
        inputKey,
        label,
        remove: (updateSearch) => {
          updateSearch(remove(value));
        },
        value,
      });
    }
  }

  pushOptions(routeSearch.accounts, "Account", "accounts", (value) => ({
    accounts: (routeSearch.accounts ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.categories, "Category", "categories", (value) => ({
    categories: (routeSearch.categories ?? []).filter((item) => item !== value),
    ...(value === "Uncategorized" ? { uncategorized: undefined } : {}),
  }));
  pushOptions(routeSearch.merchants, "Merchant", "merchants", (value) => ({
    merchants: (routeSearch.merchants ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.tags, "Tag", "tags", (value) => ({
    tags: (routeSearch.tags ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.types, "Type", "types", (value) => ({
    types: (routeSearch.types ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.status, "Status", "status", (value) => ({
    status: (routeSearch.status ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_categories, "-Category", "excluded_categories", (value) => ({
    excluded_categories: (routeSearch.excluded_categories ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_merchants, "-Merchant", "excluded_merchants", (value) => ({
    excluded_merchants: (routeSearch.excluded_merchants ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_tags, "-Tag", "excluded_tags", (value) => ({
    excluded_tags: (routeSearch.excluded_tags ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_accounts, "-Account", "excluded_accounts", (value) => ({
    excluded_accounts: (routeSearch.excluded_accounts ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_types, "-Type", "excluded_types", (value) => ({
    excluded_types: (routeSearch.excluded_types ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_status, "-Status", "excluded_status", (value) => ({
    excluded_status: (routeSearch.excluded_status ?? []).filter((item) => item !== value),
  }));

  if (
    routeSearch.uncategorized === true &&
    routeSearch.categories?.includes("Uncategorized") !== true
  ) {
    tokens.push({
      displayValue: "Uncategorized",
      inputKey: "uncategorized",
      label: "Category",
      remove: (updateSearch) => {
        updateSearch({ uncategorized: undefined });
      },
      value: "Uncategorized",
    });
  }

  if (routeSearch.start_date !== undefined) {
    tokens.push({
      displayValue: routeSearch.start_date,
      inputKey: "start_date",
      label: "Start date",
      remove: (updateSearch) => {
        updateSearch({ start_date: undefined });
      },
      value: routeSearch.start_date,
    });
  }
  if (routeSearch.end_date !== undefined) {
    tokens.push({
      displayValue: routeSearch.end_date,
      inputKey: "end_date",
      label: "End date",
      remove: (updateSearch) => {
        updateSearch({ end_date: undefined });
      },
      value: routeSearch.end_date,
    });
  }
  if (routeSearch.amount !== undefined) {
    const operator = routeSearch.amount_operator ?? "equal";
    const label =
      operator === "greater"
        ? "Amount greater than"
        : operator === "less"
          ? "Amount less than"
          : "Amount equal to";
    tokens.push({
      displayValue: String(routeSearch.amount),
      inputKey: "amount",
      label,
      remove: (updateSearch) => {
        updateSearch({ amount: undefined, amount_operator: undefined });
      },
      value: String(routeSearch.amount),
    });
  }

  return tokens;
}

export function TransactionSearchBox({
  accounts,
  categories,
  merchants,
  routeSearch,
  tags,
  updateSearch,
  placeholder,
}: {
  accounts?: ReferenceOption<AccountId>[];
  categories: ReferenceOption<CategoryId>[];
  merchants?: ReferenceOption<MerchantId>[];
  routeSearch: SearchFilters;
  tags: ReferenceOption<TagId>[];
  updateSearch: (changes: Partial<SearchFilters>) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(routeSearch.search ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(inputRef);
  const tokens = selectedTokens(routeSearch);
  const searchParam = routeSearch.search ?? "";
  const [committedSearch, setCommittedSearch] = useState(searchParam);
  if (searchParam !== committedSearch) {
    setCommittedSearch(searchParam);
    setText(searchParam);
  }

  const term = currentTerm(text);
  const definitions = filterDefinitions({
    accounts,
    categories,
    merchants,
    tags,
  });
  const definition = term === null ? null : findFilter(definitions, term.key);
  const options =
    term === null || definition === null || (term.negated && definition.kind !== "options")
      ? []
      : optionsFor(definition, term.query, routeSearch);

  function choose(option: { key?: string; label: string; value: string } | null) {
    if (option === null || definition === null || term === null) return;
    if (definition.kind === "branch") {
      if (option.key !== undefined) setText(`${text.slice(0, term.start)}${option.key}:`);
      return;
    }
    if (definition.kind === "options") {
      if (term.negated && definition.excludedKey !== null) {
        const current = routeSearch[definition.excludedKey] ?? [];
        if (!current.includes(option.value)) {
          updateSearch({
            [definition.excludedKey]: [...current, option.value],
          });
        }
      } else if (definition.positiveKey !== null) {
        const current = routeSearch[definition.positiveKey] ?? [];
        if (!current.includes(option.value)) {
          updateSearch({
            [definition.positiveKey]: [...current, option.value],
          });
        }
      }
    } else applyValueFilter(definition, option.value, updateSearch);
    setText("");
  }

  function submitFreeText() {
    const search = text.trim();
    if (search.length === 0 && routeSearch.search !== undefined)
      updateSearch({ search: undefined });
    else if (search.length > 0 && search !== routeSearch.search) updateSearch({ search });
  }

  return (
    <Combobox immediate onChange={choose} value={null}>
      <div className="relative min-w-0 flex-1">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-secondary bg-container px-3 py-1.5 focus-ring">
          <Icon className="shrink-0 text-secondary" name="search" size="sm" />
          {tokens.map((token) => (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-container-inset px-2 py-0.5 text-xs font-medium text-primary"
              key={`${token.inputKey}:${token.value}`}
            >
              <span>
                {token.label}: {token.displayValue}
              </span>
              <button
                aria-label={`Remove filter ${token.label}: ${token.displayValue}`}
                className="text-secondary hover:text-primary"
                onClick={() => {
                  token.remove(updateSearch);
                }}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          <ComboboxInput
            autoComplete="off"
            className="form-field__input min-w-40 flex-1 placeholder:text-sm placeholder:text-secondary"
            displayValue={() => text}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && options.length === 0) {
                event.preventDefault();
                submitFreeText();
              } else if (event.key === "Backspace" && text.length === 0 && tokens.length > 0) {
                event.preventDefault();
                tokens.at(-1)?.remove(updateSearch);
              }
            }}
            placeholder={
              tokens.length > 0
                ? ""
                : (placeholder ?? "Search or filter... (category:, -tag:, amount-greater:...)")
            }
            ref={inputRef}
          />
        </div>
        {options.length > 0 && term !== null && definition !== null ? (
          <ComboboxOptions
            className="absolute inset-x-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-secondary bg-container p-1.5 shadow-lg"
            static
          >
            {options.map((option) => (
              <ComboboxOption
                className={({ focus }) =>
                  `flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-surface-hover ${
                    focus ? "bg-surface-hover" : ""
                  }`
                }
                key={`${definition.key}:${option.value}`}
                value={option}
              >
                {option.label}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        ) : null}
      </div>
    </Combobox>
  );
}
