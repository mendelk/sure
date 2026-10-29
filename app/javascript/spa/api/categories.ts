import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { CategoryIdSchema, type CategoryId } from "../ids";
import { apiFetch } from "./client";

export const CATEGORIES_INDEX_PATH = "/api/v1/categories?include=workspace";
const NEW_CATEGORY_PATH = "/api/v1/categories/form_options";
const editCategoryPath = (id: CategoryId): string => `/api/v1/categories/form_options?id=${id}`;
const categoryPath = (id: CategoryId): string => `/api/v1/categories/${id}`;
const DESTROY_ALL_PATH = "/api/v1/categories/destroy_all";
const BOOTSTRAP_PATH = "/api/v1/categories/bootstrap";
const PERFORM_MERGE_PATH = "/api/v1/categories/merge";
const deletionPath = (id: CategoryId): string => `/api/v1/categories/${id}/replacement`;

const CategoryRowSchema = z.object({
  id: z.pipe(z.string(), CategoryIdSchema),
  name: z.string(),
  display_name: z.string(),
  display_name_with_parent: z.string(),
  color: z.string(),
  lucide_icon: z.string(),
  parent_id: z.nullable(z.string()),
  has_parent: z.boolean(),
});
export type CategoryRow = z.infer<typeof CategoryRowSchema>;

const CategoryGroupSchema = z.object({
  root: CategoryRowSchema,
  subcategories: z.array(CategoryRowSchema),
});
export type CategoryGroup = z.infer<typeof CategoryGroupSchema>;

export const CategoriesIndexSchema = z.object({
  groups: z.array(CategoryGroupSchema),
  count: z.number(),
  has_transactions_by_id: z.record(z.string(), z.boolean()),
  can_bootstrap: z.boolean(),
  empty: z.boolean(),
  colors: z.array(z.string()),
  icons: z.array(z.string()),
});
export type CategoriesIndex = z.infer<typeof CategoriesIndexSchema>;

const ParentOptionSchema = z.object({
  id: z.pipe(z.string(), CategoryIdSchema),
  display_name: z.string(),
});
export type ParentOption = z.infer<typeof ParentOptionSchema>;

const CategoryFormCategorySchema = z.object({
  id: z.nullable(z.pipe(z.string(), CategoryIdSchema)),
  name: z.nullable(z.string()),
  display_name: z.nullable(z.string()),
  display_name_with_parent: z.nullable(z.string()),
  color: z.string(),
  lucide_icon: z.string(),
  parent_id: z.nullable(z.string()),
  has_parent: z.boolean(),
  is_parent: z.boolean(),
  can_assign_parent: z.boolean(),
});

export const CategoryFormSchema = z.object({
  category: CategoryFormCategorySchema,
  colors: z.array(z.string()),
  icons: z.array(z.string()),
  parent_options: z.array(ParentOptionSchema),
});
export type CategoryForm = z.infer<typeof CategoryFormSchema>;

export type CategoryFormCategory = z.infer<typeof CategoryFormCategorySchema>;

const MergeResultSchema = z.object({
  ok: z.boolean(),
  merged_count: z.optional(z.number()),
});

export class CategoriesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = "CategoriesApiError";
  }
}

function extractApiErrors(payload: unknown, fallback: string): string[] {
  if (typeof payload !== "object" || payload === null) return [fallback];
  const message: unknown = Reflect.get(payload, "message");
  if (typeof message === "string" && message.length > 0) return [message];
  const errors: unknown = Reflect.get(payload, "errors");
  if (Array.isArray(errors) && errors.length > 0)
    return errors.filter((item): item is string => typeof item === "string");
  return [fallback];
}

async function requestCategoriesJson(
  url: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const response = await apiFetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    method,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload;
  const errors = extractApiErrors(payload, `Request failed with status ${response.status}`);
  throw new CategoriesApiError(errors[0] ?? "Request failed", response.status, errors);
}

export function categoriesIndexQueryOptions(path: string = CATEGORIES_INDEX_PATH) {
  return queryOptions({
    queryKey: ["spa", "categories", path] as const,
    queryFn: async ({ signal }): Promise<CategoriesIndex> => {
      const response = await apiFetch(path, { signal });
      if (!response.ok)
        throw new CategoriesApiError("Category list is unavailable", response.status);
      const payload: unknown = await response.json();
      return z.object({ workspace: CategoriesIndexSchema }).parse(payload).workspace;
    },
    staleTime: 10_000,
  });
}

export async function fetchNewCategoryForm(signal?: AbortSignal): Promise<CategoryForm> {
  const response = await apiFetch(NEW_CATEGORY_PATH, { signal });
  if (!response.ok)
    throw new CategoriesApiError("New category form is unavailable", response.status);
  return CategoryFormSchema.parse((await response.json()) as unknown);
}
export async function fetchEditCategoryForm(
  id: CategoryId,
  signal?: AbortSignal,
): Promise<CategoryForm> {
  const response = await apiFetch(editCategoryPath(id), { signal });
  if (!response.ok) throw new CategoriesApiError("Category form is unavailable", response.status);
  return CategoryFormSchema.parse((await response.json()) as unknown);
}
export type CategoryMutationInput = {
  color: string;
  lucide_icon: string;
  name: string;
  parent_id: string;
  transaction_id?: string;
};
function mutationBody(input: CategoryMutationInput): Record<string, unknown> {
  return {
    category: {
      color: input.color,
      icon: input.lucide_icon,
      name: input.name,
      parent_id: input.parent_id === "" ? null : input.parent_id,
    },
    ...(input.transaction_id === undefined || input.transaction_id === ""
      ? {}
      : { transaction_id: input.transaction_id }),
  };
}

export const CreatedCategorySchema = z.object({
  id: z.pipe(z.string(), CategoryIdSchema),
  name: z.string(),
  color: z.string(),
});
export type CreatedCategory = z.infer<typeof CreatedCategorySchema>;

export async function createCategoryRecord(input: CategoryMutationInput): Promise<CreatedCategory> {
  const payload = await requestCategoriesJson("/api/v1/categories", "POST", mutationBody(input));
  return CreatedCategorySchema.parse(payload);
}

const UpdatedCategorySchema = z.object({ workspace: CategoryRowSchema });

export async function updateCategoryRecord(
  id: CategoryId,
  input: CategoryMutationInput,
): Promise<CategoryRow> {
  const payload = await requestCategoriesJson(
    `${categoryPath(id)}?include=workspace`,
    "PATCH",
    mutationBody(input),
  );
  return UpdatedCategorySchema.parse(payload).workspace;
}

const OkSchema = z.object({ ok: z.boolean() });

export async function destroyCategoryRecord(id: CategoryId): Promise<void> {
  await requestCategoriesJson(categoryPath(id), "DELETE");
}

export async function destroyAllCategories(): Promise<void> {
  const payload = await requestCategoriesJson(DESTROY_ALL_PATH, "DELETE");
  OkSchema.parse(payload);
}

export async function bootstrapCategories(): Promise<void> {
  const payload = await requestCategoriesJson(BOOTSTRAP_PATH, "POST");
  OkSchema.parse(payload);
}

export async function performCategoryMerge(
  targetId: CategoryId,
  sourceIds: CategoryId[],
): Promise<number | undefined> {
  const payload = await requestCategoriesJson(PERFORM_MERGE_PATH, "POST", {
    source_ids: sourceIds,
    target_id: targetId,
  });
  return MergeResultSchema.parse(payload).merged_count;
}

export async function deleteCategoryWithReplacement(
  id: CategoryId,
  replacementId: CategoryId | null,
): Promise<void> {
  const payload = await requestCategoriesJson(
    deletionPath(id),
    "POST",
    replacementId === null ? undefined : { replacement_category_id: replacementId },
  );
  OkSchema.parse(payload);
}

export async function invalidateCategoryQueries(queryClient: {
  invalidateQueries: (filters: { queryKey: string[] }) => Promise<void>;
}): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["spa", "categories"] });
}

export type { CategoryId };
