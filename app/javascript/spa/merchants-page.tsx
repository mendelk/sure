// eslint-disable import/max-dependencies -- Merchants page composes the family/provider/unlinked tables, the merchant form modal, the merge dialog, and the enhance banner.
import { DialogTitle } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { SearchablePicker } from "./components/searchable-picker";
import { TablePaginationBar } from "./components/table";
import { Icon } from "./icon";
import { Modal } from "./modal";
import type { MerchantId } from "./ids";
import {
  MerchantsApiError,
  createMerchantRecord,
  destroyMerchantRecord,
  enhanceProviderMerchants,
  invalidateMerchantQueries,
  mergeCandidatesQueryOptions,
  merchantsIndexQueryOptions,
  performMerchantMerge,
  updateMerchantRecord,
  type MerchantRow,
  type MerchantsIndex,
  type MerchantsSearch,
} from "./api/merchants";

export const MERCHANTS_INDEX_PATH = "/family_merchants.json";
export const MERCHANTS_PATH = "/family_merchants.json";
export const MERGE_PATH = "/family_merchants/merge.json";
export const PERFORM_MERGE_PATH = "/family_merchants/perform_merge.json";
export const ENHANCE_PATH = "/family_merchants/enhance.json";
export const IMPORT_PATH = "/imports/new?type=MerchantImport";

const MERCHANTS_TEXT = {
  title: "Merchants",
  new_merchant: "New merchant",
  import_merchants: "Import merchants",
  merge_merchants: "Merge merchants",
  family_title: "Family merchants",
  provider_title: "Provider merchants",
  unlinked_title: "Recently unlinked",
  provider_info:
    "These merchants were automatically detected by your bank connections or AI. You can edit them to create your own copy, or remove them to unlink from your transactions.",
  unlinked_info:
    "These merchants were recently removed from your transactions. They will disappear from this list after 30 days unless re-assigned to a transaction.",
  search_family: "Search family merchants...",
  search_provider: "Search provider merchants...",
  no_family_found: "No matching family merchants found",
  no_provider_found: "No matching provider merchants found",
  family_empty: "No family merchants yet",
  provider_empty: "No provider merchants linked to this family yet",
  merchant_column: "Merchant",
  source_column: "Source",
  actions_column: "Actions",
  view_transactions: "View transactions",
  edit: "Edit",
  delete: "Delete",
  remove: "Remove",
  list_unavailable: "Merchant list is unavailable.",
  try_again: "Try again",
  per_page: "per page",
  previous_page: "Previous page",
  next_page: "Next page",
} as const;

const MERCHANT_FORM_TEXT = {
  new_title: "New merchant",
  edit_title: "Edit merchant",
  name_label: "Merchant name",
  name_placeholder: "Merchant name",
  website_label: "Website",
  website_placeholder: "Website (e.g., starbucks.com)",
  color_label: "Color",
  cancel: "Cancel",
  save: "Save",
  create: "Create merchant",
} as const;

const MERCHANT_CONFIRM_TEXT = {
  delete_title: "Delete merchant?",
  delete_body:
    "Are you sure you want to delete this merchant? Removing this merchant will unlink all associated transactions and may effect your reporting.",
  remove_title: "Remove merchant?",
  remove_body:
    "Are you sure you want to remove this merchant? This will unlink all associated transactions from this merchant but will not delete the merchant itself.",
  cancel: "Cancel",
} as const;

const MERGE_TEXT = {
  title: "Merge merchants",
  description:
    "Select a target merchant and the merchants to merge into it. All transactions from merged merchants will be reassigned to the target.",
  target_label: "Merge into (target)",
  target_placeholder: "Select target merchant...",
  sources_label: "Merchants to merge",
  sources_search: "Search merchants...",
  sources_hint:
    "Selected merchants will be merged into the target. Family merchants will be deleted, provider merchants will be unlinked.",
  no_match: "No matching merchants found",
  submit: "Merge selected",
  cancel: "Cancel",
} as const;

function MerchantAvatar({ row }: { row: MerchantRow }) {
  if (row.logo_url !== null && row.logo_url !== "") {
    return (
      <img alt="" className="size-8 shrink-0 rounded-full" loading="lazy" src={row.logo_url} />
    );
  }
  if (row.type === "FamilyMerchant" && row.color !== null) {
    const initial = row.name.trim().charAt(0).toUpperCase() || "?";
    return (
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
        style={{ backgroundColor: row.color }}
      >
        {initial}
      </span>
    );
  }
  const initial = row.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="bg-container-inset text-secondary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium"
    >
      {initial}
    </span>
  );
}

function RowMenu({
  row,
  onEdit,
  onConfirm,
}: {
  row: MerchantRow;
  onEdit: (row: MerchantRow) => void;
  onConfirm: (row: MerchantRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const isProvider = row.type === "ProviderMerchant";
  return (
    <div className="relative inline-block">
      <IconButton
        icon="more-horizontal"
        label={`${row.name} menu`}
        onClick={() => {
          setOpen((value) => !value);
        }}
      />
      {open ? (
        <div
          className="shadow-border-lg absolute right-0 z-30 mt-2 min-w-52 rounded-lg bg-container py-1"
          role="menu"
        >
          <a
            className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
            href={row.transactions_href}
            onClick={() => {
              setOpen(false);
            }}
            role="menuitem"
          >
            {MERCHANTS_TEXT.view_transactions}
          </a>
          <button
            className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
            onClick={() => {
              setOpen(false);
              onEdit(row);
            }}
            role="menuitem"
            type="button"
          >
            {MERCHANTS_TEXT.edit}
          </button>
          <button
            className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
            onClick={() => {
              setOpen(false);
              onConfirm(row);
            }}
            role="menuitem"
            type="button"
          >
            {isProvider ? MERCHANTS_TEXT.remove : MERCHANTS_TEXT.delete}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MerchantTable({
  heading,
  count,
  columns,
  rows,
  onEdit,
  onConfirm,
}: {
  heading: string;
  count: number;
  columns: ("merchant" | "source")[];
  rows: MerchantRow[];
  onEdit: (row: MerchantRow) => void;
  onConfirm: (row: MerchantRow) => void;
}) {
  return (
    <div className="rounded-xl bg-container-inset space-y-1 p-1">
      <div className="bg-container rounded-lg shadow-border-xs overflow-x-auto">
        <table className="w-full">
          <caption className="sr-only">
            {heading} ({count})
          </caption>
          <thead>
            <tr className="text-xs uppercase font-medium text-secondary border-b border-divider">
              <th className="text-left py-3 px-4" scope="col">
                {MERCHANTS_TEXT.merchant_column}
              </th>
              {columns.includes("source") ? (
                <th className="text-left py-3 px-4" scope="col">
                  {MERCHANTS_TEXT.source_column}
                </th>
              ) : null}
              <th className="text-right py-3 px-4" scope="col">
                {MERCHANTS_TEXT.actions_column}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-subdued last:border-0" key={row.id}>
                <td className="py-3 px-4 text-sm text-primary">
                  <div className="flex w-full items-center gap-2.5">
                    <MerchantAvatar row={row} />
                    <p className="font-medium truncate">{row.name}</p>
                  </div>
                </td>
                {columns.includes("source") ? (
                  <td className="py-3 px-4 text-sm text-secondary align-middle">
                    {row.source ?? ""}
                  </td>
                ) : null}
                <td className="py-3 px-4 text-sm text-right align-middle">
                  <RowMenu onConfirm={onConfirm} onEdit={onEdit} row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MerchantSection({
  heading,
  count,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  children,
  emptyState,
  noResults,
  hasQuery,
  pagination,
}: {
  heading: string;
  count: number;
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  children: React.ReactNode;
  emptyState: React.ReactNode;
  noResults: string;
  hasQuery: boolean;
  hasRows: boolean;
  pagination?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-secondary uppercase">
        <p>{heading}</p>
        <span className="text-subdued">&middot;</span>
        <p>{count}</p>
      </div>
      {count === 0 ? (
        emptyState
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2" name="search" size="sm" />
            <input
              aria-label={searchPlaceholder}
              className="form-field__input pl-10"
              onChange={(event) => {
                onSearchChange(event.target.value);
              }}
              placeholder={searchPlaceholder}
              type="search"
              value={searchValue}
            />
          </div>
          {children}
          {pagination}
          {!hasQuery ? null : <output className="sr-only">{noResults}</output>}
        </div>
      )}
    </section>
  );
}

export function MerchantFormModal({
  colors,
  initial,
  isProvider,
  onClose,
  onSaved,
}: {
  colors: string[];
  initial: { id?: MerchantId; name: string; color: string | null; website_url: string | null };
  isProvider: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color ?? colors.at(0) ?? "#4da568");
  const [websiteUrl, setWebsiteUrl] = useState(initial.website_url ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const editing = initial.id !== undefined;

  async function save() {
    setSaving(true);
    setErrors([]);
    try {
      const trimmedWebsite = websiteUrl.trim();
      const input = {
        name: name.trim(),
        ...(isProvider ? {} : { color }),
        website_url: trimmedWebsite === "" ? null : trimmedWebsite,
      };
      if (editing && initial.id !== undefined) {
        await updateMerchantRecord(
          `/family_merchants/${initial.id}.json`,
          isProvider ? "provider_merchant" : "family_merchant",
          input,
        );
      } else await createMerchantRecord(MERCHANTS_PATH, input);
      onSaved();
      onClose();
    } catch (caught) {
      if (caught instanceof MerchantsApiError) setErrors(caught.errors);
      else setErrors(["Could not save merchant"]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      ariaLabelledby="merchant-form-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary" id="merchant-form-title">
        {editing ? MERCHANT_FORM_TEXT.edit_title : MERCHANT_FORM_TEXT.new_title}
      </DialogTitle>
      <div className="mt-4 space-y-4">
        {errors.length > 0 ? (
          <Alert live="alert" variant="error">
            <ul className="list-disc pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {isProvider ? null : (
          <fieldset>
            <legend className="form-field__label">{MERCHANT_FORM_TEXT.color_label}</legend>
            <div className="flex gap-2 items-center justify-center">
              {colors.map((option) => (
                <label aria-label={`Color ${option}`} className="relative" key={option}>
                  <input
                    checked={color === option}
                    className="sr-only peer"
                    name="merchant-color"
                    onChange={() => {
                      setColor(option);
                    }}
                    type="radio"
                    value={option}
                  />
                  <span
                    aria-hidden="true"
                    className="block w-6 h-6 rounded-full cursor-pointer peer-checked:ring-2 peer-checked:ring-offset-2 peer-checked:ring-blue-500"
                    style={{ backgroundColor: option }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <FormField
          id="merchant-name"
          label={MERCHANT_FORM_TEXT.name_label}
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder={MERCHANT_FORM_TEXT.name_placeholder}
          required
          value={name}
        />
        <FormField
          id="merchant-website"
          label={MERCHANT_FORM_TEXT.website_label}
          onChange={(event) => {
            setWebsiteUrl(event.target.value);
          }}
          placeholder={MERCHANT_FORM_TEXT.website_placeholder}
          value={websiteUrl}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            {MERCHANT_FORM_TEXT.cancel}
          </Button>
          <Button
            disabled={saving || name.trim() === ""}
            onClick={() => {
              void save();
            }}
            variant="primary"
          >
            {editing ? MERCHANT_FORM_TEXT.save : MERCHANT_FORM_TEXT.create}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteConfirmModal({
  row,
  onClose,
  onDeleted,
}: {
  row: MerchantRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isProvider = row.type === "ProviderMerchant";

  async function confirm() {
    setDeleting(true);
    setError(null);
    try {
      await destroyMerchantRecord(`/family_merchants/${row.id}.json`);
      onDeleted();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete merchant");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      ariaLabelledby="merchant-confirm-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary" id="merchant-confirm-title">
        {isProvider ? MERCHANT_CONFIRM_TEXT.remove_title : MERCHANT_CONFIRM_TEXT.delete_title}
      </DialogTitle>
      <p className="my-4 text-sm text-secondary">
        {isProvider ? MERCHANT_CONFIRM_TEXT.remove_body : MERCHANT_CONFIRM_TEXT.delete_body}
      </p>
      {error !== null ? (
        <Alert live="alert" variant="error">
          {error}
        </Alert>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose} variant="secondary">
          {MERCHANT_CONFIRM_TEXT.cancel}
        </Button>
        <Button
          disabled={deleting}
          onClick={() => {
            void confirm();
          }}
          variant="destructive"
        >
          {isProvider ? MERCHANTS_TEXT.remove : MERCHANTS_TEXT.delete}
        </Button>
      </div>
    </Modal>
  );
}

function MergeDialog({ onClose, onMerged }: { onClose: () => void; onMerged: () => void }) {
  const query = useQuery(mergeCandidatesQueryOptions(MERGE_PATH));
  const [targetId, setTargetId] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => performMerchantMerge(PERFORM_MERGE_PATH, targetId, Object.keys(selected)),
    onSuccess: () => {
      onMerged();
      onClose();
    },
    onError: (caught) => {
      setError(caught instanceof Error ? caught.message : "Could not merge merchants");
    },
  });

  const candidates = query.data?.merchants ?? [];
  const queryText = search.trim().toLowerCase();
  const filtered = candidates.filter((merchant) => merchant.name.toLowerCase().includes(queryText));
  const options = filtered.map((merchant) => ({
    value: merchant.id,
    label: merchant.name,
    content: (
      <>
        <MerchantAvatar row={merchant} />
        <span className="truncate">{merchant.name}</span>
        {merchant.type === "ProviderMerchant" && merchant.source !== null ? (
          <span className="text-xs text-subdued">({merchant.source})</span>
        ) : null}
      </>
    ),
  }));

  return (
    <Modal
      ariaLabelledby="merchant-merge-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-lg rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary" id="merchant-merge-title">
        {MERGE_TEXT.title}
      </DialogTitle>
      <p className="mt-1 text-sm text-secondary">{MERGE_TEXT.description}</p>
      <div className="mt-4 space-y-4">
        {error !== null ? (
          <Alert live="alert" variant="error">
            {error}
          </Alert>
        ) : null}
        {query.isError ? (
          <Alert live="alert" variant="error">
            {"Merge candidates are unavailable."}
          </Alert>
        ) : null}
        <SearchablePicker
          label={MERGE_TEXT.target_label}
          onQueryChange={setSearch}
          onSelect={(value) => {
            setTargetId(value);
            return true;
          }}
          options={options}
          query={search}
          searchLabel={MERGE_TEXT.target_placeholder}
          selectedValues={targetId === "" ? [] : [targetId]}
          trigger={
            targetId === "" ? (
              <span className="text-sm text-secondary">{MERGE_TEXT.target_placeholder}</span>
            ) : (
              <span className="truncate text-sm text-primary">
                {candidates.find((candidate) => candidate.id === targetId)?.name ?? targetId}
              </span>
            )
          }
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">{MERGE_TEXT.sources_label}</p>
          <div className="max-h-64 overflow-y-auto space-y-1 border border-secondary rounded-lg p-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-secondary px-2 py-1">{MERGE_TEXT.no_match}</p>
            ) : (
              filtered.map((merchant) => (
                <label
                  className="flex items-center gap-2 p-2 hover:bg-surface-hover rounded-sm cursor-pointer"
                  key={merchant.id}
                >
                  <input
                    checked={Object.hasOwn(selected, merchant.id)}
                    className="rounded-sm border-secondary"
                    onChange={(event) => {
                      const id: string = merchant.id;
                      setSelected((previous) => {
                        if (event.target.checked) return { ...previous, [id]: true as const };
                        const { [id]: _removed, ...rest } = previous;
                        return rest;
                      });
                    }}
                    type="checkbox"
                    value={merchant.id}
                  />
                  <MerchantAvatar row={merchant} />
                  <span className="text-sm text-primary">{merchant.name}</span>
                  {merchant.type === "ProviderMerchant" && merchant.source !== null ? (
                    <span className="text-xs text-subdued">({merchant.source})</span>
                  ) : null}
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-subdued">{MERGE_TEXT.sources_hint}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            {MERGE_TEXT.cancel}
          </Button>
          <Button
            disabled={mutation.isPending || targetId === "" || Object.keys(selected).length === 0}
            onClick={() => {
              mutation.mutate();
            }}
            variant="primary"
          >
            {MERGE_TEXT.submit}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EnhanceBanner({
  enhance,
  onChanged,
}: {
  enhance: MerchantsIndex["enhance"];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => enhanceProviderMerchants(ENHANCE_PATH),
    onSuccess: () => {
      onChanged();
    },
    onError: (caught) => {
      setError(caught instanceof Error ? caught.message : "Could not start enhancement");
    },
  });
  if (enhance.eligible_count <= 0 || !enhance.llm_available) return null;
  return (
    <div className="flex items-center justify-between p-4 bg-container-inset border border-secondary rounded-lg">
      <div className="flex items-start gap-2">
        <Icon className="w-5 h-5 text-link mt-0.5 shrink-0" name="sparkles" />
        <p className="text-xs/relaxed text-secondary">
          {`${enhance.eligible_count} provider merchant${enhance.eligible_count === 1 ? " is" : "s are"} missing website information. Enhance with AI to detect websites, display logos, and merge duplicate merchants.`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {error !== null ? (
          <Alert live="alert" variant="error">
            {error}
          </Alert>
        ) : null}
        <Button
          disabled={mutation.isPending}
          onClick={() => {
            mutation.mutate();
          }}
          size="sm"
          variant="secondary"
        >
          Enhance with AI
        </Button>
      </div>
    </div>
  );
}

export function MerchantsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState<MerchantsSearch>({});
  const [formState, setFormState] = useState<
    { mode: "new" } | { mode: "edit"; row: MerchantRow } | null
  >(null);
  const [confirmRow, setConfirmRow] = useState<MerchantRow | null>(null);
  const [merging, setMerging] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const query = useQuery(
    merchantsIndexQueryOptions(MERCHANTS_INDEX_PATH, {
      family_search: search.family_search,
      provider_search: search.provider_search,
      family_page: search.family_page,
      provider_page: search.provider_page,
      per_page: search.per_page,
    }),
  );
  const data = query.data;

  function refresh() {
    void invalidateMerchantQueries(queryClient);
  }

  if (query.isError) {
    return (
      <section aria-labelledby="merchants-title" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-medium text-primary" id="merchants-title">
            {MERCHANTS_TEXT.title}
          </h1>
        </div>
        <Alert live="alert" variant="error">
          <p className="mb-3">{MERCHANTS_TEXT.list_unavailable}</p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
            variant="secondary"
          >
            {MERCHANTS_TEXT.try_again}
          </Button>
        </Alert>
      </section>
    );
  }

  const family = data?.family_merchants;
  const provider = data?.provider_merchants;
  const colors = data?.colors ?? [];

  return (
    <section aria-labelledby="merchants-title" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-medium text-primary" id="merchants-title">
          {MERCHANTS_TEXT.title}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setMerging(true);
            }}
            size="sm"
            variant="secondary"
          >
            {MERCHANTS_TEXT.merge_merchants}
          </Button>
          <a
            className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-container px-3 text-xs font-medium text-primary shadow-border-xs hover:bg-surface-hover"
            href={IMPORT_PATH}
          >
            <Icon name="plus" size="sm" />
            {MERCHANTS_TEXT.import_merchants}
          </a>
          <Button
            onClick={() => {
              setFormState({ mode: "new" });
            }}
            size="sm"
            variant="primary"
          >
            {MERCHANTS_TEXT.new_merchant}
          </Button>
        </div>
      </div>

      {banner !== null ? (
        <Alert live="status" variant="success">
          {banner}
        </Alert>
      ) : null}

      <div className="bg-container rounded-xl shadow-border-xs p-4 space-y-6">
        <MerchantSection
          count={data?.counts.family ?? 0}
          emptyState={
            <div className="flex justify-center items-center py-12">
              <div className="text-center flex flex-col items-center max-w-[300px]">
                <p className="text-primary mb-1 font-medium text-sm">
                  {MERCHANTS_TEXT.family_empty}
                </p>
                <Button
                  onClick={() => {
                    setFormState({ mode: "new" });
                  }}
                  size="sm"
                  variant="secondary"
                >
                  {MERCHANTS_TEXT.new_merchant}
                </Button>
              </div>
            </div>
          }
          hasQuery={(search.family_search ?? "") !== ""}
          hasRows={(family?.items.length ?? 0) > 0}
          heading={MERCHANTS_TEXT.family_title}
          noResults={MERCHANTS_TEXT.no_family_found}
          onSearchChange={(value) => {
            setSearch((previous) => ({ ...previous, family_search: value, family_page: 1 }));
          }}
          pagination={
            family === undefined ? null : (
              <div className="pt-4">
                <TablePaginationBar
                  disabled={query.isFetching}
                  itemCount={family.item_count}
                  labels={{
                    perPage: MERCHANTS_TEXT.per_page,
                    rowsPerPage: MERCHANTS_TEXT.per_page,
                    previous: MERCHANTS_TEXT.previous_page,
                    next: MERCHANTS_TEXT.next_page,
                  }}
                  onPageChange={(page) => {
                    setSearch((previous) => ({ ...previous, family_page: page }));
                  }}
                  onPerPageChange={(per_page) => {
                    setSearch((previous) => ({ ...previous, per_page, family_page: 1 }));
                  }}
                  page={family.page}
                  perPage={family.per_page}
                  totalCount={family.total_count}
                  totalPages={family.total_pages}
                />
              </div>
            )
          }
          searchPlaceholder={MERCHANTS_TEXT.search_family}
          searchValue={search.family_search ?? ""}
        >
          {(family?.items.length ?? 0) === 0 ? (
            (search.family_search ?? "") !== "" ? (
              <div className="flex justify-center items-center py-8">
                <p className="text-secondary text-sm">{MERCHANTS_TEXT.no_family_found}</p>
              </div>
            ) : null
          ) : (
            <MerchantTable
              columns={["merchant"]}
              count={data?.counts.family ?? 0}
              heading={MERCHANTS_TEXT.family_title}
              onConfirm={setConfirmRow}
              onEdit={(row) => {
                setFormState({ mode: "edit", row });
              }}
              rows={family?.items ?? []}
            />
          )}
        </MerchantSection>

        <section className="space-y-3">
          <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-secondary uppercase">
            <p>{MERCHANTS_TEXT.provider_title}</p>
            <span className="text-subdued">&middot;</span>
            <p>{data?.counts.provider ?? 0}</p>
          </div>
          <div className="p-4 bg-container-inset border border-secondary rounded-lg">
            <div className="flex items-start gap-2">
              <Icon className="w-5 h-5 text-link mt-0.5 shrink-0" name="store" />
              <p className="text-xs/relaxed text-secondary">{MERCHANTS_TEXT.provider_info}</p>
            </div>
          </div>
          {data === undefined ? null : (
            <EnhanceBanner
              enhance={data.enhance}
              onChanged={() => {
                setBanner("Provider merchant enhancement started.");
                refresh();
              }}
            />
          )}
          {(data?.counts.provider ?? 0) === 0 ? (
            <div className="flex justify-center items-center py-8">
              <p className="text-secondary text-sm text-center">{MERCHANTS_TEXT.provider_empty}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Icon
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  name="search"
                  size="sm"
                />
                <input
                  aria-label={MERCHANTS_TEXT.search_provider}
                  className="form-field__input pl-10"
                  onChange={(event) => {
                    setSearch((previous) => ({
                      ...previous,
                      provider_search: event.target.value,
                      provider_page: 1,
                    }));
                  }}
                  placeholder={MERCHANTS_TEXT.search_provider}
                  type="search"
                  value={search.provider_search ?? ""}
                />
              </div>
              {(provider?.items.length ?? 0) === 0 ? (
                (search.provider_search ?? "") !== "" ? (
                  <div className="flex justify-center items-center py-8">
                    <p className="text-secondary text-sm">{MERCHANTS_TEXT.no_provider_found}</p>
                  </div>
                ) : null
              ) : (
                <MerchantTable
                  columns={["merchant", "source"]}
                  count={data?.counts.provider ?? 0}
                  heading={MERCHANTS_TEXT.provider_title}
                  onConfirm={setConfirmRow}
                  onEdit={(row) => {
                    setFormState({ mode: "edit", row });
                  }}
                  rows={provider?.items ?? []}
                />
              )}
              {provider === undefined ? null : (
                <div className="pt-4">
                  <TablePaginationBar
                    disabled={query.isFetching}
                    itemCount={provider.item_count}
                    labels={{
                      perPage: MERCHANTS_TEXT.per_page,
                      rowsPerPage: MERCHANTS_TEXT.per_page,
                      previous: MERCHANTS_TEXT.previous_page,
                      next: MERCHANTS_TEXT.next_page,
                    }}
                    onPageChange={(page) => {
                      setSearch((previous) => ({ ...previous, provider_page: page }));
                    }}
                    onPerPageChange={(per_page) => {
                      setSearch((previous) => ({ ...previous, per_page, provider_page: 1 }));
                    }}
                    page={provider.page}
                    perPage={provider.per_page}
                    totalCount={provider.total_count}
                    totalPages={provider.total_pages}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {(data?.counts.unlinked ?? 0) === 0 ? null : (
          <section className="space-y-3">
            <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-secondary uppercase">
              <p>{MERCHANTS_TEXT.unlinked_title}</p>
              <span className="text-subdued">&middot;</span>
              <p>{data?.counts.unlinked ?? 0}</p>
            </div>
            <div className="p-4 bg-container-inset border border-secondary rounded-lg">
              <div className="flex items-start gap-2">
                <Icon className="w-5 h-5 text-subdued mt-0.5 shrink-0" name="store" />
                <p className="text-xs/relaxed text-secondary">{MERCHANTS_TEXT.unlinked_info}</p>
              </div>
            </div>
            <MerchantTable
              columns={["merchant", "source"]}
              count={data?.counts.unlinked ?? 0}
              heading={MERCHANTS_TEXT.unlinked_title}
              onConfirm={setConfirmRow}
              onEdit={(row) => {
                setFormState({ mode: "edit", row });
              }}
              rows={data?.unlinked ?? []}
            />
          </section>
        )}
      </div>

      {formState === null ? null : (
        <MerchantFormModal
          colors={colors}
          initial={
            formState.mode === "new"
              ? { name: "", color: colors[0] ?? null, website_url: null }
              : {
                  id: formState.row.id,
                  name: formState.row.name,
                  color: formState.row.color,
                  website_url: null,
                }
          }
          isProvider={formState.mode === "edit" && formState.row.type === "ProviderMerchant"}
          onClose={() => {
            setFormState(null);
          }}
          onSaved={() => {
            refresh();
          }}
        />
      )}
      {confirmRow === null ? null : (
        <DeleteConfirmModal
          onClose={() => {
            setConfirmRow(null);
          }}
          onDeleted={() => {
            refresh();
          }}
          row={confirmRow}
        />
      )}
      {merging ? (
        <MergeDialog
          onClose={() => {
            setMerging(false);
          }}
          onMerged={() => {
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}
