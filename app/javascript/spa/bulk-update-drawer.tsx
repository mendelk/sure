/* eslint-disable import/max-dependencies -- Component composes reference data, form controls, and routing primitives. */
import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useState, type SyntheticEvent } from "react";
import type { SpaBootstrap } from "./bootstrap";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Modal } from "./modal";
import {
  AccountIdSchema,
  type AccountId,
  type CategoryId,
  type MerchantId,
  type TagId,
} from "./ids";
import {
  bulkUpdatePermissionsQueryOptions,
  readCsrfToken,
  referenceDataQueryOptions,
} from "./api/transactions";
import { CategorySelect, MerchantSelect } from "./transaction-detail-page";
import { TagSelect } from "./components/tag-select";

export type BulkUpdateSearch = {
  account_id?: string;
  entry_ids: string[];
};

function parseEntryIds(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (typeof raw === "string" && raw.length > 0) return [raw];
  return [];
}

export function validateBulkUpdateSearch(search: Record<string, unknown>): BulkUpdateSearch {
  const account_id =
    typeof search.account_id === "string" && search.account_id.length > 0
      ? search.account_id
      : undefined;

  let rawEntries =
    search["bulk_update[entry_ids][]"] ?? search["bulk_update[entry_ids]"] ?? search.entry_ids;

  if (
    rawEntries === undefined &&
    typeof search.bulk_update === "object" &&
    search.bulk_update !== null &&
    "entry_ids" in search.bulk_update
  ) {
    const container = search.bulk_update as { entry_ids?: unknown };
    rawEntries = container.entry_ids;
  }

  return { account_id, entry_ids: parseEntryIds(rawEntries) };
}

export function BulkUpdateDrawer({
  entryIds: propEntryIds,
  accountId: propAccountId,
  onClose: propOnClose,
}: {
  entryIds?: string[];
  accountId?: string;
  onClose?: () => void;
} = {}) {
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (context: { bootstrap: SpaBootstrap }) => context.bootstrap,
  });
  const search = useSearch({
    strict: false,
    select: (value: Record<string, unknown>) => validateBulkUpdateSearch(value),
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const text = bootstrap.bulkUpdateText;

  const referenceQuery = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
      bootstrap.apiPaths.accounts,
    ),
  );

  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<CategoryId | "">("");
  const [merchantId, setMerchantId] = useState<MerchantId | "">("");
  const [tagIdsToAdd, setTagIdsToAdd] = useState<TagId[]>([]);
  const [tagIdsToRemove, setTagIdsToRemove] = useState<TagId[]>([]);
  const [notes, setNotes] = useState("");
  const [transferAccountId, setTransferAccountId] = useState<AccountId | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const entryIds = propEntryIds ?? search.entry_ids;
  const permissionQuery = useQuery(
    bulkUpdatePermissionsQueryOptions(bootstrap.railsPaths.bulkUpdate, entryIds),
  );
  const canEdit = permissionQuery.data?.can_edit === true;
  const canAnnotate = permissionQuery.data?.can_annotate === true;

  function close() {
    if (propOnClose) {
      propOnClose();
      return;
    }
    const targetAccountId = propAccountId ?? search.account_id;
    if (targetAccountId !== undefined && targetAccountId.length > 0) {
      void navigate({
        to: "/accounts/$accountId",
        params: { accountId: AccountIdSchema.parse(search.account_id) },
        search: true,
        resetScroll: false,
      });
    } else {
      void navigate({
        to: "/transactions",
        search: true,
        resetScroll: false,
      });
    }
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (entryIds.length === 0 || isSubmitting || !canAnnotate) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formData = new FormData();
      formData.set("authenticity_token", readCsrfToken());

      for (const id of entryIds) formData.append("bulk_update[entry_ids][]", id);

      if (canEdit && date.trim().length > 0) formData.set("bulk_update[date]", date.trim());
      if (canEdit && name.trim().length > 0) formData.set("bulk_update[name]", name.trim());
      if (canEdit && transferAccountId !== "")
        formData.set("bulk_update[transfer_account_id]", transferAccountId);
      if (categoryId !== "") formData.set("bulk_update[category_id]", categoryId);
      if (merchantId !== "") formData.set("bulk_update[merchant_id]", merchantId);
      if (notes.trim().length > 0) formData.set("bulk_update[notes]", notes.trim());
      for (const tagId of tagIdsToAdd) formData.append("bulk_update[tag_ids_to_add][]", tagId);
      for (const tagId of tagIdsToRemove)
        formData.append("bulk_update[tag_ids_to_remove][]", tagId);

      const response = await fetch(bootstrap.railsPaths.bulkUpdate, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        redirect: "manual",
      });

      if (!response.ok) {
        let message = text.update_error;
        if (response.headers.get("content-type")?.includes("application/json") === true) {
          const body: unknown = await response.json();
          if (
            body !== null &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
          )
            message = body.error;
        }
        throw new Error(message);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);

      close();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : text.update_error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const categories = referenceQuery.data !== undefined ? referenceQuery.data.categories : [];
  const merchants = referenceQuery.data !== undefined ? referenceQuery.data.merchants : [];
  const tags = referenceQuery.data !== undefined ? referenceQuery.data.tags : [];
  const sourceAccountIds = permissionQuery.data?.source_account_ids ?? [];
  const transferAccounts = (referenceQuery.data?.accounts ?? []).filter(
    (account) => account.permissions?.can_edit === true && !sourceAccountIds.includes(account.id),
  );

  return (
    <Modal
      onClose={close}
      open
      panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
      placement="drawer"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-medium text-primary">
              {text.header_title}
            </DialogTitle>
            <p className="mt-0.5 text-sm text-secondary">
              {entryIds.length} {entryIds.length === 1 ? "transaction" : "transactions"} selected
            </p>
          </div>
          <IconButton className="shrink-0" icon="x" label={text.cancel} onClick={close} />
        </div>

        {submitError !== null ? (
          <Alert live="alert" variant="error">
            <p>{submitError}</p>
          </Alert>
        ) : null}

        {entryIds.length === 0 ? (
          <Alert live="alert" title="No transactions selected" variant="warning">
            <p>Select transactions on the account activity page to edit them in bulk.</p>
          </Alert>
        ) : null}

        {permissionQuery.isFetching && permissionQuery.data === undefined ? (
          <output className="text-sm text-secondary" aria-live="polite">
            Loading permissions…
          </output>
        ) : permissionQuery.isError ? (
          <Alert live="alert" variant="error">
            {permissionQuery.error.message}
          </Alert>
        ) : permissionQuery.data?.can_annotate === false ? (
          <Alert live="alert" variant="warning">
            You don&apos;t have permission to edit all selected transactions.
          </Alert>
        ) : null}

        {canAnnotate ? (
          <form
            className="flex grow flex-col justify-between gap-6"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <div className="space-y-4">
              {canEdit ? (
                <>
                  <FormField
                    id="bulk-update-date"
                    label={text.date_label}
                    onChange={(e) => {
                      setDate(e.target.value);
                    }}
                    type="date"
                    value={date}
                  />

                  <FormField
                    id="bulk-update-name"
                    label={text.name_label}
                    onChange={(e) => {
                      setName(e.target.value);
                    }}
                    placeholder={text.name_placeholder}
                    type="text"
                    value={name}
                  />
                  <FormField
                    as="select"
                    description={text.transfer_description}
                    disabled={isSubmitting || referenceQuery.isPending}
                    id="bulk-update-transfer-account"
                    label={text.transfer_label}
                    onChange={(event) => {
                      setTransferAccountId(
                        event.target.value === "" ? "" : AccountIdSchema.parse(event.target.value),
                      );
                    }}
                    value={transferAccountId}
                  >
                    <option value="">{text.transfer_unchanged}</option>
                    {transferAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </FormField>
                </>
              ) : null}

              <div className="space-y-1">
                <label
                  className="block text-xs font-medium text-secondary"
                  htmlFor="bulk-update-category"
                >
                  {text.category_label}
                </label>
                <CategorySelect
                  bootstrap={bootstrap}
                  categories={categories}
                  onSelect={(id) => {
                    setCategoryId(id);
                  }}
                  selectedCategoryId={categoryId}
                />
              </div>

              <div className="space-y-1">
                <label
                  className="block text-xs font-medium text-secondary"
                  htmlFor="bulk-update-merchant"
                >
                  {text.merchant_label}
                </label>
                <MerchantSelect
                  bootstrap={bootstrap}
                  merchants={merchants}
                  onSelect={(id) => {
                    setMerchantId(id);
                  }}
                  selectedMerchantId={merchantId}
                />
              </div>

              <fieldset className="space-y-1">
                <legend className="text-xs font-medium text-secondary">
                  {text.tags_to_add_label}
                </legend>
                <TagSelect
                  bootstrap={bootstrap}
                  disabled={isSubmitting || referenceQuery.isPending}
                  onSelect={(ids) => {
                    setTagIdsToAdd(ids);
                    setTagIdsToRemove((current) => current.filter((id) => !ids.includes(id)));
                  }}
                  selectedTagIds={tagIdsToAdd}
                  tags={tags}
                  triggerLabel={text.tags_to_add_label}
                />
              </fieldset>

              <fieldset className="space-y-1">
                <legend className="text-xs font-medium text-secondary">
                  {text.tags_to_remove_label}
                </legend>
                <TagSelect
                  allowCreate={false}
                  bootstrap={bootstrap}
                  disabled={isSubmitting || referenceQuery.isPending}
                  onSelect={(ids) => {
                    setTagIdsToRemove(ids);
                    setTagIdsToAdd((current) => current.filter((id) => !ids.includes(id)));
                  }}
                  selectedTagIds={tagIdsToRemove}
                  tags={tags}
                  triggerLabel={text.tags_to_remove_label}
                />
              </fieldset>

              <FormField
                as="textarea"
                id="bulk-update-notes"
                label={text.notes_label}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
                placeholder={text.notes_placeholder}
                rows={5}
                value={notes}
              />
            </div>

            <div className="mt-auto flex justify-end gap-2 pt-4">
              <Button onClick={close} type="button" variant="ghost">
                {text.cancel}
              </Button>
              <Button
                disabled={isSubmitting || entryIds.length === 0}
                type="submit"
                variant="primary"
              >
                {isSubmitting ? "Saving..." : text.save}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Modal>
  );
}
