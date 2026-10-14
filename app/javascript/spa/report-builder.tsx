// eslint-disable import/max-dependencies -- Report composition uses shared disclosure, field card, form, button, modal, and table primitives.
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import { executeStructuredReport, fetchReportCatalog, ReportApiError } from "./api/reports";
import { Button } from "./components/button";
import { DisclosureSection } from "./components/disclosure";
import { FieldCard } from "./components/field-card";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Icon } from "./icon";
import { StructuredReportTable } from "./report-pivot-table";
import { SourcePreviewPanel } from "./source-preview-panel";
import {
  DETAIL_FIELDS,
  defaultDetailReportDefinition,
  defaultReportDefinition,
} from "./report-definition";
import type {
  DetailReportColumn,
  ReportBuilderText,
  ReportDefinition,
  ReportDimension,
  ReportField,
  ReportFilter,
  ReportValue,
  StructuredReportResult,
} from "./report-definition";
import { useRouteContext } from "@tanstack/react-router";
import { referenceDataQueryOptions } from "./api/transactions";
import { CategorySelect, MerchantSelect } from "./transaction-detail-page";
import { TagSelect } from "./components/tag-select";
import {
  CategoryIdSchema,
  MerchantIdSchema,
  ReportDimensionIdSchema,
  ReportMeasureIdSchema,
  TagIdSchema,
} from "./ids";

type Shelf = "rows" | "columns" | "values" | "filters";
type OrderedShelf = Exclude<Shelf, "filters">;
type DraggedField = { field: string; shelf?: OrderedShelf; index?: number };
type DropShelf = OrderedShelf | "sort";
type DraggedItem = DraggedField | { field: string; shelf: "sort"; index: number };
type DropTarget = { shelf: DropShelf; position: number };
type CardBounds = { top: number; height: number };
type ListBounds = { cards: CardBounds[]; gap: number };
type BuilderError = { message: string; field?: string };
const SHELVES: Shelf[] = ["rows", "columns", "values", "filters"];
const CAPACITY: Record<Shelf, number> = { rows: 3, columns: 2, values: 3, filters: 20 };

function compatible(field: ReportField, shelf: Shelf, mode: ReportDefinition["mode"]) {
  if (mode === "detail" && shelf === "columns") return field.detail;
  if (mode === "detail" && shelf !== "filters") return false;
  if (shelf === "rows" || shelf === "columns") return field.dimension;
  if (shelf === "values") return field.aggregations.length > 0;
  return field.operators.length > 0;
}

function shelfEntries(
  definition: ReportDefinition,
  shelf: Shelf,
): (ReportDimension | ReportValue | ReportFilter | DetailReportColumn)[] {
  if (definition.mode === "aggregate") return definition[shelf];
  return shelf === "columns" || shelf === "filters" ? definition[shelf] : [];
}

function reportRequestError(cause: unknown, text: ReportBuilderText): string {
  const t = (key: string) => text[key] ?? key;
  if (cause instanceof ReportApiError) {
    if (cause.message) return cause.message;
    if (cause.status === 401) return t("session_expired");
    if (cause.kind === "invalid_response") return t("invalid_response");
  }
  return t("request_failed");
}

export function ReportBuilder({
  endpoint,
  name,
  initialDefinition,
  text,
  onSave,
  onCancel,
  renderHeader,
}: {
  endpoint: string;
  name: string;
  initialDefinition: ReportDefinition;
  text: ReportBuilderText;
  onSave: (name: string, definition: ReportDefinition) => void;
  onCancel: () => void;
  renderHeader: (actions: ReactNode, modeControl: ReactNode) => ReactNode;
}) {
  const t = (key: string) => text[key] ?? key;
  const id = useId();
  const [definition, setDefinition] = useState<ReportDefinition>(() =>
    structuredClone(initialDefinition),
  );
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const reference = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
    ),
  );
  const categories = reference.data?.categories ?? [];
  const merchants = reference.data?.merchants ?? [];
  const tags = reference.data?.tags ?? [];
  const drafts = useRef<Partial<Record<ReportDefinition["mode"], ReportDefinition>>>({});
  const shelves: Shelf[] = definition.mode === "detail" ? ["columns", "filters"] : SHELVES;
  const capacity = definition.mode === "detail" ? { ...CAPACITY, columns: 6 } : CAPACITY;
  const catalogQuery = useQuery({
    queryKey: ["report-catalog", endpoint],
    queryFn: ({ signal }) => fetchReportCatalog(endpoint, { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const catalog = catalogQuery.data;
  const catalogError = catalogQuery.isError ? reportRequestError(catalogQuery.error, text) : null;
  const [clientError, setError] = useState<BuilderError | null>(null);
  const [lastGoodPreview, setLastGoodPreview] = useState<{
    definition: ReportDefinition;
    signature: string;
    result: StructuredReportResult;
  } | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    payload: DraggedItem;
    height: number;
    bounds: Partial<Record<DropShelf, ListBounds>>;
  } | null>(null);
  const previewGeneration = useRef(0);
  const dragged = useRef<DraggedItem | null>(null);
  const listElements = useRef<Partial<Record<DropShelf, HTMLDivElement | null>>>({});
  const dragBounds = useRef<Partial<Record<DropShelf, ListBounds>>>({});
  const draggedHeight = useRef(0);
  const signature = JSON.stringify([definition, pagination]);
  const currencyField = catalog?.fields.find((field) => field.key === "currency");
  const invalidDate = definition.filters.findIndex(
    (filter) =>
      filter.operator === "last" &&
      (!Number.isInteger(Number(filter.value)) ||
        Number(filter.value) < 1 ||
        Number(filter.value) > 3660),
  );
  const localError: BuilderError | null =
    definition.mode === "aggregate" && definition.values.length === 0
      ? { message: t("values_required"), field: "values" }
      : definition.mode === "detail" && definition.columns.length === 0
        ? { message: t("detail_columns_required"), field: "columns" }
        : invalidDate >= 0
          ? { message: t("invalid_days"), field: `filters.${invalidDate}.value` }
          : null;
  const previewQuery = useQuery({
    queryKey: ["report-builder-preview", endpoint, signature],
    queryFn: async ({ signal }) => {
      const generation = previewGeneration.current;
      const snapshot = structuredClone(definition);
      const result = await executeStructuredReport(endpoint, snapshot, {
        signal,
        pagination: {
          limit: pagination.pageSize,
          offset: pagination.pageIndex * pagination.pageSize,
        },
      });
      const response = { definition: snapshot, signature, result };
      if (!signal.aborted && generation === previewGeneration.current) setLastGoodPreview(response);
      return response;
    },
    enabled: catalogQuery.isSuccess && localError === null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const preview = previewQuery.data ?? lastGoodPreview;
  const running = previewQuery.isFetching;
  const serverError: BuilderError | null = previewQuery.isError
    ? {
        message: reportRequestError(previewQuery.error, text),
        field: previewQuery.error instanceof ReportApiError ? previewQuery.error.field : undefined,
      }
    : null;
  const error = clientError ?? localError ?? serverError;
  const stale = preview !== null && preview.signature !== signature;
  const canSave =
    preview !== null &&
    !stale &&
    !running &&
    !previewQuery.isPlaceholderData &&
    previewQuery.isSuccess &&
    error === null &&
    name.trim().length > 0;

  useEffect(
    () => () => {
      previewGeneration.current += 1;
    },
    [],
  );

  function change(next: ReportDefinition) {
    previewGeneration.current += 1;
    setError(null);
    if (preview && preview.signature === signature) setLastGoodPreview(preview);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    // Removing a field also removes any sort that targets it.
    if (next.mode === "detail") {
      next.sort = next.sort.filter((sort) =>
        next.columns.some((column) => column.field === sort.field),
      );
    } else {
      next.sort = next.sort.filter((sort) =>
        sort.measure !== undefined
          ? sort.axis === "rows" && next.values.some((value) => value.id === sort.measure)
          : next[sort.axis].some((dimension) => dimension.id === sort.dimension),
      );
    }
    setDefinition(next);
  }

  function switchMode(mode: ReportDefinition["mode"]) {
    if (mode === definition.mode) return;
    drafts.current[definition.mode] = structuredClone(definition);
    const next = structuredClone(
      drafts.current[mode] ??
        (mode === "detail" ? defaultDetailReportDefinition() : defaultReportDefinition()),
    );
    next.filters = structuredClone(definition.filters);
    endDrag();
    change(next);
  }

  function fieldError(path: string) {
    const field = error?.field;
    return field !== undefined &&
      (field === path || field.startsWith(`${path}.`) || field.startsWith(`${path}[`))
      ? error?.message
      : undefined;
  }

  function place(payload: DraggedField, destination: Shelf, position?: number) {
    const field = catalog?.fields.find((item) => item.key === payload.field);
    if (!field) return;
    if (
      !compatible(field, destination, definition.mode) ||
      (payload.shelf && destination === "filters")
    ) {
      setError({ message: t("invalid_destination"), field: destination });
      return;
    }
    const sameShelf = payload.shelf === destination;
    if (!sameShelf && shelfEntries(definition, destination).length >= capacity[destination]) {
      setError({
        message: t(
          definition.mode === "detail" && destination === "columns"
            ? "detail_capacity_columns"
            : `capacity_${destination}`,
        ),
        field: destination,
      });
      return;
    }
    if (
      destination === "filters" &&
      field.operators.includes("equals") &&
      field.options.length === 0
    ) {
      setError({ message: t("no_filter_options"), field: "filters" });
      return;
    }
    if (definition.mode === "detail") {
      const next = structuredClone(definition);
      const items = shelfEntries(next, destination);
      let targetIndex = position ?? items.length;
      if (destination === "columns") {
        const selectedField = DETAIL_FIELDS.find((key) => key === field.key);
        if (
          !selectedField ||
          (!sameShelf && next.columns.some((column) => column.field === selectedField))
        )
          return;
        if (sameShelf && payload.index !== undefined) {
          next.columns.splice(payload.index, 1);
          if (payload.index < targetIndex) targetIndex -= 1;
        }
        next.columns.splice(targetIndex, 0, { field: selectedField });
      } else if (destination === "filters") {
        const filter: ReportFilter = field.operators.includes("last")
          ? { field: field.key, operator: "last", value: 90, unit: "days" }
          : { field: field.key, operator: "equals", value: field.options[0]?.value ?? "" };
        next.filters.push(filter);
      }
      change(next);
      return;
    }
    const next = structuredClone(definition);
    const original =
      payload.shelf !== undefined && payload.index !== undefined
        ? next[payload.shelf][payload.index]
        : undefined;
    if (payload.shelf !== undefined && payload.index !== undefined)
      next[payload.shelf].splice(payload.index, 1);
    let targetIndex = position ?? definition[destination].length;
    if (sameShelf && payload.index !== undefined && payload.index < targetIndex) targetIndex -= 1;
    const usedIds = new Set<string>(
      [...next.rows, ...next.columns, ...next.values].map((item) => item.id),
    );
    let fieldId: string = original && "id" in original ? original.id : `${field.key}_1`;
    let suffix = 1;
    while (usedIds.has(fieldId)) fieldId = `${field.key}_${++suffix}`;
    if (destination === "rows" || destination === "columns") {
      const item: ReportDimension = {
        id: ReportDimensionIdSchema.parse(fieldId),
        field: field.key,
      };
      if (field.dateBuckets.length > 0) {
        item.dateBucket =
          original && "dateBucket" in original
            ? original.dateBucket
            : field.dateBuckets.includes("month")
              ? "month"
              : field.dateBuckets[0];
      }
      next[destination].splice(targetIndex, 0, item);
    } else if (destination === "values") {
      const item: ReportValue = {
        id: ReportMeasureIdSchema.parse(fieldId),
        field: field.key,
        aggregation:
          original && "aggregation" in original
            ? original.aggregation
            : field.aggregations.includes("sum")
              ? "sum"
              : field.aggregations[0],
      };
      next.values.splice(targetIndex, 0, item);
    } else {
      const item: ReportFilter = field.operators.includes("last")
        ? { field: field.key, operator: "last", value: 90, unit: "days" }
        : { field: field.key, operator: "equals", value: field.options[0]?.value ?? "" };
      next.filters.push(item);
    }
    change(next);
  }

  function startDrag(event: DragEvent, payload: DraggedItem) {
    event.stopPropagation();
    dragged.current = payload;
    dragBounds.current = {};
    for (const shelf of ["rows", "columns", "values", "sort"] as const) measureList(shelf);
    draggedHeight.current = (
      event.currentTarget.closest("article") ??
      event.currentTarget.parentElement ??
      event.currentTarget
    ).getBoundingClientRect().height;
    if (payload.shelf !== undefined && payload.index !== undefined) {
      draggedHeight.current =
        dragBounds.current[payload.shelf]?.cards[payload.index]?.height ?? draggedHeight.current;
    }
    // Capture the native drag image before hiding the source card or covering it with a hit surface.
    requestAnimationFrame(() => {
      if (dragged.current !== payload) return;
      setDragPreview({ payload, height: draggedHeight.current, bounds: dragBounds.current });
    });
    event.dataTransfer.effectAllowed = payload.shelf ? "move" : "copy";
    event.dataTransfer.setData("application/x-sure-report-field", JSON.stringify(payload));
  }

  function endDrag() {
    dragged.current = null;
    dragBounds.current = {};
    setDragPreview(null);
    setDropTarget(null);
  }

  function measureList(shelf: DropShelf) {
    const element = listElements.current[shelf];
    if (!element || element.getBoundingClientRect().height === 0) return;
    const top = element.getBoundingClientRect().top;
    dragBounds.current = {
      ...dragBounds.current,
      [shelf]: {
        gap: Number(getComputedStyle(element).rowGap.replace("px", "")),
        cards: Array.from(element.querySelectorAll("article"), (card) => {
          const box = card.getBoundingClientRect();
          return { top: box.top - top, height: box.height };
        }),
      },
    };
  }

  function insertionPosition(event: DragEvent, shelf: DropShelf) {
    if (!dragBounds.current[shelf]) measureList(shelf);
    const cards = dragBounds.current[shelf]?.cards ?? [];
    const top = listElements.current[shelf]?.getBoundingClientRect().top ?? event.clientY;
    const index = cards.findIndex(
      (card, cardIndex) =>
        !(dragged.current?.shelf === shelf && dragged.current.index === cardIndex) &&
        event.clientY - top < card.top + card.height / 2,
    );
    return index < 0 ? cards.length : index;
  }

  function dragOver(event: DragEvent<HTMLElement>, shelf: DropShelf) {
    const payload = dragged.current;
    if (!payload) return false;
    event.preventDefault();
    const field = catalog?.fields.find((item) => item.key === payload.field);
    const valid =
      shelf === "sort"
        ? payload.shelf === "sort" && definition.mode === "detail"
        : payload.shelf !== "sort" &&
          field !== undefined &&
          compatible(field, shelf, definition.mode) &&
          (payload.shelf === shelf || shelfEntries(definition, shelf).length < capacity[shelf]) &&
          !(
            definition.mode === "detail" &&
            shelf === "columns" &&
            payload.shelf !== shelf &&
            definition.columns.some((column) => column.field === field.key)
          );
    event.dataTransfer.dropEffect = valid ? (payload.shelf ? "move" : "copy") : "none";
    const targetPosition = insertionPosition(event, shelf);
    const bounds = dragBounds.current;
    const height = draggedHeight.current;
    setDragPreview((current) =>
      current?.payload === payload && current.bounds === bounds
        ? current
        : { payload, height, bounds },
    );
    setDropTarget((current) =>
      valid
        ? current?.shelf === shelf && current.position === targetPosition
          ? current
          : { shelf, position: targetPosition }
        : null,
    );
    return valid;
  }

  function moveSort(index: number, position: number) {
    if (definition.mode !== "detail") return;
    const next = structuredClone(definition);
    const [item] = next.sort.splice(index, 1);
    next.sort.splice(index < position ? position - 1 : position, 0, item);
    change(next);
  }

  function drop(event: DragEvent, shelf: DropShelf) {
    event.preventDefault();
    event.stopPropagation();
    const payload = dragged.current;
    const position =
      dropTarget?.shelf === shelf ? dropTarget.position : insertionPosition(event, shelf);
    if (payload?.shelf === "sort") {
      if (shelf === "sort") moveSort(payload.index, position);
    } else if (payload && shelf !== "sort") place(payload, shelf, position);
    endDrag();
  }

  function previewOffset(shelf: DropShelf, index: number) {
    const payload = dragPreview?.payload;
    const bounds = dragPreview?.bounds[shelf];
    if (!payload || !bounds || dropTarget?.shelf !== shelf) return 0;
    const position = dropTarget.position;
    const distance = dragPreview.height + bounds.gap;
    if (payload.shelf !== shelf) return index >= position ? distance : 0;
    const source = payload.index;
    if (source === undefined) return 0;
    const target = source < position ? position - 1 : position;
    if (index === source) {
      if (target === source) return 0;
      return target < source
        ? bounds.cards[target].top - bounds.cards[source].top
        : bounds.cards[target].top +
            bounds.cards[target].height -
            bounds.cards[source].height -
            bounds.cards[source].top;
    }
    if (source < target && index > source && index <= target) return -distance;
    if (source > target && index >= target && index < source) return distance;
    return 0;
  }

  function incomingPlaceholder(shelf: DropShelf) {
    if (dropTarget?.shelf !== shelf || !dragPreview || dragPreview.payload.shelf === shelf)
      return null;
    const bounds = dragPreview.bounds[shelf];
    const cards = bounds?.cards ?? [];
    const last = cards.at(-1);
    const top =
      cards[dropTarget.position]?.top ?? (last ? last.top + last.height + (bounds?.gap ?? 0) : 0);
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 flex items-center justify-center rounded-lg border border-dashed border-secondary bg-container text-sm text-secondary"
        style={{ top, height: dragPreview.height }}
      >
        {t(`field_${dragPreview.payload.field}`)}
      </div>
    );
  }

  function listStyle(shelf: DropShelf) {
    return dropTarget?.shelf === shelf && dragPreview && dragPreview.payload.shelf !== shelf
      ? { paddingBottom: dragPreview.height + (dragPreview.bounds[shelf]?.gap ?? 0) }
      : undefined;
  }

  function cardDragProps(payload: DraggedItem & { shelf: DropShelf; index: number }) {
    const { shelf, index } = payload;
    const source = dragPreview?.payload.shelf === shelf && dragPreview.payload.index === index;
    return {
      className:
        source && dropTarget
          ? "pointer-events-none border-dashed border-secondary opacity-40"
          : "border-primary",
      style: { transform: `translateY(${previewOffset(shelf, index)}px)` },
      drag: {
        label: `${t("drag_field")}: ${t(`field_${payload.field}`)}`,
        helpId: `${id}-drag-help`,
        onStart: (event: DragEvent) => {
          startDrag(event, payload);
        },
        onEnd: endDrag,
        onMove: (offset: number) => {
          const length =
            shelf === "sort" ? definition.sort.length : shelfEntries(definition, shelf).length;
          if (index + offset < 0 || index + offset >= length) return;
          const position = offset < 0 ? index - 1 : index + 2;
          if (payload.shelf === "sort") moveSort(index, position);
          else place(payload, payload.shelf, position);
          requestAnimationFrame(() => {
            document
              .querySelector(`#${CSS.escape(`${id}-${shelf}`)}`)
              ?.closest("section")
              ?.querySelector<HTMLButtonElement>(
                `article:nth-of-type(${index + offset + 1}) button[draggable]`,
              )
              ?.focus();
          });
        },
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        event.stopPropagation();
        dragOver(event, shelf);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        drop(event, shelf);
      },
    };
  }

  function updateEntry(
    shelf: Shelf,
    index: number,
    patch: Partial<ReportDimension & ReportValue & ReportFilter>,
  ) {
    const next = structuredClone(definition);
    Object.assign(shelfEntries(next, shelf)[index], patch);
    change(next);
  }

  function changeFilterField(index: number, fieldKey: string) {
    const field = catalog?.fields.find((item) => item.key === fieldKey);
    if (!field || field.operators.length === 0) return;
    if (field.operators.includes("equals") && field.options.length === 0) {
      setError({ message: t("no_filter_options"), field: `filters.${index}.field` });
      return;
    }
    const next = structuredClone(definition);
    next.filters[index] = field.operators.includes("last")
      ? { field: fieldKey, operator: "last", value: 90, unit: "days" }
      : { field: fieldKey, operator: "equals", value: field.options[0].value };
    change(next);
  }

  function removeEntry(shelf: Shelf, index: number) {
    const next = structuredClone(definition);
    shelfEntries(next, shelf).splice(index, 1);
    change(next);
  }

  function updateSort(axis: "rows" | "columns", value: string, direction?: "asc" | "desc") {
    if (definition.mode !== "aggregate") return;
    const next = structuredClone(definition);
    const existing = next.sort.find((sort) => sort.axis === axis);
    next.sort = next.sort.filter((sort) => sort.axis !== axis);
    if (value) {
      const [kind, selectedId] = value.split(":");
      next.sort.push({
        axis,
        direction: direction ?? existing?.direction ?? "asc",
        ...(kind === "measure"
          ? { measure: ReportMeasureIdSchema.parse(selectedId) }
          : { dimension: ReportDimensionIdSchema.parse(selectedId) }),
      });
    }
    change(next);
  }

  function updateDetailSort(index: number, fieldKey: string, direction?: "asc" | "desc") {
    if (definition.mode !== "detail") return;
    const next = structuredClone(definition);
    const field = next.columns.find((column) => column.field === fieldKey)?.field;
    if (!field) next.sort.splice(index, 1);
    else
      next.sort[index] = { field, direction: direction ?? next.sort.at(index)?.direction ?? "asc" };
    change(next);
  }

  return (
    <>
      {renderHeader(
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              if (canSave) onSave(name.trim(), structuredClone(definition));
            }}
          >
            {t("save_report")}
          </Button>
        </>,
        <FormField
          as="select"
          id={`${id}-mode`}
          label={t("report_type")}
          value={definition.mode}
          onChange={(event) => {
            const mode = event.target.value;
            if (mode === "detail" || mode === "aggregate") switchMode(mode);
          }}
        >
          <option value="aggregate">{t("pivot_table")}</option>
          <option value="detail">{t("transaction_table")}</option>
        </FormField>,
      )}
      <section className="space-y-6" aria-label={t("configuration")}>
        <p className="text-sm text-secondary">
          {t(definition.mode === "detail" ? "detail_builder_description" : "builder_description")}
        </p>
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <aside
            className="w-full min-w-0 shrink-0 space-y-3 lg:w-80"
            aria-label={t("configuration")}
          >
            <p id={`${id}-drag-help`} className="sr-only">
              {t("drag_help")}
            </p>
            <DisclosureSection title={t("source")} defaultOpen>
              <FormField
                as="select"
                id={`${id}-source`}
                label={t("source")}
                value={definition.source}
                onChange={(event) => {
                  if (event.currentTarget.value === "transactions")
                    change({ ...definition, source: event.currentTarget.value });
                }}
              >
                <option value="transactions">{t("transactions")}</option>
              </FormField>
              <p className="rounded-lg bg-warning/10 p-3 text-xs text-primary">
                {t(
                  definition.mode === "detail" ? "detail_signed_amount_help" : "signed_amount_help",
                )}
              </p>
            </DisclosureSection>
            <DisclosureSection title={t("fields")} id={`${id}-fields`}>
              <p className="text-xs text-secondary">{t("palette_help")}</p>
              {!catalog && catalogError === null ? (
                <output className="block text-sm text-secondary">{t("loading_catalog")}</output>
              ) : null}
              {catalogError !== null ? (
                <div role="alert" className="space-y-2">
                  <p className="text-sm text-destructive">{catalogError}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void catalogQuery.refetch();
                    }}
                  >
                    {t("retry_catalog")}
                  </Button>
                </div>
              ) : null}
              {catalog?.fields
                .filter((field) =>
                  definition.mode === "detail"
                    ? field.detail
                    : field.dimension ||
                      field.aggregations.length > 0 ||
                      field.operators.length > 0,
                )
                .map((field) => (
                  <div
                    key={field.key}
                    className="space-y-2 rounded-lg border border-primary bg-surface p-3"
                  >
                    <div
                      className="flex cursor-grab items-center gap-2 select-none active:cursor-grabbing"
                      draggable
                      onDragStart={(event) => {
                        startDrag(event, { field: field.key });
                      }}
                      onDragEnd={endDrag}
                    >
                      <Icon name="grip-horizontal" size="sm" />
                      <span className="font-medium text-primary">{field.label}</span>
                      <span className="ml-auto text-xs text-secondary">
                        {t(`kind_${field.kind}`)}
                      </span>
                    </div>
                    <div
                      className="flex flex-wrap gap-1"
                      aria-label={`${t("add_to")} ${field.label}`}
                    >
                      {shelves
                        .filter((shelf) => compatible(field, shelf, definition.mode))
                        .map((shelf) => (
                          <Button
                            key={shelf}
                            variant="secondary"
                            size="sm"
                            aria-label={`${t("add_to")} ${t(shelf)}: ${field.label}`}
                            disabled={
                              shelfEntries(definition, shelf).length >= capacity[shelf] ||
                              (definition.mode === "detail" &&
                                shelf === "columns" &&
                                definition.columns.some((column) => column.field === field.key))
                            }
                            onClick={() => {
                              place({ field: field.key }, shelf);
                            }}
                          >
                            {t(shelf)}
                          </Button>
                        ))}
                    </div>
                  </div>
                ))}
            </DisclosureSection>
            <div className="space-y-3">
              {shelves.map((shelf) => (
                <DisclosureSection
                  key={`${definition.mode}-${shelf}`}
                  id={`${id}-${shelf}`}
                  defaultOpen={shelf !== "filters"}
                  className={
                    dropTarget?.shelf === shelf
                      ? "border-secondary bg-surface"
                      : fieldError(shelf) !== undefined
                        ? "border-destructive"
                        : "border-primary"
                  }
                  onDragOver={shelf === "filters" ? undefined : (event) => dragOver(event, shelf)}
                  onDragLeave={
                    shelf === "filters"
                      ? undefined
                      : (event) => {
                          if (
                            !(event.relatedTarget instanceof Node) ||
                            !event.currentTarget.contains(event.relatedTarget)
                          )
                            setDropTarget(null);
                        }
                  }
                  onDrop={
                    shelf === "filters"
                      ? undefined
                      : (event) => {
                          drop(event, shelf);
                        }
                  }
                  title={
                    <>
                      {t(shelf)}
                      <span className="ml-2 text-xs font-normal text-secondary">
                        {shelfEntries(definition, shelf).length} / {capacity[shelf]}
                      </span>
                    </>
                  }
                >
                  <p className="text-xs text-secondary">
                    {t(
                      definition.mode === "detail" && shelf === "columns"
                        ? "detail_columns_help"
                        : `${shelf}_help`,
                    )}
                  </p>
                  {definition.mode === "aggregate" &&
                  shelf === "rows" &&
                  currencyField !== undefined &&
                  !definition.rows.some((dimension) => dimension.field === "currency") ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        place({ field: currencyField.key }, "rows");
                      }}
                    >
                      {t("add_currency_rows")}
                    </Button>
                  ) : null}
                  {fieldError(shelf) !== undefined ? (
                    <p role="alert" className="text-sm text-destructive">
                      {fieldError(shelf)}
                    </p>
                  ) : null}
                  {shelfEntries(definition, shelf).length === 0 && dropTarget?.shelf !== shelf ? (
                    <p
                      className={
                        shelf === "filters"
                          ? "text-sm text-secondary"
                          : "rounded-lg border border-dashed border-primary p-4 text-center text-sm text-secondary"
                      }
                    >
                      {t(shelf === "filters" ? "add_filters" : "drop_fields")}
                    </p>
                  ) : null}
                  <div
                    ref={
                      shelf === "filters"
                        ? undefined
                        : (element) => {
                            listElements.current[shelf] = element;
                          }
                    }
                    className="relative flex flex-col gap-3"
                    style={shelf === "filters" ? undefined : listStyle(shelf)}
                  >
                    {shelfEntries(definition, shelf).map((entry, index) => {
                      const field = catalog?.fields.find((item) => item.key === entry.field);
                      const entryId =
                        "id" in entry
                          ? entry.id
                          : shelf === "columns"
                            ? entry.field
                            : `${entry.field}-${index}`;
                      const entryPath = `${shelf}.${index}`;
                      const moveTargets =
                        definition.mode === "aggregate" && field && shelf !== "filters"
                          ? (["rows", "columns", "values"] as const).filter(
                              (destination) =>
                                destination !== shelf &&
                                compatible(field, destination, definition.mode) &&
                                shelfEntries(definition, destination).length <
                                  capacity[destination],
                            )
                          : [];
                      return (
                        <FieldCard
                          key={entryId}
                          label={field?.label ?? t(`field_${entry.field}`)}
                          removeLabel={`${t("remove_field")}: ${field?.label ?? t(`field_${entry.field}`)}`}
                          {...(shelf === "filters"
                            ? {}
                            : cardDragProps({ field: entry.field, shelf, index }))}
                          onRemove={() => {
                            removeEntry(shelf, index);
                          }}
                        >
                          {fieldError(entryPath) !== undefined ? (
                            <p role="alert" className="text-xs text-destructive">
                              {fieldError(entryPath)}
                            </p>
                          ) : null}
                          {"aggregation" in entry ? (
                            <FormField
                              as="select"
                              id={`${id}-${entryId}-aggregation`}
                              label={t("aggregation")}
                              value={entry.aggregation}
                              error={fieldError(`${entryPath}.aggregation`)}
                              onChange={(event) => {
                                const aggregation = field?.aggregations.find(
                                  (item) => item === event.target.value,
                                );
                                if (aggregation !== undefined)
                                  updateEntry(shelf, index, { aggregation });
                              }}
                            >
                              {field?.aggregations.map((aggregation) => (
                                <option key={aggregation} value={aggregation}>
                                  {t(`aggregation_${aggregation}`)}
                                </option>
                              ))}
                            </FormField>
                          ) : null}
                          {definition.mode === "aggregate" &&
                          (shelf === "rows" || shelf === "columns") &&
                          field !== undefined &&
                          field.dateBuckets.length > 0 ? (
                            <FormField
                              as="select"
                              id={`${id}-${entryId}-bucket`}
                              label={t("date_bucket")}
                              value={"dateBucket" in entry ? entry.dateBucket : ""}
                              error={fieldError(`${entryPath}.dateBucket`)}
                              onChange={(event) => {
                                const dateBucket = field.dateBuckets.find(
                                  (item) => item === event.target.value,
                                );
                                if (dateBucket !== undefined)
                                  updateEntry(shelf, index, { dateBucket });
                              }}
                            >
                              {field.dateBuckets.map((bucket) => (
                                <option key={bucket} value={bucket}>
                                  {t(`bucket_${bucket}`)}
                                </option>
                              ))}
                            </FormField>
                          ) : null}
                          {"operator" in entry ? (
                            <div className="space-y-2">
                              <FormField
                                as="select"
                                id={`${id}-${entryId}-field`}
                                label={t("filter_field")}
                                value={entry.field}
                                error={fieldError(`${entryPath}.field`)}
                                onChange={(event) => {
                                  changeFilterField(index, event.target.value);
                                }}
                              >
                                {catalog?.fields
                                  .filter((item) => item.operators.length > 0)
                                  .map((item) => (
                                    <option key={item.key} value={item.key}>
                                      {item.label}
                                    </option>
                                  ))}
                              </FormField>
                              <FormField
                                as="select"
                                id={`${id}-${entryId}-operator`}
                                label={t("filter_operator")}
                                value={entry.operator}
                                error={fieldError(`${entryPath}.operator`)}
                                onChange={(event) => {
                                  const operator = field?.operators.find(
                                    (item) => item === event.target.value,
                                  );
                                  if (operator !== undefined)
                                    updateEntry(shelf, index, { operator });
                                }}
                              >
                                {field?.operators.map((operator) => (
                                  <option key={operator} value={operator}>
                                    {t(`operator_${operator}`)}
                                  </option>
                                ))}
                              </FormField>
                              {entry.operator === "last" ? (
                                <FormField
                                  id={`${id}-${entryId}-days`}
                                  label={t("last_days")}
                                  description={t("last_days_help")}
                                  type="number"
                                  min={1}
                                  max={3660}
                                  step={1}
                                  value={entry.value}
                                  error={fieldError(`${entryPath}.value`)}
                                  onChange={(event) => {
                                    updateEntry(shelf, index, {
                                      value:
                                        event.target.value === "" ? "" : Number(event.target.value),
                                      unit: "days",
                                    });
                                  }}
                                />
                              ) : entry.field === "category" ? (
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-secondary">
                                    {t("filter_value")}
                                  </span>
                                  <CategorySelect
                                    bootstrap={bootstrap}
                                    categories={categories}
                                    label={t("filter_value")}
                                    placeholder={t("uncategorized")}
                                    portal={false}
                                    selectedCategoryId={
                                      entry.value === "" ? "" : CategoryIdSchema.parse(entry.value)
                                    }
                                    onSelect={(categoryId) => {
                                      updateEntry(shelf, index, { value: categoryId });
                                    }}
                                  />
                                  {fieldError(`${entryPath}.value`) !== undefined ? (
                                    <p className="text-xs text-destructive">
                                      {fieldError(`${entryPath}.value`)}
                                    </p>
                                  ) : null}
                                </div>
                              ) : entry.field === "merchant" ? (
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-secondary">
                                    {t("filter_value")}
                                  </span>
                                  <MerchantSelect
                                    bootstrap={bootstrap}
                                    merchants={merchants}
                                    label={t("filter_value")}
                                    placeholder={t("no_merchant")}
                                    portal={false}
                                    selectedMerchantId={
                                      entry.value === "" ? "" : MerchantIdSchema.parse(entry.value)
                                    }
                                    onSelect={(merchantId) => {
                                      updateEntry(shelf, index, { value: merchantId });
                                    }}
                                  />
                                  {fieldError(`${entryPath}.value`) !== undefined ? (
                                    <p className="text-xs text-destructive">
                                      {fieldError(`${entryPath}.value`)}
                                    </p>
                                  ) : null}
                                </div>
                              ) : entry.field === "tag" ? (
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-secondary">
                                    {t("filter_value")}
                                  </span>
                                  <TagSelect
                                    bootstrap={bootstrap}
                                    tags={tags}
                                    multiple={false}
                                    triggerLabel={t("filter_value")}
                                    placeholder={t("untagged")}
                                    portal={false}
                                    selectedTagIds={
                                      entry.value === "" ? [] : [TagIdSchema.parse(entry.value)]
                                    }
                                    onSelectSingle={(tagId) => {
                                      updateEntry(shelf, index, { value: tagId });
                                    }}
                                  />
                                  {fieldError(`${entryPath}.value`) !== undefined ? (
                                    <p className="text-xs text-destructive">
                                      {fieldError(`${entryPath}.value`)}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <FormField
                                  as="select"
                                  id={`${id}-${entryId}-value`}
                                  label={
                                    entry.field === "currency"
                                      ? t("currency_filter")
                                      : t("filter_value")
                                  }
                                  description={
                                    entry.field === "currency"
                                      ? t("currency_filter_help")
                                      : undefined
                                  }
                                  value={String(entry.value)}
                                  error={fieldError(`${entryPath}.value`)}
                                  onChange={(event) => {
                                    updateEntry(shelf, index, { value: event.target.value });
                                  }}
                                >
                                  {field?.options.some(
                                    (option) => option.value === String(entry.value),
                                  ) !== true ? (
                                    <option value={String(entry.value)}>{t("choose_value")}</option>
                                  ) : null}
                                  {field?.options.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </FormField>
                              )}
                            </div>
                          ) : null}
                          {moveTargets.length > 0 ? (
                            <FormField
                              as="select"
                              id={`${id}-${entryId}-destination`}
                              label={t("move_to")}
                              value=""
                              onChange={(event) => {
                                const destination = shelves.find(
                                  (item) => item === event.target.value,
                                );
                                if (destination !== undefined && shelf !== "filters")
                                  place({ field: entry.field, shelf, index }, destination);
                              }}
                            >
                              <option value="">{t("choose_destination")}</option>
                              {moveTargets.map((destination) => (
                                <option key={destination} value={destination}>
                                  {t(destination)}
                                </option>
                              ))}
                            </FormField>
                          ) : null}
                        </FieldCard>
                      );
                    })}
                    {shelf === "filters" ? null : incomingPlaceholder(shelf)}
                    {shelf !== "filters" && dragPreview ? (
                      <div aria-hidden="true" className="absolute inset-0 z-10" />
                    ) : null}
                  </div>
                </DisclosureSection>
              ))}
            </div>
            <DisclosureSection
              title={t("sorting")}
              id={`${id}-sort`}
              className={
                dropTarget?.shelf === "sort" ? "border-secondary bg-surface" : "border-primary"
              }
              onDragOver={(event) => dragOver(event, "sort")}
              onDragLeave={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                )
                  setDropTarget(null);
              }}
              onDrop={(event) => {
                drop(event, "sort");
              }}
            >
              <p className="text-xs text-secondary">
                {t(definition.mode === "detail" ? "detail_sort_help" : "sort_help")}
              </p>
              {fieldError("sort") !== undefined ? (
                <p className="text-sm text-destructive" role="alert">
                  {fieldError("sort")}
                </p>
              ) : null}
              <div className="grid gap-4">
                {definition.mode === "aggregate" ? (
                  (["rows", "columns"] as const).map((axis) => {
                    const sort = definition.sort.find((item) => item.axis === axis);
                    const selected =
                      sort?.measure !== undefined
                        ? `measure:${sort.measure}`
                        : sort?.dimension !== undefined
                          ? `dimension:${sort.dimension}`
                          : "";
                    return (
                      <article
                        key={axis}
                        className="space-y-3 rounded-lg border border-primary bg-surface p-3"
                      >
                        <h3 className="font-medium text-primary">{t(`${axis}_sort`)}</h3>
                        <FormField
                          as="select"
                          id={`${id}-${axis}-sort`}
                          label={t(`${axis}_sort`)}
                          value={selected}
                          onChange={(event) => {
                            updateSort(axis, event.target.value);
                          }}
                        >
                          <option value="">{t("default_order")}</option>
                          {definition[axis].map((dimension) => (
                            <option key={dimension.id} value={`dimension:${dimension.id}`}>
                              {t(`field_${dimension.field}`)}
                              {dimension.dateBucket
                                ? ` · ${t(`bucket_${dimension.dateBucket}`)}`
                                : ""}
                            </option>
                          ))}
                          {axis === "rows"
                            ? definition.values.map((value) => (
                                <option key={value.id} value={`measure:${value.id}`}>
                                  {t("row_total")} · {t(`aggregation_${value.aggregation}`)} ·{" "}
                                  {t(`field_${value.field}`)}
                                </option>
                              ))
                            : null}
                        </FormField>
                        <FormField
                          as="select"
                          id={`${id}-${axis}-direction`}
                          label={t("sort_direction")}
                          value={sort?.direction ?? "asc"}
                          disabled={!selected}
                          onChange={(event) => {
                            const direction = event.target.value;
                            if (direction === "asc" || direction === "desc")
                              updateSort(axis, selected, direction);
                          }}
                        >
                          <option value="asc">{t("ascending")}</option>
                          <option value="desc">{t("descending")}</option>
                        </FormField>
                      </article>
                    );
                  })
                ) : (
                  <>
                    <div
                      ref={(element) => {
                        listElements.current.sort = element;
                      }}
                      className="relative flex flex-col gap-3"
                      style={listStyle("sort")}
                    >
                      {definition.sort.map((sort, index) => (
                        <FieldCard
                          key={sort.field}
                          label={t(`field_${sort.field}`)}
                          removeLabel={`${t("remove_sort")}: ${t(`field_${sort.field}`)}`}
                          {...cardDragProps({ field: sort.field, shelf: "sort", index })}
                          onRemove={() => {
                            updateDetailSort(index, "");
                          }}
                        >
                          <FormField
                            as="select"
                            id={`${id}-detail-sort-${index}`}
                            label={t("sort_field")}
                            value={sort.field}
                            error={fieldError(`sort.${index}.field`)}
                            onChange={(event) => {
                              const controlId = event.currentTarget.id;
                              updateDetailSort(index, event.target.value);
                              // Changing the field remounts this keyed row; retain keyboard focus.
                              requestAnimationFrame(() => {
                                document
                                  .querySelector<HTMLSelectElement>(`#${CSS.escape(controlId)}`)
                                  ?.focus();
                              });
                            }}
                          >
                            {definition.columns.map((column) => (
                              <option
                                key={column.field}
                                value={column.field}
                                disabled={definition.sort.some(
                                  (item, sortIndex) =>
                                    sortIndex !== index && item.field === column.field,
                                )}
                              >
                                {t(`field_${column.field}`)}
                              </option>
                            ))}
                          </FormField>
                          <FormField
                            as="select"
                            id={`${id}-detail-direction-${index}`}
                            label={t("sort_direction")}
                            value={sort.direction}
                            error={fieldError(`sort.${index}.direction`)}
                            onChange={(event) => {
                              const direction = event.target.value;
                              if (direction === "asc" || direction === "desc")
                                updateDetailSort(index, sort.field, direction);
                            }}
                          >
                            <option value="asc">{t("ascending")}</option>
                            <option value="desc">{t("descending")}</option>
                          </FormField>
                        </FieldCard>
                      ))}
                      {incomingPlaceholder("sort")}
                      {dragPreview ? (
                        <div aria-hidden="true" className="absolute inset-0 z-10" />
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={definition.sort.length >= definition.columns.length}
                      onClick={() => {
                        const field = definition.columns.find(
                          (column) => !definition.sort.some((sort) => sort.field === column.field),
                        );
                        if (field) updateDetailSort(definition.sort.length, field.field);
                      }}
                    >
                      {t("add_sort")}
                    </Button>
                  </>
                )}
              </div>
            </DisclosureSection>
          </aside>
          <SourcePreviewPanel
            id={`${id}-preview`}
            title={t("preview")}
            description={t("save_gate_help")}
            actions={
              previewQuery.isError && localError === null ? (
                <IconButton
                  icon="refresh-ccw"
                  label={t("retry_preview")}
                  disabled={running}
                  onClick={() => {
                    setError(null);
                    void previewQuery.refetch();
                  }}
                />
              ) : null
            }
          >
            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error.message}
              </p>
            ) : null}
            {stale && !running && error === null ? (
              <output className="block rounded-lg bg-warning/10 p-3 text-sm text-primary">
                {t("stale_preview")}
              </output>
            ) : null}
            {!preview ? (
              <p className="p-6 text-center text-sm text-secondary">{t("preview_empty")}</p>
            ) : (
              <StructuredReportTable
                definition={preview.definition}
                result={preview.result}
                text={text}
                pagination={{
                  state: pagination,
                  onChange: (updater) => {
                    previewGeneration.current += 1;
                    setError(null);
                    if (preview.signature === signature) setLastGoodPreview(preview);
                    setPagination(updater);
                  },
                  pending: running || (stale && !serverError),
                  loading: running,
                  hasNext: error === null && preview.result.pagination.hasNext,
                }}
              />
            )}
          </SourcePreviewPanel>
        </div>
      </section>
    </>
  );
}
