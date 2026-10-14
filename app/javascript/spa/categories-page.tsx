// eslint-disable import/max-dependencies -- Categories settings composes the grouped list, form dialog, delete/replace dialog, merge dialog, and confirm actions.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bootstrapCategories,
  CATEGORIES_INDEX_PATH,
  categoriesIndexQueryOptions,
  CategoriesApiError,
  createCategoryRecord,
  deleteCategoryWithReplacement,
  destroyAllCategories,
  destroyCategoryRecord,
  fetchEditCategoryForm,
  fetchNewCategoryForm,
  invalidateCategoryQueries,
  performCategoryMerge,
  updateCategoryRecord,
  type CategoriesIndex,
  type CategoryForm,
  type CategoryId,
  type CategoryMutationInput,
  type CategoryRow,
} from "./api/categories";
import { CategoryIdSchema } from "./ids";
import { CategoryIcon, Icon } from "./icon";
import { Alert } from "./components/alert";
import { Button, MenuItem } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { SearchablePicker, type PickerOption } from "./components/searchable-picker";
import { Modal } from "./modal";

// Inline English parity strings (ERB renders translated labels server-side;
// the SPA ships English copies the way accounts-index ROW_TEXT does).
const CATEGORIES_TEXT = {
  title: "Categories",
  count: "categories",
  merge: "Merge categories",
  deleteAll: "Delete all",
  deleteAllTitle: "Delete all categories?",
  deleteAllBody:
    "This deletes every category. Transactions stay but become uncategorized. This cannot be undone.",
  deleteAllConfirm: "Delete all",
  newCategory: "New category",
  editCategory: "Edit category",
  empty: "No categories found",
  bootstrap: "Use defaults (recommended)",
  bootstrapShort: "Use defaults",
  retry: "Try again",
  unavailable: "Category list is unavailable.",
  delete: "Delete",
  edit: "Edit",
  cancel: "Cancel",
  save: "Save",
  create: "Create",
  saving: "Saving…",
  merging: "Merging…",
  deleting: "Deleting…",
  mergeTitle: "Merge categories",
  mergeDescription:
    "Select a target category and the categories to merge into it. Matching transactions and budget lines will move to the target.",
  mergeTargetLabel: "Merge into (target)",
  mergeTargetPlaceholder: "Select target category...",
  mergeSourcesLabel: "Categories to merge",
  mergeSourcesHint:
    "Selected categories will be deleted after their transactions and budget lines move to the target. Do not select the target as a source.",
  mergeSubmit: "Merge selected",
  targetAsSourceError: "Choose different categories for the target and sources.",
  targetRequiredError: "Select a target category.",
  sourcesRequiredError: "Select at least one category to merge.",
  deleteTitle: "Delete category?",
  replacementLabel: "Category",
  replacementPlaceholder: "Select category",
  replacementSearch: "Search categories",
  formNameLabel: "Name",
  formNamePlaceholder: "Category name",
  formParentLabel: "Parent category (optional)",
  formParentPlaceholder: "(unassigned)",
  formColorLabel: "Color",
  formIconLabel: "Icon",
  formCustomColor: "Custom color",
  formPoorContrast: "Poor contrast, choose a darker color or",
  formAutoAdjust: "auto-adjust.",
} as const;

function parseCategoryId(value: string): CategoryId | null {
  const parsed = CategoryIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function errorMessages(error: unknown, fallback: string): string[] {
  if (error instanceof CategoriesApiError && error.errors.length > 0) return error.errors;
  if (error instanceof Error && error.message.length > 0) return [error.message];
  return [fallback];
}

/* ---------- color helpers (parity with color_icon_picker_controller.js) ---------- */

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-fA-F]{6})$/u.exec(hex.trim());
  const value = match?.[1] ?? "";
  if (value.length !== 6) return null;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mixChannel(channel: number, percentage: number): number {
  return Math.round(channel * (percentage / 100) + 255 * (1 - percentage / 100));
}

function mixWithWhite(
  [r, g, b]: [number, number, number],
  percentage: number,
): [number, number, number] {
  return [mixChannel(r, percentage), mixChannel(g, percentage), mixChannel(b, percentage)];
}

function toLinearChannel(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * toLinearChannel(r) + 0.7152 * toLinearChannel(g) + 0.0722 * toLinearChannel(b);
}

function contrastRatio(
  foreground: [number, number, number],
  background: [number, number, number],
): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].toSorted(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function poorContrast(color: string): boolean {
  const rgb = hexToRgb(color);
  if (!rgb) return false;
  return contrastRatio(rgb, mixWithWhite(rgb, 10)) < 4.5;
}
function toHexChannel(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

function darkenHex(color: string): string {
  const rgb = hexToRgb(color) ?? [100, 100, 100];
  let [r, g, b] = rgb;
  const background = mixWithWhite([r, g, b], 10);
  let ratio = contrastRatio([r, g, b], background);
  while (ratio < 4.5 && (r > 0 || g > 0 || b > 0)) {
    r = Math.max(0, r - 10);
    g = Math.max(0, g - 10);
    b = Math.max(0, b - 10);
    ratio = contrastRatio([r, g, b], background);
  }
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

function CategoryBadge({ row }: { row: CategoryRow }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={row.display_name}>
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: `color-mix(in oklab, ${row.color} 10%, transparent)`,
          color: row.color,
        }}
      >
        <CategoryIcon className="size-3.5 shrink-0" name={row.lucide_icon} />
      </span>
      <span
        className="min-w-0 truncate text-sm font-medium text-primary"
        data-testid="category-name"
      >
        {row.display_name}
      </span>
    </span>
  );
}

function RowMenu({
  hasTransactions,
  onDelete,
  onEdit,
  row,
}: {
  hasTransactions: boolean;
  onDelete: (row: CategoryRow) => void;
  onEdit: (row: CategoryRow) => void;
  row: CategoryRow;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconButton
        icon="more-horizontal"
        label={`${row.display_name} menu`}
        onClick={() => {
          setOpen((value) => !value);
        }}
        size="sm"
      />
      {open ? (
        <div
          className="shadow-border-lg absolute right-0 z-30 mt-2 min-w-44 rounded-lg bg-container py-1"
          role="menu"
        >
          <MenuItem
            onClick={() => {
              setOpen(false);
              onEdit(row);
            }}
          >
            {CATEGORIES_TEXT.edit}
          </MenuItem>
          <MenuItem
            data-testid={hasTransactions ? "category-delete-replace" : "category-delete-direct"}
            destructive
            onClick={() => {
              setOpen(false);
              onDelete(row);
            }}
          >
            {CATEGORIES_TEXT.delete}
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function CategoryListRow({
  hasTransactions,
  onDelete,
  onEdit,
  row,
  sub,
}: {
  hasTransactions: boolean;
  onDelete: (row: CategoryRow) => void;
  onEdit: (row: CategoryRow) => void;
  row: CategoryRow;
  sub: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-container px-4 pb-4" id={`category_${row.id}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5" data-testid="category-content">
        {sub ? (
          <span style={{ color: row.color }}>
            <Icon name="corner-down-right" size="sm" />
          </span>
        ) : null}
        <CategoryBadge row={row} />
      </div>
      <div className="shrink-0" data-testid="category-actions">
        <RowMenu hasTransactions={hasTransactions} onDelete={onDelete} onEdit={onEdit} row={row} />
      </div>
    </div>
  );
}

type FormDialogState = { mode: "new" } | { mode: "edit"; id: CategoryId };

function CategoryFormDialog({
  initial,
  onClose,
  onSaved,
  state,
}: {
  initial: CategoryForm;
  onClose: () => void;
  onSaved: () => void;
  state: FormDialogState;
}) {
  const [name, setName] = useState(initial.category.name);
  const [color, setColor] = useState(initial.category.color);
  const [customColor, setCustomColor] = useState(
    initial.colors.includes(initial.category.color) ? "" : initial.category.color,
  );
  const [icon, setIcon] = useState(initial.category.lucide_icon);
  const [iconQuery, setIconQuery] = useState("");
  const [parentId, setParentId] = useState(initial.category.parent_id ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isParent = initial.category.is_parent;
  const showParentSelect = !isParent && initial.parent_options.length > 0;
  // Parity with _form.html.erb: the color section hides once a parent is
  // picked (subcategories inherit the parent's color via before_save).
  const showColorSection = parentId === "";
  const effectiveColor = showColorSection ? color : initial.category.color;
  const contrastWarning = showColorSection && poorContrast(color);
  const lowerIconQuery = iconQuery.trim().toLowerCase();
  const visibleIcons =
    lowerIconQuery.length === 0
      ? initial.icons
      : initial.icons.filter((code) => code.toLowerCase().includes(lowerIconQuery));

  function handleSubmit(event: { preventDefault: () => void }): void {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors([]);
    const input: CategoryMutationInput = {
      color: effectiveColor,
      lucide_icon: icon,
      name: name.trim(),
      parent_id: showParentSelect ? (parseCategoryId(parentId) ?? "") : "",
    };
    const save =
      state.mode === "new" ? createCategoryRecord(input) : updateCategoryRecord(state.id, input);
    save
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((error: unknown) => {
        setErrors(errorMessages(error, "Save failed"));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <Modal
      ariaLabelledby="category-form-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 className="text-lg font-medium text-primary" id="category-form-title">
        {state.mode === "new" ? CATEGORIES_TEXT.newCategory : CATEGORIES_TEXT.editCategory}
      </h2>
      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <div className="mx-auto w-fit">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              backgroundColor: `color-mix(in oklab, ${effectiveColor} 10%, transparent)`,
              color: effectiveColor,
            }}
          >
            <CategoryIcon className="size-8 shrink-0" name={icon} />
          </span>
        </div>
        {errors.length > 0 ? (
          <Alert live="alert" variant="error">
            <ul className="list-disc space-y-0.5 pl-5">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <FormField
          error={undefined}
          id="category-name"
          label={CATEGORIES_TEXT.formNameLabel}
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder={CATEGORIES_TEXT.formNamePlaceholder}
          required
          value={name}
        />
        {showParentSelect ? (
          <FormField
            as="select"
            id="category-parent"
            label={CATEGORIES_TEXT.formParentLabel}
            onChange={(event) => {
              const next = event.target.value;
              setParentId(next);
              if (next !== "") setErrors([]);
            }}
            value={parentId}
          >
            <option value="">{CATEGORIES_TEXT.formParentPlaceholder}</option>
            {initial.parent_options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.display_name}
              </option>
            ))}
          </FormField>
        ) : null}
        {showColorSection ? (
          <fieldset>
            <legend className="form-field__label">{CATEGORIES_TEXT.formColorLabel}</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {initial.colors.map((preset) => (
                <label key={preset} className="relative">
                  <input
                    checked={color === preset && customColor === ""}
                    className="peer sr-only"
                    name="category-color"
                    onChange={() => {
                      setColor(preset);
                      setCustomColor("");
                    }}
                    type="radio"
                    value={preset}
                  />
                  <span
                    aria-hidden="true"
                    className="block size-6 cursor-pointer rounded-full peer-checked:ring-2 peer-checked:ring-gray-500 peer-checked:ring-offset-2"
                    style={{ backgroundColor: preset }}
                  />
                  <span className="sr-only">{preset}</span>
                </label>
              ))}
              <label className="relative flex items-center gap-2">
                <input
                  aria-label={CATEGORIES_TEXT.formCustomColor}
                  className="form-field__input w-24"
                  onChange={(event) => {
                    const next = event.target.value;
                    setCustomColor(next);
                    if (/^#[0-9a-fA-F]{6}$/u.test(next)) setColor(next);
                  }}
                  pattern="^#[0-9A-Fa-f]{6}$"
                  placeholder="#000000"
                  value={customColor}
                />
                <input
                  aria-label={CATEGORIES_TEXT.formCustomColor}
                  className="h-6 w-8 cursor-pointer"
                  onChange={(event) => {
                    setColor(event.target.value);
                    setCustomColor(event.target.value);
                  }}
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/u.test(color) ? color : "#6471eb"}
                />
              </label>
            </div>
            {contrastWarning ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-destructive" role="alert">
                <span>{CATEGORIES_TEXT.formPoorContrast}</span>
                <Button
                  className="cursor-pointer underline focus:ring-0 disabled:cursor-auto disabled:opacity-100"
                  onClick={() => {
                    const adjusted = darkenHex(color);
                    setColor(adjusted);
                    setCustomColor(adjusted);
                  }}
                  size="xs"
                  variant="link"
                >
                  {CATEGORIES_TEXT.formAutoAdjust}
                </Button>
              </p>
            ) : null}
          </fieldset>
        ) : null}
        <div>
          <p className="form-field__label" id="category-icon-label">
            {CATEGORIES_TEXT.formIconLabel}
          </p>
          <input
            aria-label="Search icons"
            className="form-field__input mt-2"
            onChange={(event) => {
              setIconQuery(event.target.value);
            }}
            placeholder="Search icons"
            type="search"
            value={iconQuery}
          />
          <div
            aria-labelledby="category-icon-label"
            className="mt-2 grid max-h-44 grid-cols-8 gap-1 overflow-y-auto"
            role="radiogroup"
          >
            {visibleIcons.map((code) => (
              <label key={code} className="relative" title={code}>
                <input
                  checked={icon === code}
                  className="peer sr-only"
                  name="category-icon"
                  onChange={() => {
                    setIcon(code);
                  }}
                  type="radio"
                  value={code}
                />
                <span
                  aria-hidden="true"
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full text-secondary hover:bg-container-inset-hover peer-checked:bg-container-inset"
                  style={
                    icon === code
                      ? {
                          backgroundColor: `color-mix(in oklab, ${effectiveColor} 10%, transparent)`,
                          color: effectiveColor,
                        }
                      : undefined
                  }
                >
                  <CategoryIcon className="size-4 shrink-0" name={code} />
                </span>
                <span className="sr-only">{code}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="secondary">
            {CATEGORIES_TEXT.cancel}
          </Button>
          <Button disabled={saving || name.trim().length === 0} type="submit">
            {saving
              ? CATEGORIES_TEXT.saving
              : state.mode === "new"
                ? CATEGORIES_TEXT.create
                : CATEGORIES_TEXT.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function FormDialogLoader({
  onClose,
  onSaved,
  state,
}: {
  onClose: () => void;
  onSaved: () => void;
  state: FormDialogState;
}) {
  const mode = state.mode;
  const editId = state.mode === "edit" ? state.id : null;
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load =
      mode === "new" || editId === null ? fetchNewCategoryForm() : fetchEditCategoryForm(editId);
    load
      .then((payload) => {
        if (cancelled) return;
        setForm(payload);
        setError(null);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Form is unavailable");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId, mode]);

  if (loading) {
    return (
      <Modal
        ariaLabelledby="category-form-title"
        onClose={onClose}
        open
        panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
      >
        <h2 className="text-lg font-medium text-primary" id="category-form-title">
          {state.mode === "new" ? CATEGORIES_TEXT.newCategory : CATEGORIES_TEXT.editCategory}
        </h2>
        <p className="mt-4 text-sm text-secondary">Loading…</p>
      </Modal>
    );
  }

  if (form === null || error !== null) {
    return (
      <Modal
        ariaLabelledby="category-form-title"
        onClose={onClose}
        open
        panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
      >
        <h2 className="text-lg font-medium text-primary" id="category-form-title">
          {state.mode === "new" ? CATEGORIES_TEXT.newCategory : CATEGORIES_TEXT.editCategory}
        </h2>
        <div className="mt-4">
          <Alert live="alert" variant="error">
            {error ?? "Form is unavailable"}
          </Alert>
          <div className="mt-4 flex justify-end">
            <Button onClick={onClose} variant="secondary">
              {CATEGORIES_TEXT.cancel}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return <CategoryFormDialog initial={form} onClose={onClose} onSaved={onSaved} state={state} />;
}
export function DeleteDialog({
  data,
  onClose,
  onDeleted,
  row,
}: {
  data: CategoriesIndex;
  onClose: () => void;
  onDeleted: () => void;
  row: CategoryRow;
}) {
  const queryClient = useQueryClient();
  const [replacementId, setReplacementId] = useState("");
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const allRows = data.groups.flatMap((group) => [group.root, ...group.subcategories]);
  const candidates = allRows.filter((candidate) => candidate.id !== row.id);
  const lowerQuery = query.trim().toLowerCase();
  const options: PickerOption[] = candidates
    .filter((candidate) => candidate.display_name_with_parent.toLowerCase().includes(lowerQuery))
    .map((candidate) => ({ label: candidate.display_name_with_parent, value: candidate.id }));
  const selected = candidates.find((candidate) => candidate.id === replacementId);

  function handleDelete(): void {
    if (deleting) return;
    setDeleting(true);
    setErrors([]);
    const replacement = replacementId === "" ? null : (parseCategoryId(replacementId) ?? null);
    if (replacementId !== "" && replacement === null) {
      setErrors(["Select a valid replacement category"]);
      setDeleting(false);
      return;
    }
    deleteCategoryWithReplacement(row.id, replacement)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["spa", "reference"] });
        onDeleted();
        onClose();
      })
      .catch((error: unknown) => {
        setErrors(errorMessages(error, "Delete failed"));
      })
      .finally(() => {
        setDeleting(false);
      });
  }

  return (
    <Modal
      ariaLabelledby="category-delete-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 className="text-lg font-medium text-primary" id="category-delete-title">
        {CATEGORIES_TEXT.deleteTitle}
      </h2>
      <p className="mt-2 text-sm text-secondary">
        By deleting this category, every transaction that has the &ldquo;{row.display_name}&rdquo;
        category will be uncategorized. Instead of leaving them uncategorized, you can also assign a
        new category below.
      </p>
      <div className="mt-4 space-y-4">
        {errors.length > 0 ? (
          <Alert live="alert" variant="error">
            <ul className="list-disc space-y-0.5 pl-5">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <SearchablePicker
          label={CATEGORIES_TEXT.replacementLabel}
          onQueryChange={setQuery}
          onSelect={(value) => {
            setReplacementId(value);
            return true;
          }}
          options={options}
          query={query}
          searchLabel={CATEGORIES_TEXT.replacementSearch}
          selectedValues={replacementId === "" ? [] : [replacementId]}
          trigger={
            selected ? (
              <span className="text-sm text-primary">{selected.display_name_with_parent}</span>
            ) : (
              <span className="text-sm text-secondary">
                {CATEGORIES_TEXT.replacementPlaceholder}
              </span>
            )
          }
        />
        <Button
          disabled={deleting}
          fullWidth
          onClick={handleDelete}
          variant={replacementId === "" ? "destructive" : "primary"}
        >
          {deleting
            ? CATEGORIES_TEXT.deleting
            : replacementId === ""
              ? `Delete "${row.display_name}" and leave uncategorized`
              : `Delete "${row.display_name}" and assign new category`}
        </Button>
        <Button disabled={deleting} fullWidth onClick={onClose} variant="secondary">
          {CATEGORIES_TEXT.cancel}
        </Button>
      </div>
    </Modal>
  );
}

export function MergeDialog({
  data,
  onClose,
  onMerged,
}: {
  data: CategoriesIndex;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [targetQuery, setTargetQuery] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);

  const allRows = data.groups.flatMap((group) => [group.root, ...group.subcategories]);
  const lowerTargetQuery = targetQuery.trim().toLowerCase();
  const targetOptions: PickerOption[] = allRows
    .filter((row) => row.display_name_with_parent.toLowerCase().includes(lowerTargetQuery))
    .map((row) => ({ label: row.display_name_with_parent, value: row.id }));
  const selectedTarget = allRows.find((row) => row.id === targetId);
  const lowerSourceQuery = sourceQuery.trim().toLowerCase();
  const visibleSources = allRows.filter((row) =>
    row.display_name_with_parent.toLowerCase().includes(lowerSourceQuery),
  );

  function toggleSource(id: string, checked: boolean): void {
    setSelectedSources((previous) =>
      checked ? [...previous, id] : previous.filter((source) => source !== id),
    );
  }

  function handleMerge(event: { preventDefault: () => void }): void {
    event.preventDefault();
    if (merging) return;
    // Client-side mirror of the perform_merge guards so the dialog explains
    // the rejection without a round trip; the server re-validates regardless.
    if (targetId === "") {
      setErrors([CATEGORIES_TEXT.targetRequiredError]);
      return;
    }
    if (selectedSources.length === 0) {
      setErrors([CATEGORIES_TEXT.sourcesRequiredError]);
      return;
    }
    if (selectedSources.includes(targetId)) {
      setErrors([CATEGORIES_TEXT.targetAsSourceError]);
      return;
    }
    const target = parseCategoryId(targetId);
    const sources = selectedSources
      .map((id) => parseCategoryId(id))
      .filter((id): id is CategoryId => id !== null);
    if (target === null || sources.length !== selectedSources.length) {
      setErrors(["Invalid categories selected"]);
      return;
    }
    setMerging(true);
    setErrors([]);
    performCategoryMerge(target, sources)
      .then(() => {
        onMerged();
        onClose();
      })
      .catch((error: unknown) => {
        setErrors(errorMessages(error, "Merge failed"));
      })
      .finally(() => {
        setMerging(false);
      });
  }

  return (
    <Modal
      ariaLabelledby="category-merge-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-lg rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 className="text-lg font-medium text-primary" id="category-merge-title">
        {CATEGORIES_TEXT.mergeTitle}
      </h2>
      <p className="mt-1 text-sm text-secondary">{CATEGORIES_TEXT.mergeDescription}</p>
      <form className="mt-4 space-y-4" onSubmit={handleMerge}>
        {errors.length > 0 ? (
          <Alert live="alert" variant="error">
            <ul className="list-disc space-y-0.5 pl-5">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <SearchablePicker
          label={CATEGORIES_TEXT.mergeTargetLabel}
          onQueryChange={setTargetQuery}
          onSelect={(value) => {
            setTargetId(value);
            return true;
          }}
          options={targetOptions}
          query={targetQuery}
          searchLabel={CATEGORIES_TEXT.mergeTargetPlaceholder}
          selectedValues={targetId === "" ? [] : [targetId]}
          trigger={
            selectedTarget ? (
              <span className="text-sm text-primary">
                {selectedTarget.display_name_with_parent}
              </span>
            ) : (
              <span className="text-sm text-secondary">
                {CATEGORIES_TEXT.mergeTargetPlaceholder}
              </span>
            )
          }
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">{CATEGORIES_TEXT.mergeSourcesLabel}</p>
          <input
            aria-label="Search categories to merge"
            className="form-field__input"
            onChange={(event) => {
              setSourceQuery(event.target.value);
            }}
            placeholder="Search categories"
            type="search"
            value={sourceQuery}
          />
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-secondary p-2">
            {visibleSources.map((row) => {
              const checked = selectedSources.includes(row.id);
              return (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-sm p-2 hover:bg-surface-hover"
                  key={row.id}
                >
                  <input
                    checked={checked}
                    className="rounded-sm border-secondary"
                    onChange={(event) => {
                      toggleSource(row.id, event.target.checked);
                    }}
                    type="checkbox"
                    value={row.id}
                  />
                  <span className="text-sm text-primary">{row.display_name_with_parent}</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-subdued">{CATEGORIES_TEXT.mergeSourcesHint}</p>
        </div>
        <Button disabled={merging} fullWidth type="submit">
          {merging ? CATEGORIES_TEXT.merging : CATEGORIES_TEXT.mergeSubmit}
        </Button>
      </form>
    </Modal>
  );
}

function ConfirmDeleteAllDialog({
  count,
  onCancel,
  onConfirm,
  pending,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Modal
      ariaLabelledby="category-delete-all-title"
      onClose={onCancel}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 className="text-lg font-medium text-primary" id="category-delete-all-title">
        {CATEGORIES_TEXT.deleteAllTitle}
      </h2>
      <p className="my-4 text-sm text-secondary">
        {CATEGORIES_TEXT.deleteAllBody} ({count} {CATEGORIES_TEXT.count})
      </p>
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onCancel} variant="secondary">
          {CATEGORIES_TEXT.cancel}
        </Button>
        <Button disabled={pending} onClick={onConfirm} variant="destructive">
          {pending ? CATEGORIES_TEXT.deleting : CATEGORIES_TEXT.deleteAllConfirm}
        </Button>
      </div>
    </Modal>
  );
}

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const query = useQuery(categoriesIndexQueryOptions(CATEGORIES_INDEX_PATH));
  const [formState, setFormState] = useState<FormDialogState | null>(null);
  const [deleteRow, setDeleteRow] = useState<CategoryRow | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [actionErrors, setActionErrors] = useState<string[]>([]);
  const [actionPending, setActionPending] = useState<"bootstrap" | "delete-all" | null>(null);

  const data = query.data;

  function refresh(): void {
    void invalidateCategoryQueries(queryClient).then(() =>
      queryClient.invalidateQueries({ queryKey: ["spa", "reference"] }),
    );
  }

  function handleDirectDelete(row: CategoryRow): void {
    setActionErrors([]);
    destroyCategoryRecord(row.id)
      .then(() => {
        refresh();
      })
      .catch((error: unknown) => {
        setActionErrors(errorMessages(error, "Delete failed"));
      });
  }

  function handleDeleteAll(): void {
    setActionPending("delete-all");
    setActionErrors([]);
    destroyAllCategories()
      .then(() => {
        setConfirmDeleteAll(false);
        refresh();
      })
      .catch((error: unknown) => {
        setActionErrors(errorMessages(error, "Delete failed"));
      })
      .finally(() => {
        setActionPending(null);
      });
  }

  function handleBootstrap(): void {
    setActionPending("bootstrap");
    setActionErrors([]);
    bootstrapCategories()
      .then(() => {
        refresh();
      })
      .catch((error: unknown) => {
        setActionErrors(errorMessages(error, "Could not create default categories"));
      })
      .finally(() => {
        setActionPending(null);
      });
  }

  if (query.isError) {
    return (
      <section aria-labelledby="categories-title" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-medium text-primary" id="categories-title">
            {CATEGORIES_TEXT.title}
          </h1>
        </div>
        <Alert live="alert" variant="error">
          <p className="mb-3">{CATEGORIES_TEXT.unavailable}</p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
            variant="secondary"
          >
            {CATEGORIES_TEXT.retry}
          </Button>
        </Alert>
      </section>
    );
  }

  const empty = data !== undefined && (data.empty || data.groups.length === 0);
  const count = data?.count ?? 0;

  return (
    <section aria-labelledby="categories-title" className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-medium text-primary" id="categories-title">
          {CATEGORIES_TEXT.title}
        </h1>
        {data !== undefined && !empty ? (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setMergeOpen(true);
              }}
              variant="secondary"
            >
              {CATEGORIES_TEXT.merge}
            </Button>
            <Button
              onClick={() => {
                setConfirmDeleteAll(true);
              }}
              variant="secondary"
            >
              {CATEGORIES_TEXT.deleteAll}
            </Button>
            <Button
              onClick={() => {
                setFormState({ mode: "new" });
              }}
            >
              {CATEGORIES_TEXT.newCategory}
            </Button>
          </div>
        ) : null}
      </div>

      {actionErrors.length > 0 ? (
        <Alert live="alert" variant="error">
          <ul className="list-disc space-y-0.5 pl-5">
            {actionErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {formState !== null ? (
        <FormDialogLoader
          key={formState.mode === "new" ? "new" : `edit:${formState.id}`}
          onClose={() => {
            setFormState(null);
          }}
          onSaved={() => {
            refresh();
          }}
          state={formState}
        />
      ) : null}

      {deleteRow !== null && data !== undefined ? (
        <DeleteDialog
          data={data}
          onClose={() => {
            setDeleteRow(null);
          }}
          onDeleted={() => {
            refresh();
          }}
          row={deleteRow}
        />
      ) : null}

      {mergeOpen && data !== undefined ? (
        <MergeDialog
          data={data}
          onClose={() => {
            setMergeOpen(false);
          }}
          onMerged={() => {
            refresh();
          }}
        />
      ) : null}

      {confirmDeleteAll ? (
        <ConfirmDeleteAllDialog
          count={count}
          onCancel={() => {
            setConfirmDeleteAll(false);
          }}
          onConfirm={handleDeleteAll}
          pending={actionPending === "delete-all"}
        />
      ) : null}

      {data === undefined ? (
        <div className="rounded-xl bg-container p-4 shadow-border-xs">
          <p className="py-20 text-center text-sm text-secondary">Loading…</p>
        </div>
      ) : empty ? (
        <div className="rounded-xl bg-container p-4 shadow-border-xs">
          <div className="flex items-center justify-center py-20">
            <div className="flex max-w-[500px] flex-col items-center text-center">
              <p className="mb-4 text-sm text-secondary">{CATEGORIES_TEXT.empty}</p>
              <div className="flex items-center gap-2">
                <Button disabled={actionPending === "bootstrap"} onClick={handleBootstrap}>
                  {CATEGORIES_TEXT.bootstrap}
                </Button>
                <Button
                  onClick={() => {
                    setFormState({ mode: "new" });
                  }}
                  variant="secondary"
                >
                  {CATEGORIES_TEXT.newCategory}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl bg-container p-4 shadow-border-xs">
          <div className="space-y-1 rounded-xl bg-container-inset p-1">
            <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium uppercase text-secondary">
              <p>{CATEGORIES_TEXT.title}</p>
              <span className="text-subdued">&middot;</span>
              <p>{count}</p>
            </div>
            <div className="rounded-lg bg-container shadow-border-xs">
              <div className="overflow-hidden rounded-lg">
                {data.groups.map((group, index) => (
                  <div key={group.root.id}>
                    <CategoryListRow
                      hasTransactions={data.has_transactions_by_id[group.root.id] ?? false}
                      onDelete={(row) => {
                        if (data.has_transactions_by_id[row.id] ?? false) setDeleteRow(row);
                        else handleDirectDelete(row);
                      }}
                      onEdit={(row) => {
                        setFormState({ mode: "edit", id: row.id });
                      }}
                      row={group.root}
                      sub={false}
                    />
                    {group.subcategories.map((sub) => (
                      <CategoryListRow
                        hasTransactions={data.has_transactions_by_id[sub.id] ?? false}
                        key={sub.id}
                        onDelete={(row) => {
                          if (data.has_transactions_by_id[row.id] ?? false) setDeleteRow(row);
                          else handleDirectDelete(row);
                        }}
                        onEdit={(row) => {
                          setFormState({ mode: "edit", id: row.id });
                        }}
                        row={sub}
                        sub
                      />
                    ))}
                    {index === data.groups.length - 1 ? null : (
                      <div aria-hidden="true" className="border-t border-subdued" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
