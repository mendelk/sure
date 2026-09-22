import { useId, useState, type SyntheticEvent } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { Icon } from "./icon";
import type { Household, ProjectionEvent } from "./lifetime-projection";
import { Modal } from "./modal";

export type EventFormValues = {
  name: string;
  type: "income" | "spending";
  frequency: "recurring" | "one_time";
  memberId: string;
  startYear: string;
  endYear: string;
  amount: string;
  annualChangePercent: string;
};

export type EventFormErrors = Partial<Record<keyof EventFormValues, string>>;

export function ProjectionEventDialog({
  household,
  initialEvent,
  isOpen,
  onClose,
  onSave,
  startYear,
}: {
  household: Household;
  initialEvent?: ProjectionEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: ProjectionEvent) => void;
  startYear: number;
}) {
  return (
    <Modal
      ariaLabelledby="event-dialog-title"
      id="projection-event-dialog"
      onClose={onClose}
      open={isOpen}
      panelClassName="w-full max-w-lg rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
    >
      {isOpen ? (
        <ProjectionEventDialogContent
          household={household}
          initialEvent={initialEvent}
          key={initialEvent?.id ?? "new"}
          onClose={onClose}
          onSave={onSave}
          startYear={startYear}
        />
      ) : null}
    </Modal>
  );
}

function ProjectionEventDialogContent({
  household,
  initialEvent,
  onClose,
  onSave,
  startYear,
}: {
  household: Household;
  initialEvent?: ProjectionEvent | null;
  onClose: () => void;
  onSave: (event: ProjectionEvent) => void;
  startYear: number;
}) {
  const typeId = useId();
  const frequencyId = useId();
  const memberSelectId = useId();

  const [formValues, setFormValues] = useState<EventFormValues>(() =>
    createInitialFormValues(initialEvent, startYear),
  );
  const [errors, setErrors] = useState<EventFormErrors>({});

  const isEditing = initialEvent !== undefined && initialEvent !== null;

  const handleFieldChange =
    (field: keyof EventFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setFormValues((prev) => ({ ...prev, [field]: value }));
      if (errors[field] !== undefined) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const handleTypeChange = (newType: "income" | "spending") => {
    setFormValues((prev) => ({ ...prev, type: newType }));
  };

  const handleFrequencyChange = (newFreq: "recurring" | "one_time") => {
    setFormValues((prev) => ({
      ...prev,
      frequency: newFreq,
      endYear: newFreq === "one_time" ? prev.startYear : prev.endYear,
    }));
  };

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const validationErrors: EventFormErrors = {};

    const cleanName = formValues.name.trim();
    if (cleanName.length === 0) validationErrors.name = "Enter an event name.";

    const amountNum = Number(formValues.amount.replaceAll(/[$,\s]/gu, ""));
    if (!Number.isFinite(amountNum) || amountNum < 0)
      validationErrors.amount = "Enter a valid, non-negative amount.";

    const startYearNum = Number(formValues.startYear.trim());
    if (!Number.isFinite(startYearNum) || !Number.isInteger(startYearNum) || startYearNum < 1900)
      validationErrors.startYear = "Enter a valid start year (1900 or later).";

    let endYearNum = startYearNum;
    if (formValues.frequency === "recurring") {
      endYearNum = Number(formValues.endYear.trim());
      if (!Number.isFinite(endYearNum) || !Number.isInteger(endYearNum))
        validationErrors.endYear = "Enter a valid end year.";
      else if (endYearNum < startYearNum)
        validationErrors.endYear = "End year cannot be before start year.";
    }

    const changeNum = Number(formValues.annualChangePercent.trim());
    if (!Number.isFinite(changeNum) || changeNum < -100 || changeNum > 100)
      validationErrors.annualChangePercent = "Annual change must be between -100% and 100%.";

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const savedEvent: ProjectionEvent = {
      id: initialEvent?.id ?? `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      type: formValues.type,
      frequency: formValues.frequency,
      memberId: formValues.memberId,
      startYear: startYearNum,
      endYear: endYearNum,
      amount: amountNum,
      annualChangePercent: changeNum,
      enabled: initialEvent?.enabled ?? true,
    };

    onSave(savedEvent);
    onClose();
  };

  return (
    <form aria-label="Life event form" noValidate onSubmit={handleSubmit}>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3 border-b border-secondary pb-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-container-inset p-2 text-secondary">
              <Icon name="calendar" size="md" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary" id="event-dialog-title">
                {isEditing ? "Edit scheduled event" : "Schedule income or spending event"}
              </h2>
              <p className="text-xs text-secondary">
                Configure timing, amounts, and member assignment for this cash flow.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3.5">
          <FormField
            error={errors.name}
            id="event-form-name"
            label="Event name"
            name="name"
            onChange={handleFieldChange("name")}
            placeholder="e.g. Salary, Living costs, Home remodel, Pension"
            required
            value={formValues.name}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-primary" htmlFor={typeId}>
                Cash flow type
              </label>
              <div className="mt-1 flex items-center gap-1 rounded-lg border border-secondary bg-container-inset p-0.5 text-xs font-medium">
                <button
                  aria-pressed={formValues.type === "income"}
                  className={`flex-1 rounded-md py-1.5 transition-colors ${
                    formValues.type === "income"
                      ? "bg-container font-semibold text-success shadow-xs"
                      : "text-secondary hover:text-primary"
                  }`}
                  id={typeId}
                  onClick={() => {
                    handleTypeChange("income");
                  }}
                  type="button"
                >
                  Income
                </button>
                <button
                  aria-pressed={formValues.type === "spending"}
                  className={`flex-1 rounded-md py-1.5 transition-colors ${
                    formValues.type === "spending"
                      ? "bg-container font-semibold text-destructive shadow-xs"
                      : "text-secondary hover:text-primary"
                  }`}
                  onClick={() => {
                    handleTypeChange("spending");
                  }}
                  type="button"
                >
                  Spending
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-primary" htmlFor={frequencyId}>
                Frequency
              </label>
              <div className="mt-1 flex items-center gap-1 rounded-lg border border-secondary bg-container-inset p-0.5 text-xs font-medium">
                <button
                  aria-pressed={formValues.frequency === "recurring"}
                  className={`flex-1 rounded-md py-1.5 transition-colors ${
                    formValues.frequency === "recurring"
                      ? "bg-container font-semibold text-primary shadow-xs"
                      : "text-secondary hover:text-primary"
                  }`}
                  id={frequencyId}
                  onClick={() => {
                    handleFrequencyChange("recurring");
                  }}
                  type="button"
                >
                  Recurring
                </button>
                <button
                  aria-pressed={formValues.frequency === "one_time"}
                  className={`flex-1 rounded-md py-1.5 transition-colors ${
                    formValues.frequency === "one_time"
                      ? "bg-container font-semibold text-primary shadow-xs"
                      : "text-secondary hover:text-primary"
                  }`}
                  onClick={() => {
                    handleFrequencyChange("one_time");
                  }}
                  type="button"
                >
                  One-time
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              actions={
                <span className="text-xs text-secondary">
                  {formValues.frequency === "recurring" ? "$ / year" : "one-time"}
                </span>
              }
              description="In today's dollars before inflation."
              error={errors.amount}
              id="event-form-amount"
              inputMode="decimal"
              label="Amount"
              name="amount"
              onChange={handleFieldChange("amount")}
              required
              value={formValues.amount}
            />

            <div>
              <label className="block text-xs font-medium text-primary" htmlFor={memberSelectId}>
                Assigned to
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-secondary bg-container px-3 py-2 text-sm text-primary focus-ring"
                id={memberSelectId}
                name="memberId"
                onChange={handleFieldChange("memberId")}
                value={formValues.memberId}
              >
                <option value="household">Household (Shared)</option>
                {household.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} (Member)
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-secondary">Who this flow is associated with.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              description={
                formValues.frequency === "one_time" ? "Year flow occurs." : "First active year."
              }
              error={errors.startYear}
              id="event-form-start-year"
              inputMode="numeric"
              label={formValues.frequency === "one_time" ? "Calendar year" : "Start year"}
              name="startYear"
              onChange={handleFieldChange("startYear")}
              required
              value={formValues.startYear}
            />

            {formValues.frequency === "recurring" ? (
              <FormField
                description="Last active year (inclusive)."
                error={errors.endYear}
                id="event-form-end-year"
                inputMode="numeric"
                label="End year"
                name="endYear"
                onChange={handleFieldChange("endYear")}
                required
                value={formValues.endYear}
              />
            ) : (
              <FormField
                actions={<span className="text-xs text-secondary">% / year</span>}
                description="Annual growth before inflation (optional)."
                disabled
                error={errors.annualChangePercent}
                id="event-form-annual-change"
                label="Annual change"
                name="annualChangePercent"
                value="0"
              />
            )}
          </div>

          {formValues.frequency === "recurring" ? (
            <FormField
              actions={<span className="text-xs text-secondary">% / year</span>}
              description="Real annual adjustment on top of general inflation (optional)."
              error={errors.annualChangePercent}
              id="event-form-annual-change"
              inputMode="decimal"
              label="Annual change rate"
              name="annualChangePercent"
              onChange={handleFieldChange("annualChangePercent")}
              value={formValues.annualChangePercent}
            />
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-secondary pt-3">
          <Button onClick={onClose} size="sm" type="button" variant="secondary">
            Cancel
          </Button>
          <Button id="event-dialog-submit" size="sm" type="submit" variant="primary">
            {isEditing ? "Save changes" : "Add event"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function createInitialFormValues(
  initialEvent: ProjectionEvent | null | undefined,
  startYear: number,
): EventFormValues {
  if (initialEvent !== undefined && initialEvent !== null) {
    return {
      name: initialEvent.name,
      type: initialEvent.type,
      frequency: initialEvent.frequency,
      memberId: initialEvent.memberId,
      startYear: String(initialEvent.startYear),
      endYear: String(initialEvent.endYear),
      amount: String(initialEvent.amount),
      annualChangePercent: String(initialEvent.annualChangePercent),
    };
  }

  return {
    name: "",
    type: "income",
    frequency: "recurring",
    memberId: "household",
    startYear: String(startYear + 1),
    endYear: String(startYear + 30),
    amount: "",
    annualChangePercent: "0",
  };
}
