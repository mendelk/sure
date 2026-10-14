// eslint-disable import/max-dependencies -- Tags index composes the list, new/edit form dialogs, delete confirmations, and the replacement dialog.
import { DialogTitle } from "@headlessui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  TAGS_INDEX_PATH,
  TagsApiError,
  deleteTagRequest,
  deleteTagWithReplacementRequest,
  invalidateTagQueries,
  saveTagRequest,
  tagsIndexQueryOptions,
  type TagRow,
} from "./api/tags";
import { TagIdSchema, type TagId } from "./ids";
import { Alert } from "./components/alert";
import { Button, MenuItem } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Modal } from "./modal";

// English parity strings for the tags settings page (ERB t(".") keys).
const TAGS_TEXT = {
  tags: "Tags",
  new: "New tag",
  new_title: "New tag",
  edit_title: "Edit tag",
  edit: "Edit",
  delete: "Delete",
  delete_all: "Delete all",
  empty: "No tags yet",
  name_placeholder: "Tag name",
  name_required: "Enter a tag name",
  save: "Save",
  cancel: "Cancel",
  retry: "Try again",
  unavailable: "Tags are unavailable.",
  delete_all_title: "Delete all tags?",
  delete_all_body: "Every tag will be removed from transactions and other tagged entities.",
} as const;

// English parity strings for the delete-with-replacement dialog.
const DELETION_TEXT = {
  title: "Delete tag?",
  replacement_label: "Tag",
  replacement_prompt: "Select tag",
  reassign: "Delete and reassign",
} as const;

function deleteUncategorizedLabel(name: string): string {
  return `Delete "${name}"`;
}

function deleteRecategorizeLabel(name: string): string {
  return `Delete "${name}" and assign new tag`;
}

function deletionExplanation(name: string): string {
  return `${name} will be removed from transactions and other taggable entities. Instead of leaving them untagged, you can also assign a new tag below.`;
}

function TagBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium"
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        color,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

function serverErrors(error: unknown): string[] {
  if (error instanceof TagsApiError)
    return error.errors.length > 0 ? error.errors : [error.message];
  return [error instanceof Error ? error.message : "Request failed"];
}

export function TagFormDialog({
  tag,
  colors,
  onClose,
}: {
  tag: TagRow | null;
  colors: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (input: { name: string; color: string }) =>
      tag === null
        ? saveTagRequest(TAGS_INDEX_PATH, "POST", input)
        : saveTagRequest(`/tags/${tag.id}.json`, "PATCH", input),
    onSuccess: () => {
      void invalidateTagQueries(queryClient).then(onClose);
    },
  });
  const defaultColor = colors.length > 0 ? colors[0] : "#e99537";
  const form = useForm({
    defaultValues: {
      name: tag === null ? "" : tag.name,
      color: tag === null ? defaultColor : tag.color,
    },
    onSubmit: ({ value }) => {
      save.mutate({ name: value.name.trim(), color: value.color });
    },
  });

  return (
    <Modal
      ariaLabelledby="spa-tag-form-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary" id="spa-tag-form-title">
        {tag === null ? TAGS_TEXT.new_title : TAGS_TEXT.edit_title}
      </DialogTitle>
      {save.isError ? (
        <div className="mt-4">
          <Alert live="alert" variant="error">
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-secondary">
              {serverErrors(save.error).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Subscribe
          selector={(state) => ({ color: state.values.color, name: state.values.name })}
        >
          {({ color, name }) => (
            <div className="m-auto mb-4 w-fit">
              <TagBadge color={color} name={name.trim().length > 0 ? name.trim() : "?"} />
            </div>
          )}
        </form.Subscribe>
        <form.Field name="color">
          {(field) => (
            <div className="flex items-center justify-center gap-2" role="radiogroup">
              {colors.map((color) => (
                <label aria-label={`Color ${color}`} className="relative" key={color}>
                  <input
                    checked={field.state.value === color}
                    className="peer sr-only"
                    name="tag-color"
                    onChange={() => {
                      field.handleChange(color);
                    }}
                    type="radio"
                    value={color}
                  />
                  <div
                    className="size-6 cursor-pointer rounded-full peer-checked:ring-2 peer-checked:ring-blue-500 peer-checked:ring-offset-2"
                    style={{ backgroundColor: color }}
                  />
                </label>
              ))}
            </div>
          )}
        </form.Field>
        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) =>
              value.trim().length === 0 ? TAGS_TEXT.name_required : undefined,
          }}
        >
          {(field) => (
            <FormField
              autoComplete="off"
              error={field.state.meta.errors.join(" ")}
              id="spa-tag-name"
              onChange={(event) => {
                field.handleChange(event.currentTarget.value);
              }}
              placeholder={TAGS_TEXT.name_placeholder}
              required
              type="text"
              value={field.state.value}
            />
          )}
        </form.Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            {TAGS_TEXT.cancel}
          </Button>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button disabled={!canSubmit || save.isPending} type="submit">
                {save.isPending ? "Saving…" : TAGS_TEXT.save}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteConfirmDialog({ tag, onClose }: { tag: TagRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const destroy = useMutation({
    mutationFn: () => deleteTagRequest(`/tags/${tag.id}.json`),
    onSuccess: () => {
      void invalidateTagQueries(queryClient).then(onClose);
    },
  });

  return (
    <Modal
      ariaLabelledby="spa-tag-delete-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary" id="spa-tag-delete-title">
        {deleteUncategorizedLabel(tag.name)}
      </DialogTitle>
      {destroy.isError ? (
        <div className="mt-4">
          <Alert live="alert" variant="error">
            {serverErrors(destroy.error).join(" ")}
          </Alert>
        </div>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose} variant="secondary">
          {TAGS_TEXT.cancel}
        </Button>
        <Button
          disabled={destroy.isPending}
          onClick={() => {
            destroy.mutate();
          }}
          variant="destructive"
        >
          {TAGS_TEXT.delete}
        </Button>
      </div>
    </Modal>
  );
}

export function DeleteReplacementDialog({
  tag,
  candidates,
  onClose,
}: {
  tag: TagRow;
  candidates: TagRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [replacementId, setReplacementId] = useState<TagId | "">("");
  const destroy = useMutation({
    mutationFn: () =>
      deleteTagWithReplacementRequest(
        `/tags/${tag.id}/deletions.json`,
        replacementId === "" ? null : replacementId,
      ),
    onSuccess: () => {
      void invalidateTagQueries(queryClient).then(onClose);
    },
  });

  return (
    <Modal
      ariaLabelledby="spa-tag-deletion-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary" id="spa-tag-deletion-title">
        {DELETION_TEXT.title}
      </DialogTitle>
      <p className="mt-2 text-sm text-secondary">{deletionExplanation(tag.name)}</p>
      {destroy.isError ? (
        <div className="mt-4">
          <Alert live="alert" variant="error">
            {serverErrors(destroy.error).join(" ")}
          </Alert>
        </div>
      ) : null}
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          destroy.mutate();
        }}
      >
        <FormField
          as="select"
          id="spa-tag-replacement"
          label={DELETION_TEXT.replacement_label}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setReplacementId(value === "" ? "" : TagIdSchema.parse(value));
          }}
          value={replacementId}
        >
          <option value="">{DELETION_TEXT.replacement_prompt}</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </FormField>
        {/* Mirrors deletion_controller.js: no replacement → destructive
            "Delete <name>"; with replacement → "Delete <name> and assign new tag". */}
        <Button
          disabled={destroy.isPending}
          fullWidth
          type="submit"
          variant={replacementId === "" ? "destructive" : "primary"}
        >
          {replacementId === ""
            ? deleteUncategorizedLabel(tag.name)
            : deleteRecategorizeLabel(tag.name)}
        </Button>
        <p className="-mt-2 text-center text-xs text-secondary">{DELETION_TEXT.reassign}</p>
      </form>
    </Modal>
  );
}

function DeleteAllConfirmDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const destroyAll = useMutation({
    mutationFn: () => deleteTagRequest("/tags/destroy_all.json"),
    onSuccess: () => {
      void invalidateTagQueries(queryClient).then(onClose);
    },
  });

  return (
    <Modal
      ariaLabelledby="spa-tags-delete-all-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary" id="spa-tags-delete-all-title">
        {TAGS_TEXT.delete_all_title}
      </DialogTitle>
      <p className="my-4 text-sm text-secondary">
        {TAGS_TEXT.delete_all_body} ({count})
      </p>
      {destroyAll.isError ? (
        <Alert live="alert" variant="error">
          {serverErrors(destroyAll.error).join(" ")}
        </Alert>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose} variant="secondary">
          {TAGS_TEXT.cancel}
        </Button>
        <Button
          disabled={destroyAll.isPending}
          onClick={() => {
            destroyAll.mutate();
          }}
          variant="destructive"
        >
          {TAGS_TEXT.delete_all}
        </Button>
      </div>
    </Modal>
  );
}

function TagRowMenu({
  tag,
  onEdit,
  onDelete,
}: {
  tag: TagRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconButton
        icon="more-horizontal"
        label={`${tag.name} menu`}
        onClick={() => {
          setOpen((value) => !value);
        }}
      />
      {open ? (
        <div
          className="shadow-border-lg absolute right-0 z-30 mt-2 min-w-52 rounded-lg bg-container py-1"
          role="menu"
        >
          <MenuItem
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            {TAGS_TEXT.edit}
          </MenuItem>
          <MenuItem
            destructive
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            {TAGS_TEXT.delete}
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

export function TagsIndexPage() {
  const query = useQuery(tagsIndexQueryOptions());
  const [formTag, setFormTag] = useState<{ open: boolean; tag: TagRow | null }>({
    open: false,
    tag: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  if (query.isError) {
    return (
      <section className="space-y-4">
        <Alert live="alert" variant="error">
          <p className="mb-3">{TAGS_TEXT.unavailable}</p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
            variant="secondary"
          >
            {TAGS_TEXT.retry}
          </Button>
        </Alert>
      </section>
    );
  }

  const data = query.data;
  const tags = data?.tags ?? [];
  const colors = data?.colors ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-medium text-primary">{TAGS_TEXT.tags}</h1>
        <div className="flex items-center gap-2">
          {tags.length > 0 ? (
            <Button
              iconProps={{ name: "trash-2" }}
              onClick={() => {
                setConfirmDeleteAll(true);
              }}
              variant="secondary"
            >
              {TAGS_TEXT.delete_all}
            </Button>
          ) : null}
          <Button
            iconProps={{ name: "plus" }}
            onClick={() => {
              setFormTag({ open: true, tag: null });
            }}
          >
            {TAGS_TEXT.new}
          </Button>
        </div>
      </div>

      {data === undefined ? (
        <output aria-busy="true" className="block h-40 animate-pulse rounded-xl bg-container" />
      ) : tags.length > 0 ? (
        <div className="rounded-xl bg-container p-4 shadow-border-xs">
          <div className="space-y-1 rounded-xl bg-container-inset p-1">
            <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium uppercase text-secondary">
              <p>{TAGS_TEXT.tags}</p>
              <span className="text-subdued">&middot;</span>
              <p>{tags.length}</p>
            </div>
            <div className="rounded-lg bg-container shadow-border-xs">
              <ul className="divide-y divide-tertiary overflow-hidden rounded-lg">
                {tags.map((tag) => (
                  <li
                    className="flex items-center justify-between bg-container p-4 hover:bg-surface-hover"
                    id={`tag_${tag.id}`}
                    key={tag.id}
                  >
                    <div className="flex w-full items-center gap-2.5">
                      <TagBadge color={tag.color} name={tag.name} />
                    </div>
                    <TagRowMenu
                      onDelete={() => {
                        setDeleteTarget(tag);
                      }}
                      onEdit={() => {
                        setFormTag({ open: true, tag });
                      }}
                      tag={tag}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-xl bg-container py-20 shadow-border-xs">
          <div className="flex max-w-[300px] flex-col items-center text-center">
            <p className="mb-1 text-sm font-medium text-primary">{TAGS_TEXT.empty}</p>
            <Button
              iconProps={{ name: "plus" }}
              onClick={() => {
                setFormTag({ open: true, tag: null });
              }}
              variant="ghost"
            >
              {TAGS_TEXT.new}
            </Button>
          </div>
        </div>
      )}

      {formTag.open ? (
        <TagFormDialog
          colors={colors}
          onClose={() => {
            setFormTag({ open: false, tag: null });
          }}
          tag={formTag.tag}
        />
      ) : null}
      {deleteTarget !== null && deleteTarget.transactions_count === 0 ? (
        <DeleteConfirmDialog
          onClose={() => {
            setDeleteTarget(null);
          }}
          tag={deleteTarget}
        />
      ) : null}
      {deleteTarget !== null && deleteTarget.transactions_count > 0 ? (
        <DeleteReplacementDialog
          candidates={tags.filter((candidate) => candidate.id !== deleteTarget.id)}
          onClose={() => {
            setDeleteTarget(null);
          }}
          tag={deleteTarget}
        />
      ) : null}
      {confirmDeleteAll ? (
        <DeleteAllConfirmDialog
          count={tags.length}
          onClose={() => {
            setConfirmDeleteAll(false);
          }}
        />
      ) : null}
    </section>
  );
}
