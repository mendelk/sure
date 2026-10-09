import { useId } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import type { ReportBuilderText } from "./report-definition";
import type { Source } from "./source";
import { SourceIdSchema, type SourceId } from "./ids";

export function SourcePicker({
  sources,
  value,
  onChange,
  onCreateSource,
  onEditSource,
  text,
  id,
}: {
  sources: Source[];
  value: SourceId | "";
  onChange: (sourceId: SourceId | "") => void;
  onCreateSource: () => void;
  onEditSource?: (source: Source) => void;
  text: ReportBuilderText;
  id?: string;
}) {
  const generatedId = useId();
  const selected = sources.find((source) => source.id === value);
  return (
    <div className="space-y-3">
      <FormField
        as="select"
        id={id ?? generatedId}
        label={text.source}
        value={value}
        onChange={(event) => {
          onChange(
            event.currentTarget.value === "" ? "" : SourceIdSchema.parse(event.currentTarget.value),
          );
        }}
      >
        <option value="">{text.choose_source}</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onCreateSource}>
          {text.create_source}
        </Button>
        {selected !== undefined && onEditSource !== undefined && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onEditSource(selected);
            }}
          >
            {text.edit_source}
          </Button>
        )}
      </div>
    </div>
  );
}
