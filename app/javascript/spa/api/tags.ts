import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { TagIdSchema, type TagId } from "../ids";
import { readCsrfToken, TransactionApiError } from "./transactions";

export const TagRowSchema = z.object({
  id: TagIdSchema,
  name: z.string(),
  color: z.string(),
  transactions_count: z.number(),
});
export type TagRow = z.infer<typeof TagRowSchema>;

export const TagsIndexSchema = z.object({
  tags: z.array(TagRowSchema),
  colors: z.array(z.string()),
});
export type TagsIndex = z.infer<typeof TagsIndexSchema>;

export const TagFormPayloadSchema = z.object({
  tag: z.object({
    id: z.nullable(TagIdSchema),
    name: z.nullable(z.string()),
    color: z.nullable(z.string()),
  }),
  colors: z.array(z.string()),
});
export type TagFormPayload = z.infer<typeof TagFormPayloadSchema>;

export const TagInputSchema = z.object({
  name: z.string(),
  color: z.string(),
});
export type TagInput = z.infer<typeof TagInputSchema>;

export const TagsApiError = TransactionApiError;

export const TAGS_INDEX_PATH = "/tags.json";

export function tagsIndexQueryOptions(path = TAGS_INDEX_PATH) {
  return queryOptions({
    queryKey: ["spa", "tags-index", path] as const,
    queryFn: async ({ signal }): Promise<TagsIndex> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok) return TagsIndexSchema.parse(payload);
      throw new TagsApiError(
        `Tags request failed with status ${response.status}`,
        response.status,
        extractErrors(payload),
      );
    },
  });
}

export function tagFormQueryOptions(path: string) {
  return queryOptions({
    queryKey: ["spa", "tag-form", path] as const,
    queryFn: async ({ signal }): Promise<TagFormPayload> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok) return TagFormPayloadSchema.parse(payload);
      throw new TagsApiError(
        `Tag request failed with status ${response.status}`,
        response.status,
        extractErrors(payload),
      );
    },
  });
}

// POST for create, PATCH for update — same `tag[name,color]` params the ERB
// form posted, so one controller path serves both.
export async function saveTagRequest(
  path: string,
  method: "POST" | "PATCH",
  input: TagInput,
): Promise<TagRow> {
  const response = await fetch(path, {
    body: JSON.stringify({ tag: input }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    method,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return TagRowSchema.parse(payload);
  throw new TagsApiError(
    `Tag request failed with status ${response.status}`,
    response.status,
    extractErrors(payload),
  );
}

export async function deleteTagRequest(tagPath: string): Promise<void> {
  const response = await fetch(tagPath, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    method: "DELETE",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return;
  throw new TagsApiError(
    `Tag request failed with status ${response.status}`,
    response.status,
    extractErrors(payload),
  );
}

export async function deleteTagWithReplacementRequest(
  deletionsPath: string,
  replacementTagId: TagId | null,
): Promise<void> {
  const response = await fetch(deletionsPath, {
    body: JSON.stringify(replacementTagId === null ? {} : { replacement_tag_id: replacementTagId }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    method: "POST",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return;
  throw new TagsApiError(
    `Tag request failed with status ${response.status}`,
    response.status,
    extractErrors(payload),
  );
}

export async function invalidateTagQueries(queryClient: {
  invalidateQueries: (filters: { queryKey: string[] }) => Promise<void>;
}): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["spa", "tags-index"] });
  await queryClient.invalidateQueries({ queryKey: ["spa", "tag-form"] });
  await queryClient.invalidateQueries({ queryKey: ["spa", "reference"] });
}

function extractErrors(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const errors: unknown = Reflect.get(payload, "errors");
  if (Array.isArray(errors))
    return errors.filter((item): item is string => typeof item === "string");
  return [];
}
