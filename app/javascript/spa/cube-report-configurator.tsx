import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { cubeErrorText, executeCubeQuery, type CubeCatalog } from "./api/cube";
import {
  CubeReportSettingsSchema,
  cubeMeasureLabel,
  cubeQuery,
  defaultCubeSettings,
  validCubeSettings,
  type CubeReport,
  type CubeReportSettings,
} from "./cube-dashboard-storage";
import { CubeReportResult } from "./cube-report-result";

export function CubeReportConfigurator({
  report,
  endpoint,
  userId,
  catalog,
  text,
  onSave,
  onCancel,
  onRemove,
}: {
  report?: CubeReport;
  endpoint: string;
  userId: string;
  catalog: CubeCatalog | undefined;
  text: Record<string, string>;
  onSave: (name: string, settings: CubeReportSettings) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(report?.name ?? text.new_report);
  const [settings, setSettings] = useState<CubeReportSettings>(
    report?.settings ?? defaultCubeSettings(),
  );
  const [revision, setRevision] = useState(0);
  const [submitted, setSubmitted] = useState<{
    name: string;
    settings: CubeReportSettings;
    revision: number;
  } | null>(null);
  const valid = name.trim().length > 0 && validCubeSettings(settings);
  const preview = useQuery({
    queryKey: ["cube-preview", userId, endpoint, report?.id ?? "new", submitted],
    queryFn: ({ signal }) => {
      if (submitted === null) throw new Error(text.preview_required);
      return executeCubeQuery(endpoint, cubeQuery(submitted.settings), signal);
    },
    enabled: submitted !== null && catalog?.configured === true,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const changeSettings = (next: CubeReportSettings) => {
    setSettings(next);
    setSubmitted(null);
    setRevision((current) => current + 1);
  };
  const verified =
    submitted !== null &&
    submitted.revision === revision &&
    preview.isSuccess &&
    !preview.isFetching &&
    valid;

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl border border-secondary bg-container p-4 shadow-border-xs">
        <h2 className="text-lg font-semibold text-primary">{text.configure_report}</h2>
        <FormField
          id="cube-report-name"
          label={text.report_name}
          required
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setSubmitted(null);
            setRevision((current) => current + 1);
          }}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-primary">{text.metrics}</legend>
          <div className="flex flex-wrap gap-4">
            {(catalog?.measures ?? []).map((member) => {
              const measure = member.name;
              return (
                <label key={measure} className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="checkbox"
                    checked={settings.measures.includes(measure)}
                    onChange={(event) => {
                      changeSettings({
                        ...settings,
                        measures: event.currentTarget.checked
                          ? [...settings.measures, measure]
                          : settings.measures.filter((value) => value !== measure),
                      });
                    }}
                  />
                  {cubeMeasureLabel(measure, text)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            as="select"
            id="cube-grouping"
            label={text.grouping}
            value={settings.grouping}
            onChange={(event) => {
              changeSettings(
                CubeReportSettingsSchema.parse({
                  ...settings,
                  grouping: event.currentTarget.value,
                }),
              );
            }}
          >
            {(["date", "category", "account"] as const).map((group) => (
              <option key={group} value={group}>
                {text[group]}
              </option>
            ))}
          </FormField>
          <FormField
            as="select"
            id="cube-granularity"
            label={text.granularity}
            value={settings.granularity}
            disabled={settings.grouping !== "date"}
            onChange={(event) => {
              changeSettings(
                CubeReportSettingsSchema.parse({
                  ...settings,
                  granularity: event.currentTarget.value,
                }),
              );
            }}
          >
            {(catalog?.granularities ?? []).map((granularity) => (
              <option key={granularity} value={granularity}>
                {text[granularity]}
              </option>
            ))}
          </FormField>
          <FormField
            as="select"
            id="cube-presentation"
            label={text.presentation}
            value={settings.presentation}
            onChange={(event) => {
              changeSettings(
                CubeReportSettingsSchema.parse({
                  ...settings,
                  presentation: event.currentTarget.value,
                }),
              );
            }}
          >
            {(["table", "line", "pie"] as const).map((presentation) => (
              <option
                key={presentation}
                value={presentation}
                disabled={presentation !== "table" && settings.measures.length !== 1}
              >
                {text[presentation]}
              </option>
            ))}
          </FormField>
          <FormField
            id="cube-date-start"
            label={text.date_start}
            type="date"
            required
            value={settings.start}
            max={settings.end}
            onChange={(event) => {
              changeSettings({ ...settings, start: event.currentTarget.value });
            }}
          />
          <FormField
            id="cube-date-end"
            label={text.date_end}
            type="date"
            required
            value={settings.end}
            min={settings.start}
            onChange={(event) => {
              changeSettings({ ...settings, end: event.currentTarget.value });
            }}
          />
        </div>
        {!valid ? (
          <output className="block text-sm text-destructive">{text.invalid_configuration}</output>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {onRemove ? (
            <Button size="sm" variant="destructive-outline" onClick={onRemove}>
              {text.remove_report}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onCancel}>
              {text.cancel}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconProps={{ name: "play", size: "sm" }}
              disabled={!valid || preview.isFetching || catalog?.configured !== true}
              onClick={() => {
                const nextRevision = revision + 1;
                setRevision(nextRevision);
                setSubmitted({ name: name.trim(), settings, revision: nextRevision });
              }}
            >
              {preview.isFetching ? text.loading : text.run_preview}
            </Button>
            <Button
              size="sm"
              disabled={!verified}
              title={!verified ? text.preview_required : text.save}
              onClick={() => {
                if (verified) onSave(submitted.name, submitted.settings);
              }}
            >
              {text.save}
            </Button>
          </div>
        </div>
        {!verified ? <p className="text-xs text-secondary">{text.preview_required}</p> : null}
      </section>
      {submitted !== null ? (
        <section
          className="space-y-3 rounded-xl border border-secondary bg-container p-4 shadow-border-xs"
          aria-label={text.preview}
        >
          <h2 className="text-sm font-semibold text-primary">{text.preview}</h2>
          {preview.isFetching ? (
            <output className="block text-secondary">{text.loading}</output>
          ) : preview.isError ? (
            <p role="alert" className="text-destructive">
              {cubeErrorText(preview.error, text)}
            </p>
          ) : preview.data ? (
            <CubeReportResult
              result={preview.data}
              settings={submitted.settings}
              name={submitted.name}
              text={text}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
