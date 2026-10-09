// eslint-disable import/max-dependencies -- Source editing composes the builders, shared preview/table, query lifecycle, and controls.
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { ReportBuilder } from "./report-builder";
import { defaultReportDefinition, type ReportBuilderText } from "./report-definition";
import { STARTER_QUERY } from "./dashboard-storage";
import {
  generateSourceId,
  normalizeSureqlResult,
  type Source,
  type SourceConfiguration,
} from "./source";
import { SqlPreview, SureqlEditor } from "./sureql-editor";
import { useSureqlPreview } from "./sureql-preview";
import { SourceResultTable } from "./report-pivot-table";
import { SourcePreviewPanel } from "./source-preview-panel";

export function SourceEditor({
  source,
  endpoint,
  text,
  onSave,
  onCancel,
}: {
  source?: Source;
  endpoint: string;
  text: ReportBuilderText;
  onSave: (source: Source) => Promise<void>;
  onCancel: () => void;
}) {
  const [id] = useState(() => source?.id ?? generateSourceId());
  const [name, setName] = useState(source?.name ?? "");
  const [kind, setKind] = useState<SourceConfiguration["kind"]>(
    source?.configuration.kind ?? "structured",
  );
  const [query, setQuery] = useState(
    source?.configuration.kind === "sureql" ? source.configuration.query : STARTER_QUERY,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const preview = useSureqlPreview();
  const previewData = useMemo(
    () => (preview.result === null ? null : normalizeSureqlResult(preview.result)),
    [preview.result],
  );
  const resultPagination = previewData?.result.pagination;
  const paginationState = {
    pageSize: resultPagination?.limit ?? 10,
    pageIndex: Math.floor((resultPagination?.offset ?? 0) / (resultPagination?.limit ?? 10)),
  };
  const t = (key: string) => text[key];
  const builderText = useMemo(
    () => ({
      ...text,
      report_name: text.source_name,
      report_type: text.source_mode,
      source: text.source_dataset,
      configuration: text.source_configuration,
      save_report: text.save_source,
      transaction_table: text.source_mode_detail,
      pivot_table: text.source_mode_aggregate,
    }),
    [text],
  );
  const matchesDraft = preview.status === "success" && preview.resultQuery?.trim() === query.trim();
  const save = async (sourceName: string, configuration: SourceConfiguration) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ id, name: sourceName.trim(), configuration });
    } catch (reason: unknown) {
      setSaveError(reason instanceof Error ? reason.message : t("request_failed"));
      setSaving(false);
    }
  };
  const renderHeader = (actions: ReactNode, modeControl?: ReactNode) => (
    <>
      <header className="flex items-center justify-between gap-3">
        <h1 id="source-editor-title" className="min-w-0 text-2xl font-semibold text-primary">
          {source ? t("edit_source") : t("create_source")}
        </h1>
        <div className="flex shrink-0 gap-2">{actions}</div>
      </header>
      <div
        className={`grid min-w-0 gap-4 ${kind === "structured" ? "grid-cols-3" : "grid-cols-2"}`}
      >
        <FormField
          id="source-name"
          label={t("source_name")}
          value={name}
          autoComplete="off"
          maxLength={80}
          required
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
        <FormField
          as="select"
          id="source-type"
          label={t("source_type")}
          value={kind}
          disabled={saving}
          onChange={(event) => {
            if (
              event.currentTarget.value === "structured" ||
              event.currentTarget.value === "sureql"
            ) {
              setKind(event.currentTarget.value);
              preview.reset();
            }
          }}
        >
          <option value="structured">{t("source_structured")}</option>
          <option value="sureql">{t("source_sureql")}</option>
        </FormField>
        {modeControl}
      </div>
      {saveError !== null && (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}
    </>
  );
  return (
    <section aria-labelledby="source-editor-title" id="source-editor" className="space-y-4 pb-12">
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        {kind === "structured" ? (
          <ReportBuilder
            endpoint={endpoint}
            name={name}
            initialDefinition={
              source?.configuration.kind === "structured"
                ? source.configuration.definition
                : defaultReportDefinition()
            }
            text={builderText}
            renderHeader={renderHeader}
            onCancel={onCancel}
            onSave={(nextName, definition) => {
              void save(nextName, { kind: "structured", definition });
            }}
          />
        ) : (
          <>
            {renderHeader(
              <>
                <Button variant="secondary" onClick={onCancel}>
                  {t("cancel")}
                </Button>
                <Button
                  disabled={!name.trim() || !query.trim() || !matchesDraft}
                  onClick={() => {
                    void save(name, { kind: "sureql", query: query.trim() });
                  }}
                >
                  {t("save_source")}
                </Button>
              </>,
            )}
            <div className="space-y-6">
              <div className="w-full min-w-0">
                <SureqlEditor
                  value={query}
                  defaultValue={STARTER_QUERY}
                  onChange={setQuery}
                  onRun={() => {
                    preview.run(endpoint, query);
                  }}
                  loading={preview.status === "running"}
                />
              </div>
              <TabGroup className="w-full min-w-0">
                <SourcePreviewPanel
                  id="source-preview-title"
                  title={t("preview")}
                  description={t("source_sureql_preview_help")}
                  sticky={false}
                  tabs={
                    <TabList
                      className="mb-3 flex gap-1 rounded-md bg-surface-inset p-1"
                      aria-label={t("preview")}
                    >
                      <Tab className="rounded-sm px-3 py-2 text-sm font-medium text-secondary data-selected:bg-container data-selected:text-primary focus-ring">
                        {t("preview")}
                      </Tab>
                      <Tab
                        disabled={previewData === null}
                        className="rounded-sm px-3 py-2 text-sm font-medium text-secondary data-selected:bg-container data-selected:text-primary disabled:opacity-50 focus-ring"
                      >
                        {t("source_sql")}
                      </Tab>
                    </TabList>
                  }
                >
                  {preview.error !== null && (
                    <p
                      role="alert"
                      className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                    >
                      {t("source_preview_error")}: {preview.error}
                    </p>
                  )}
                  {previewData !== null && preview.status === "success" && !matchesDraft && (
                    <output className="block rounded-lg bg-warning/10 p-3 text-sm text-primary">
                      {t("stale_preview")}
                    </output>
                  )}
                  <TabPanels>
                    <TabPanel className="space-y-4 focus:outline-none">
                      {previewData === null ? (
                        <p className="p-6 text-center text-sm text-secondary">
                          {t("source_sureql_preview_empty")}
                        </p>
                      ) : (
                        <SourceResultTable
                          key={preview.resultQuery}
                          data={previewData}
                          columns={previewData.columns}
                          text={text}
                          label={t("detail_result_table")}
                          pagination={{
                            state: paginationState,
                            pending: !matchesDraft,
                            loading: preview.status === "running",
                            hasNext: previewData.result.pagination.hasNext,
                            onChange: (updater) => {
                              if (!matchesDraft) return;
                              const next =
                                typeof updater === "function" ? updater(paginationState) : updater;
                              preview.run(endpoint, query, {
                                limit: next.pageSize,
                                offset: next.pageIndex * next.pageSize,
                              });
                            },
                          }}
                        />
                      )}
                    </TabPanel>
                    <TabPanel className="focus:outline-none">
                      {previewData !== null && (
                        <SqlPreview sql={previewData.result.sql} label={t("source_sql")} />
                      )}
                    </TabPanel>
                  </TabPanels>
                </SourcePreviewPanel>
              </TabGroup>
            </div>
          </>
        )}
      </fieldset>
    </section>
  );
}
