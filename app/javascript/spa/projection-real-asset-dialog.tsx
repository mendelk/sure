import { useId, useState, type SyntheticEvent } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { Icon } from "./icon";
import type { ProjectionDebt, ProjectionRealAsset } from "./lifetime-projection";
import { Modal } from "./modal";

export type RealAssetFormValues = {
  name: string;
  category: "property" | "vehicle" | "other_asset";
  initialValue: string;
  purchaseYear: string;
  annualAppreciationPercent: string;
  annualCarryingCost: string;
  saleYear: string;
  linkedDebtId: string;
};

export type RealAssetFormErrors = Partial<Record<keyof RealAssetFormValues, string>>;

export function ProjectionRealAssetDialog({
  debts,
  initialAsset,
  isOpen,
  onClose,
  onSave,
  startYear,
}: {
  debts: ProjectionDebt[];
  initialAsset?: ProjectionRealAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (asset: ProjectionRealAsset) => void;
  startYear: number;
}) {
  return (
    <Modal
      ariaLabelledby="real-asset-dialog-title"
      id="projection-real-asset-dialog"
      onClose={onClose}
      open={isOpen}
      panelClassName="w-full max-w-lg rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
    >
      {isOpen ? (
        <ProjectionRealAssetDialogContent
          debts={debts}
          initialAsset={initialAsset}
          key={initialAsset?.id ?? "new"}
          onClose={onClose}
          onSave={onSave}
          startYear={startYear}
        />
      ) : null}
    </Modal>
  );
}

function ProjectionRealAssetDialogContent({
  debts,
  initialAsset,
  onClose,
  onSave,
  startYear,
}: {
  debts: ProjectionDebt[];
  initialAsset?: ProjectionRealAsset | null;
  onClose: () => void;
  onSave: (asset: ProjectionRealAsset) => void;
  startYear: number;
}) {
  const categoryId = useId();
  const linkedDebtIdField = useId();

  const [formValues, setFormValues] = useState<RealAssetFormValues>(() =>
    createInitialRealAssetFormValues(initialAsset, startYear),
  );
  const [errors, setErrors] = useState<RealAssetFormErrors>({});

  const isEditing = initialAsset !== undefined && initialAsset !== null;

  const handleFieldChange =
    (field: keyof RealAssetFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setFormValues((prev) => {
        const next = { ...prev, [field]: value };
        // If switching category, suggest appropriate default appreciation/depreciation rate
        if (field === "category" && !initialAsset) {
          if (value === "property") {
            next.annualAppreciationPercent = "3.5";
            next.annualCarryingCost = "4500";
          } else if (value === "vehicle") {
            next.annualAppreciationPercent = "-15.0";
            next.annualCarryingCost = "1800";
          } else {
            next.annualAppreciationPercent = "0.0";
            next.annualCarryingCost = "500";
          }
        }
        return next;
      });
      if (errors[field] !== undefined) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const parsedValue = Math.max(0, Number(formValues.initialValue) || 0);
  const parsedPurchaseYear = Math.round(Number(formValues.purchaseYear) || startYear);
  const parsedRate = Number(formValues.annualAppreciationPercent) || 0;
  const parsedCarryingCost = Math.max(0, Number(formValues.annualCarryingCost) || 0);
  const parsedSaleYear =
    formValues.saleYear.trim().length > 0 ? Math.round(Number(formValues.saleYear)) : undefined;

  // Calculation preview
  const isFuturePurchase = parsedPurchaseYear > startYear;
  const linkedDebt = debts.find((d) => d.id === formValues.linkedDebtId);
  const downPayment =
    linkedDebt && isFuturePurchase
      ? Math.max(0, parsedValue - linkedDebt.startingBalance)
      : parsedValue;

  let estimatedSaleValue = parsedValue;
  if (parsedSaleYear !== undefined && parsedSaleYear > parsedPurchaseYear) {
    const yearsOwned = parsedSaleYear - parsedPurchaseYear;
    estimatedSaleValue = Math.max(0, parsedValue * (1 + parsedRate / 100) ** yearsOwned);
  }

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const validationErrors: RealAssetFormErrors = {};

    const cleanName = formValues.name.trim();
    if (cleanName.length === 0) validationErrors.name = "Asset name is required.";

    const valueNum = Number(formValues.initialValue);
    if (!Number.isFinite(valueNum) || valueNum < 0)
      validationErrors.initialValue = "Enter a valid value (0 or greater).";

    const purchaseYearNum = Number(formValues.purchaseYear);
    if (
      !Number.isFinite(purchaseYearNum) ||
      !Number.isInteger(purchaseYearNum) ||
      purchaseYearNum < 1900 ||
      purchaseYearNum > 2150
    )
      validationErrors.purchaseYear = "Enter a valid purchase year.";

    const rateNum = Number(formValues.annualAppreciationPercent);
    if (!Number.isFinite(rateNum) || rateNum < -100 || rateNum > 100) {
      validationErrors.annualAppreciationPercent =
        "Enter an appreciation or depreciation rate between -100% and +100%.";
    }

    const carryingNum = Number(formValues.annualCarryingCost);
    if (!Number.isFinite(carryingNum) || carryingNum < 0)
      validationErrors.annualCarryingCost = "Carrying cost cannot be negative.";

    let saleYearNum: number | undefined;
    if (formValues.saleYear.trim().length > 0) {
      saleYearNum = Number(formValues.saleYear);
      if (
        !Number.isFinite(saleYearNum) ||
        !Number.isInteger(saleYearNum) ||
        saleYearNum < purchaseYearNum
      )
        validationErrors.saleYear = `Sale year must be at or after purchase year (${purchaseYearNum}).`;
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const asset: ProjectionRealAsset = {
      id: initialAsset?.id ?? `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      category: formValues.category,
      initialValue: valueNum,
      purchaseYear: purchaseYearNum,
      annualAppreciationPercent: rateNum,
      annualCarryingCost: carryingNum,
      saleYear: saleYearNum,
      linkedDebtId: formValues.linkedDebtId ? formValues.linkedDebtId : undefined,
      enabled: initialAsset?.enabled ?? true,
    };

    onSave(asset);
    onClose();
  };

  return (
    <form className="flex flex-col" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between border-b border-primary px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-container-inset text-primary">
            <Icon name={formValues.category === "vehicle" ? "car" : "home"} size="md" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-primary" id="real-asset-dialog-title">
              {isEditing ? "Edit real asset" : "Add real asset"}
            </h2>
            <p className="text-xs text-secondary">
              Model property, vehicle, appreciation/depreciation, carrying costs, and sales.
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
          id="real-asset-form-name"
          label="Asset name"
          name="name"
          onChange={handleFieldChange("name")}
          placeholder="e.g. Primary Residence, Tesla Model Y, Vacation Cabin"
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
              <option value="property">Property / Home</option>
              <option value="vehicle">Vehicle / Automobile</option>
              <option value="other_asset">Other Real Asset</option>
            </select>
          </div>

          <FormField
            description={isFuturePurchase ? "Future purchase price" : "Current market value"}
            error={errors.initialValue}
            id="real-asset-form-initial-value"
            label="Value / purchase price ($)"
            name="initialValue"
            onChange={handleFieldChange("initialValue")}
            placeholder="450000"
            required
            step="1000"
            type="number"
            value={formValues.initialValue}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            description={isFuturePurchase ? "Planned purchase year" : "Acquisition year"}
            error={errors.purchaseYear}
            id="real-asset-form-purchase-year"
            label="Purchase / start year"
            name="purchaseYear"
            onChange={handleFieldChange("purchaseYear")}
            placeholder={String(startYear)}
            required
            step="1"
            type="number"
            value={formValues.purchaseYear}
          />

          <FormField
            description="Positive for growth, negative for depreciation"
            error={errors.annualAppreciationPercent}
            id="real-asset-form-annual-rate"
            label="Annual rate (%)"
            name="annualAppreciationPercent"
            onChange={handleFieldChange("annualAppreciationPercent")}
            placeholder={formValues.category === "vehicle" ? "-15.0" : "3.5"}
            required
            step="0.1"
            type="number"
            value={formValues.annualAppreciationPercent}
          />

          <FormField
            description="Taxes, insurance, maintenance"
            error={errors.annualCarryingCost}
            id="real-asset-form-carrying-cost"
            label="Carrying cost ($/yr)"
            name="annualCarryingCost"
            onChange={handleFieldChange("annualCarryingCost")}
            placeholder="4500"
            step="100"
            type="number"
            value={formValues.annualCarryingCost}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            description="Optional planned sale year"
            error={errors.saleYear}
            id="real-asset-form-sale-year"
            label="Planned sale year"
            name="saleYear"
            onChange={handleFieldChange("saleYear")}
            placeholder="e.g. 2040 (leave empty if keeping)"
            step="1"
            type="number"
            value={formValues.saleYear}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-primary" htmlFor={linkedDebtIdField}>
              Linked financing debt (optional)
            </label>
            <select
              className="h-9 w-full rounded-md border border-primary bg-container px-3 text-sm text-primary shadow-border-xs focus-ring focus:border-secondary"
              id={linkedDebtIdField}
              onChange={handleFieldChange("linkedDebtId")}
              value={formValues.linkedDebtId}
            >
              <option value="">None (unleveraged / cash)</option>
              {debts.map((debt) => (
                <option key={debt.id} value={debt.id}>
                  {debt.name} (${Math.round(debt.startingBalance).toLocaleString()} @{" "}
                  {debt.interestRatePercent}%)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Calculation Preview */}
        <div className="rounded-lg border border-primary bg-container-inset p-3 text-xs">
          <div className="font-medium text-primary">Asset life cycle preview</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-secondary">
            <div>
              <span>Annual carrying costs: </span>
              <strong className="text-primary">
                ${Math.round(parsedCarryingCost).toLocaleString()}/yr
              </strong>
            </div>
            <div>
              <span>Growth / depreciation: </span>
              <strong className={parsedRate >= 0 ? "text-primary" : "text-destructive"}>
                {parsedRate >= 0 ? `+${parsedRate}%/yr` : `${parsedRate}%/yr`}
              </strong>
            </div>
            {isFuturePurchase ? (
              <div className="col-span-2">
                <span>Purchase outflow in {parsedPurchaseYear}: </span>
                <strong className="text-primary">
                  ${Math.round(downPayment).toLocaleString()}
                </strong>
                {linkedDebt
                  ? ` ($${Math.round(linkedDebt.startingBalance).toLocaleString()} financed via ${linkedDebt.name})`
                  : " (100% cash)"}
              </div>
            ) : null}
            {parsedSaleYear !== undefined ? (
              <div className="col-span-2">
                <span>Estimated gross sale in {parsedSaleYear}: </span>
                <strong className="text-primary">
                  ${Math.round(estimatedSaleValue).toLocaleString()}
                </strong>
                {linkedDebt ? " (remaining debt will be cleared from proceeds)" : ""}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-primary bg-container-inset px-6 py-3">
        <Button onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {isEditing ? "Save changes" : "Add real asset"}
        </Button>
      </div>
    </form>
  );
}

function createInitialRealAssetFormValues(
  asset?: ProjectionRealAsset | null,
  defaultStartYear = new Date().getFullYear(),
): RealAssetFormValues {
  if (asset) {
    return {
      name: asset.name,
      category: asset.category,
      initialValue: String(asset.initialValue),
      purchaseYear: String(asset.purchaseYear),
      annualAppreciationPercent: String(asset.annualAppreciationPercent),
      annualCarryingCost: String(asset.annualCarryingCost),
      saleYear: asset.saleYear !== undefined ? String(asset.saleYear) : "",
      linkedDebtId: asset.linkedDebtId ?? "",
    };
  }

  return {
    name: "",
    category: "property",
    initialValue: "450000",
    purchaseYear: String(defaultStartYear),
    annualAppreciationPercent: "3.5",
    annualCarryingCost: "4500",
    saleYear: "",
    linkedDebtId: "",
  };
}
