import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createTag, referenceDataQueryOptions, type ReferenceOption } from "../api/transactions";
import type { SpaBootstrap } from "../bootstrap";
import { Icon } from "../icon";
import type { TagId } from "../ids";
import { SearchablePicker, type PickerOption } from "./searchable-picker";

export function TagSelect({
  bootstrap,
  disabled,
  error,
  initialTags,
  onSelect,
  selectedTagIds,
  tags,
  trigger,
  triggerLabel = "Tags",
}: {
  bootstrap: Pick<SpaBootstrap, "apiPaths" | "railsPaths">;
  disabled?: boolean;
  error?: string;
  initialTags?: Array<{ id: TagId; name: string; color?: string }>;
  onSelect: (tagIds: TagId[]) => void | Promise<void>;
  selectedTagIds: TagId[];
  tags?: ReferenceOption<TagId>[];
  trigger?: ReactNode;
  triggerLabel?: string;
}) {
  const queryClient = useQueryClient();
  const [loadTags, setLoadTags] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const reference = useQuery({
    ...referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
    ),
    enabled: tags === undefined && loadTags,
  });
  const availableTags = tags ?? reference.data?.tags ?? [];
  const selectedTags = selectedTagIds.map(
    (id) =>
      availableTags.find((tag) => tag.id === id) ??
      initialTags?.find((tag) => tag.id === id) ?? { id, name: id },
  );
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const filteredTags = availableTags.filter((tag) => tag.name.toLowerCase().includes(lowerQuery));
  const loading = tags === undefined && reference.isPending;
  const referenceError = tags === undefined ? reference.error?.message : undefined;
  const canCreate =
    !loading &&
    referenceError === undefined &&
    trimmedQuery.length > 0 &&
    !availableTags.some((tag) => tag.name.toLowerCase() === lowerQuery);
  const errorMessage = createError ?? referenceError ?? error;

  async function handleCreate() {
    if (isCreating || disabled === true || !canCreate) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const newTag = await createTag(bootstrap.apiPaths.tags, trimmedQuery);
      queryClient.setQueriesData<{ tags: ReferenceOption<TagId>[] }>(
        {
          queryKey: [
            "spa",
            "reference",
            bootstrap.apiPaths.categories,
            bootstrap.apiPaths.merchants,
            bootstrap.apiPaths.tags,
          ],
        },
        (old) =>
          old
            ? {
                ...old,
                tags: [...old.tags, newTag].toSorted((left, right) =>
                  left.name.localeCompare(right.name),
                ),
              }
            : old,
      );
      await onSelect([...selectedTagIds, newTag.id]);
      setQuery("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create tag");
    } finally {
      setIsCreating(false);
    }
  }

  const options: PickerOption[] = filteredTags.map((tag) => ({
    value: tag.id,
    label: tag.name,
    content: <TagPill color={tag.color} name={tag.name} />,
  }));
  if (canCreate) {
    options.push({
      value: "__create",
      label: `Create "${trimmedQuery}"`,
      content: (
        <>
          <Icon name="plus" size="sm" />
          <span>{`Create "${trimmedQuery}"`}</span>
        </>
      ),
    });
  }
  return (
    <SearchablePicker
      disabled={disabled === true || isCreating}
      error={errorMessage}
      inline={trigger !== undefined}
      label={triggerLabel}
      loading={loading}
      multiple
      onOpen={() => {
        setLoadTags(true);
      }}
      onQueryChange={(value) => {
        setQuery(value);
        setCreateError(null);
      }}
      onSelect={(value) => {
        if (value === "__create") {
          void handleCreate();
          return;
        }
        const tag = availableTags.find((candidate) => candidate.id === value);
        if (tag === undefined) return;
        void onSelect(
          selectedTagIds.includes(tag.id)
            ? selectedTagIds.filter((id) => id !== tag.id)
            : [...selectedTagIds, tag.id],
        );
      }}
      options={options}
      query={query}
      searchLabel="Search tags"
      selectedValues={selectedTagIds}
      trigger={
        trigger ??
        (selectedTags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {selectedTags.map((tag) => (
              <TagPill color={tag.color} key={tag.id} name={tag.name} />
            ))}
          </span>
        ) : (
          <span className="text-sm text-secondary">None</span>
        ))
      }
    />
  );
}

function TagPill({ name, color }: { name: string; color?: string }) {
  const customColor =
    typeof color === "string" && color.startsWith("#") ? color : "var(--utility-text-secondary)";
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium leading-none align-middle"
      style={{
        backgroundColor: `color-mix(in oklab, ${customColor} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${customColor} 20%, transparent)`,
        color: customColor,
      }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: customColor }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
