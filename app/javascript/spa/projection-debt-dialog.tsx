import { useId, useState, type SyntheticEvent } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { Icon } from "./icon";
import {
  calculateScheduledAnnualPayment,
  simulateDebtPayoff,
  type ProjectionDebt,
  type ProjectionRealAsset,
} from "./lifetime-projection";
import { Modal } from "./modal";

export type DebtFormValues = {
  name: string;
  category: "mortgage" | "auto" | "student" | "other";
  startingBalance: string;
  interestRatePercent: string;
  termYears: string;
  startYear: string;
  extraAnnualPayment: string;
  linkedAssetId: string;
};

export type DebtFormErrors = Partial<Record<keyof DebtFormValues, string>>;

export function ProjectionDebtDialog({
  initialDebt,
  isOpen,
  onClose,
  onSave,
  realAssets,
  startYear,
}: {
  initialDebt?: ProjectionDebt | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (debt: ProjectionDebt) => void;
  realAssets: ProjectionRealAsset[];
  startYear: number;
}) {
  return (
    <Modal
      ariaLabelledby="debt-dialog-title"
      id="projection-debt-dialog"
      onClose={onClose}
      open={isOpen}
      panelClassName="w-full max-w-lg rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
    >
      {isOpen ? (
        <ProjectionDebtDialogContent
          initialDebt={initialDebt}
          key={initialDebt?.id ?? "new"}
          onClose={onClose}
          onSave={onSave}
          realAssets={realAssets}
          startYear={startYear}
        />
      ) : null}
    </Modal>
  );
}

function ProjectionDebtDialogContent({
  initialDebt,
  onClose,
  onSave,
  realAssets,
  startYear,
}: {
  initialDebt?: ProjectionDebt | null;
  onClose: () => void;
  onSave: (debt: ProjectionDebt) => void;
  realAssets: ProjectionRealAsset[];
  startYear: number;
}) {
  const categoryId = useId();
  const linkedAssetIdField = useId();

  const [formValues, setFormValues] = useState<DebtFormValues>(() =>
    createInitialDebtFormValues(initialDebt, startYear),
  );
  const [errors, setErrors] = useState<DebtFormErrors>({});

  const isEditing = initialDebt !== undefined && initialDebt !== null;

  const handleFieldChange =
    (field: keyof DebtFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setFormValues((prev) => ({ ...prev, [field]: value }));
      if (errors[field] !== undefined) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const parsedBalance = Math.max(0, Number(formValues.startingBalance) || 0);
  const parsedRate = Math.max(0, Number(formValues.interestRatePercent) || 0);
  const parsedTerm = Math.max(1, Math.round(Number(formValues.termYears) || 1));
  const parsedStartYear = Math.round(Number(formValues.startYear) || startYear);
  const parsedExtra = Math.max(0, Number(formValues.extraAnnualPayment) || 0);

  const previewSim = simulateDebtPayoff({
    id: "preview",
    name: formValues.name || "Preview",
    category: formValues.category,
    startingBalance: parsedBalance,
    interestRatePercent: parsedRate,
    termYears: parsedTerm,
    startYear: parsedStartYear,
    extraAnnualPayment: parsedExtra,
    enabled: true,
  });

  const scheduledAnnual = calculateScheduledAnnualPayment(parsedBalance, parsedRate, parsedTerm);
  const totalAnnual = scheduledAnnual + parsedExtra;

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const validationErrors: DebtFormErrors = {};

    const cleanName = formValues.name.trim();
    if (cleanName.length === 0) validationErrors.name = "Debt name is required.";

    const balanceNum = Number(formValues.startingBalance);
    if (!Number.isFinite(balanceNum) || balanceNum < 0)
      validationErrors.startingBalance = "Enter a valid balance (0 or greater).";

    const rateNum = Number(formValues.interestRatePercent);
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100)
      validationErrors.interestRatePercent = "Enter an interest rate between 0% and 100%.";

    const termNum = Number(formValues.termYears);
    if (!Number.isFinite(termNum) || !Number.isInteger(termNum) || termNum < 1 || termNum > 50)
      validationErrors.termYears = "Enter a term between 1 and 50 years.";

    const yearNum = Number(formValues.startYear);
    if (!Number.isFinite(yearNum) || !Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2150)
      validationErrors.startYear = "Enter a valid start year.";

    const extraNum = Number(formValues.extraAnnualPayment);
    if (!Number.isFinite(extraNum) || extraNum < 0)
      validationErrors.extraAnnualPayment = "Extra annual payment cannot be negative.";

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const debt: ProjectionDebt = {
      id: initialDebt?.id ?? `debt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      category: formValues.category,
      startingBalance: balanceNum,
      interestRatePercent: rateNum,
      termYears: termNum,
      startYear: yearNum,
      extraAnnualPayment: extraNum,
      linkedAssetId: formValues.linkedAssetId ? formValues.linkedAssetId : undefined,
      enabled: initialDebt?.enabled ?? true,
    };

    onSave(debt);
    onClose();
  };

  return (
    <form className="flex flex-col" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between border-b border-primary px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-container-inset text-primary">
            <Icon name="credit-card" size="md" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-primary" id="debt-dialog-title">
              {isEditing ? "Edit debt or loan" : "Add debt or loan"}
            </h2>
            <p className="text-xs text-secondary">
              Model mortgage, auto, student, or personal loan principal, interest, and payoff.
            </p>
          </div>
        </div>
        <button
          aria-label="Close dialog"
          className="rounded-lg p-1 text-secondary transition-colors hover:bg-container-hover hover:text-primary"
          onClick={onClose}
          type="button"
        >
          <Icon name="x" size="sm" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <FormField
          error={errors.name}
          id="debt-form-name"
          label="Debt name"
          name="name"
          onChange={handleFieldChange("name")}
          placeholder="e.g. Primary Mortgage, Car Loan, Student Loan"
          required
          type="text"
          value={formValues.name}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-primary" htmlFor={categoryId}>
              Category
            </label>
            <select
              className="h-9 w-full rounded-md border border-primary bg-container px-3 text-sm text-primary shadow-border-xs focus-ring focus:border-secondary"
              id={categoryId}
              onChange={handleFieldChange("category")}
              value={formValues.category}
            >
              <option value="mortgage">Mortgage</option>
              <option value="auto">Auto Loan</option>
              <option value="student">Student Loan</option>
              <option value="other">Other Loan / Credit</option>
            </select>
          </div>

          <FormField
            error={errors.startingBalance}
            id="debt-form-starting-balance"
            label="Starting balance ($)"
            name="startingBalance"
            onChange={handleFieldChange("startingBalance")}
            placeholder="300000"
            required
            step="1000"
            type="number"
            value={formValues.startingBalance}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            error={errors.interestRatePercent}
            id="debt-form-interest-rate"
            label="Interest rate (%)"
            name="interestRatePercent"
            onChange={handleFieldChange("interestRatePercent")}
            placeholder="5.5"
            required
            step="0.1"
            type="number"
            value={formValues.interestRatePercent}
          />

          <FormField
            error={errors.termYears}
            id="debt-form-term-years"
            label="Term (years)"
            name="termYears"
            onChange={handleFieldChange("termYears")}
            placeholder="30"
            required
            step="1"
            type="number"
            value={formValues.termYears}
          />

          <FormField
            error={errors.startYear}
            id="debt-form-start-year"
            label="Start year"
            name="startYear"
            onChange={handleFieldChange("startYear")}
            placeholder={String(startYear)}
            required
            step="1"
            type="number"
            value={formValues.startYear}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            description="Extra principal each year to accelerate payoff"
            error={errors.extraAnnualPayment}
            id="debt-form-extra-payment"
            label="Extra annual payment ($)"
            name="extraAnnualPayment"
            onChange={handleFieldChange("extraAnnualPayment")}
            placeholder="0"
            step="500"
            type="number"
            value={formValues.extraAnnualPayment}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-primary" htmlFor={linkedAssetIdField}>
              Linked real asset (optional)
            </label>
            <select
              className="h-9 w-full rounded-md border border-primary bg-container px-3 text-sm text-primary shadow-border-xs focus-ring focus:border-secondary"
              id={linkedAssetIdField}
              onChange={handleFieldChange("linkedAssetId")}
              value={formValues.linkedAssetId}
            >
              <option value="">None (unlinked)</option>
              {realAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({asset.category})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Calculation Preview */}
        <div className="rounded-lg border border-primary bg-container-inset p-3 text-xs">
          <div className="font-medium text-primary">Payment & payoff estimate</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-secondary">
            <div>
              <span>Scheduled annual payment: </span>
              <strong className="text-primary">
                ${Math.round(scheduledAnnual).toLocaleString()}/yr
              </strong>
            </div>
            <div>
              <span>Total payment (with extra): </span>
              <strong className="text-primary">
                ${Math.round(totalAnnual).toLocaleString()}/yr
              </strong>
            </div>
            <div>
              <span>Scheduled payoff year: </span>
              <strong className="text-primary">{previewSim.scheduledPayoffYear}</strong>
            </div>
            <div>
              <span>Actual payoff year: </span>
              <strong className="text-primary">{previewSim.actualPayoffYear}</strong>
            </div>
          </div>
          {previewSim.yearsSaved > 0 ? (
            <div className="mt-2 rounded-sm border border-warning/30 bg-warning/10 p-2 font-medium text-primary">
              ⚡ Extra payments accelerate payoff by {previewSim.yearsSaved}{" "}
              {previewSim.yearsSaved === 1 ? "year" : "years"} and save an estimated $
              {Math.round(previewSim.interestSaved).toLocaleString()} in total interest!
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-primary bg-container-inset px-6 py-3">
        <Button onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {isEditing ? "Save changes" : "Add debt"}
        </Button>
      </div>
    </form>
  );
}

function createInitialDebtFormValues(
  debt?: ProjectionDebt | null,
  defaultStartYear = new Date().getFullYear(),
): DebtFormValues {
  if (debt) {
    return {
      name: debt.name,
      category: debt.category,
      startingBalance: String(debt.startingBalance),
      interestRatePercent: String(debt.interestRatePercent),
      termYears: String(debt.termYears),
      startYear: String(debt.startYear),
      extraAnnualPayment: String(debt.extraAnnualPayment),
      linkedAssetId: debt.linkedAssetId ?? "",
    };
  }

  return {
    name: "",
    category: "mortgage",
    startingBalance: "300000",
    interestRatePercent: "5.0",
    termYears: "25",
    startYear: String(defaultStartYear),
    extraAnnualPayment: "0",
    linkedAssetId: "",
  };
}
