import { useId, useState, type SyntheticEvent } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { Icon } from "./icon";
import type { Household, ProjectionGoal } from "./lifetime-projection";
import { Modal } from "./modal";

export type GoalFormValues = {
  name: string;
  type: "target_balance" | "dated_spending";
  targetYear: string;
  targetAmount: string;
  memberId: string;
  isFlexible: boolean;
};

export type GoalFormErrors = Partial<Record<keyof GoalFormValues, string>>;

export function ProjectionGoalDialog({
  household,
  initialGoal,
  isOpen,
  onClose,
  onSave,
  startYear,
}: {
  household: Household;
  initialGoal?: ProjectionGoal | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (goal: ProjectionGoal) => void;
  startYear: number;
}) {
  return (
    <Modal
      ariaLabelledby="goal-dialog-title"
      id="projection-goal-dialog"
      onClose={onClose}
      open={isOpen}
      panelClassName="w-full max-w-lg rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
    >
      {isOpen ? (
        <ProjectionGoalDialogContent
          household={household}
          initialGoal={initialGoal}
          key={initialGoal?.id ?? "new"}
          onClose={onClose}
          onSave={onSave}
          startYear={startYear}
        />
      ) : null}
    </Modal>
  );
}

function ProjectionGoalDialogContent({
  household,
  initialGoal,
  onClose,
  onSave,
  startYear,
}: {
  household: Household;
  initialGoal?: ProjectionGoal | null;
  onClose: () => void;
  onSave: (goal: ProjectionGoal) => void;
  startYear: number;
}) {
  const typeId = useId();
  const memberSelectId = useId();
  const flexibleId = useId();

  const [formValues, setFormValues] = useState<GoalFormValues>(() =>
    createInitialFormValues(initialGoal, startYear),
  );
  const [errors, setErrors] = useState<GoalFormErrors>({});

  const isEditing = initialGoal !== undefined && initialGoal !== null;

  const handleFieldChange =
    (field: keyof Omit<GoalFormValues, "type" | "isFlexible">) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setFormValues((prev) => ({ ...prev, [field]: value }));
      if (errors[field] !== undefined) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const handleTypeChange = (newType: "target_balance" | "dated_spending") => {
    setFormValues((prev) => ({ ...prev, type: newType }));
  };

  const handleToggleFlexible = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormValues((prev) => ({ ...prev, isFlexible: event.target.checked }));
  };

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const validationErrors: GoalFormErrors = {};

    const cleanName = formValues.name.trim();
    if (cleanName.length === 0) validationErrors.name = "Enter a goal or milestone name.";

    const amountNum = Number(formValues.targetAmount.replaceAll(/[$,\s]/gu, ""));
    if (!Number.isFinite(amountNum) || amountNum < 0)
      validationErrors.targetAmount = "Enter a valid, non-negative target amount.";

    const targetYearNum = Number(formValues.targetYear.trim());
    if (!Number.isFinite(targetYearNum) || !Number.isInteger(targetYearNum) || targetYearNum < 1900)
      validationErrors.targetYear = "Enter a valid target year (1900 or later).";

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const savedGoal: ProjectionGoal = {
      id: initialGoal?.id ?? `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      type: formValues.type,
      targetYear: targetYearNum,
      targetAmount: amountNum,
      memberId: formValues.memberId,
      isFlexible: formValues.isFlexible,
      shortfallExperiment: initialGoal?.shortfallExperiment ?? { enabled: false, strategy: "none" },
      enabled: initialGoal?.enabled ?? true,
    };

    onSave(savedGoal);
    onClose();
  };

  const yearNum = Number(formValues.targetYear.trim());
  let memberAgeInfo = "";
  if (Number.isFinite(yearNum) && household.members.length > 0) {
    memberAgeInfo = household.members
      .map((m) => `${m.name}: age ${yearNum - m.birthYear}`)
      .join(", ");
  }

  return (
    <form aria-label="Goal and milestone form" noValidate onSubmit={handleSubmit}>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3 border-b border-secondary pb-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-container-inset p-2 text-secondary">
              <Icon name="target" size="md" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary" id="goal-dialog-title">
                {isEditing ? "Edit goal or milestone" : "Add goal or milestone"}
              </h2>
              <p className="text-xs text-secondary">
                Track target balances or dated spending obligations against your projection.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3.5">
          <FormField
            error={errors.name}
            id="goal-form-name"
            label="Name"
            name="name"
            onChange={handleFieldChange("name")}
            placeholder="e.g. Retirement nest egg, College tuition, Home purchase"
            required
            value={formValues.name}
          />

          <div>
            <label className="block text-xs font-medium text-primary" htmlFor={typeId}>
              Goal type
            </label>
            <div className="mt-1 flex items-center gap-1 rounded-lg border border-secondary bg-container-inset p-0.5 text-xs font-medium">
              <button
                aria-pressed={formValues.type === "target_balance"}
                className={`flex-1 rounded-md py-1.5 transition-colors ${
                  formValues.type === "target_balance"
                    ? "bg-container font-semibold text-primary shadow-xs"
                    : "text-secondary hover:text-primary"
                }`}
                id={typeId}
                onClick={() => {
                  handleTypeChange("target_balance");
                }}
                type="button"
              >
                Target-balance milestone
              </button>
              <button
                aria-pressed={formValues.type === "dated_spending"}
                className={`flex-1 rounded-md py-1.5 transition-colors ${
                  formValues.type === "dated_spending"
                    ? "bg-container font-semibold text-primary shadow-xs"
                    : "text-secondary hover:text-primary"
                }`}
                onClick={() => {
                  handleTypeChange("dated_spending");
                }}
                type="button"
              >
                Dated spending goal
              </button>
            </div>
            <p className="mt-1 text-[11px] text-secondary">
              {formValues.type === "target_balance"
                ? "Milestone tests whether projected net worth reaches the target amount in that year."
                : "Spending goal represents an explicit spending outlay to fund from assets in that year."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              actions={
                memberAgeInfo ? (
                  <span className="text-[11px] text-secondary">{memberAgeInfo}</span>
                ) : null
              }
              description="Year when milestone or spending occurs."
              error={errors.targetYear}
              id="goal-form-target-year"
              inputMode="numeric"
              label="Target year"
              name="targetYear"
              onChange={handleFieldChange("targetYear")}
              required
              value={formValues.targetYear}
            />

            <FormField
              description={
                formValues.type === "target_balance"
                  ? "Desired net worth balance."
                  : "Required spending outlay."
              }
              error={errors.targetAmount}
              id="goal-form-target-amount"
              inputMode="decimal"
              label={
                formValues.type === "target_balance" ? "Target net worth" : "Target spending amount"
              }
              name="targetAmount"
              onChange={handleFieldChange("targetAmount")}
              required
              value={formValues.targetAmount}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-primary" htmlFor={memberSelectId}>
              Household assignment
            </label>
            <select
              className="mt-1 block h-9 w-full rounded-lg border border-secondary bg-container px-3 text-xs text-primary focus-ring"
              id={memberSelectId}
              name="memberId"
              onChange={handleFieldChange("memberId")}
              value={formValues.memberId}
            >
              <option value="household">Household (Shared)</option>
              {household.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} (Age {startYear - member.birthYear} today)
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-secondary">
              Associates this goal with a specific family member or the shared household.
            </p>
          </div>

          <div className="rounded-lg border border-secondary bg-container-inset/50 p-3">
            <label
              aria-label="Flexible goal"
              className="flex items-start gap-3 cursor-pointer"
              htmlFor={flexibleId}
            >
              <input
                checked={formValues.isFlexible}
                className="checkbox checkbox--light mt-0.5"
                id={flexibleId}
                name="isFlexible"
                onChange={handleToggleFlexible}
                type="checkbox"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-primary">Flexible goal</span>
                <p className="text-[11px] text-secondary">
                  Allows shortfall experiments to test reducing the target amount or deferring the
                  timing if the projection cannot fully fund it.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-secondary pt-3">
          <Button onClick={onClose} size="sm" type="button" variant="secondary">
            Cancel
          </Button>
          <Button size="sm" type="submit" variant="primary">
            {isEditing ? "Save changes" : "Add goal"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function createInitialFormValues(
  initialGoal: ProjectionGoal | null | undefined,
  startYear: number,
): GoalFormValues {
  if (initialGoal !== undefined && initialGoal !== null) {
    return {
      name: initialGoal.name,
      type: initialGoal.type,
      targetYear: String(initialGoal.targetYear),
      targetAmount: String(initialGoal.targetAmount),
      memberId: initialGoal.memberId,
      isFlexible: initialGoal.isFlexible,
    };
  }

  return {
    name: "",
    type: "target_balance",
    targetYear: String(startYear + 10),
    targetAmount: "100000",
    memberId: "household",
    isFlexible: true,
  };
}
