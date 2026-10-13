/* eslint-disable import/max-dependencies -- Component composes loan form fields, account API, and routing. */
import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState, type SyntheticEvent } from "react";
import { accountDetailQueryOptions, type AccountDetail } from "./api/accounts";
import { readCsrfToken } from "./api/transactions";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Icon } from "./icon";
import { AccountIdSchema } from "./ids";
import { Modal } from "./modal";

export function LoanEditDrawer() {
  const params = useParams({ strict: false });
  const rawAccountId = typeof params.accountId === "string" ? params.accountId : "";
  const accountId = AccountIdSchema.parse(rawAccountId);
  const navigate = useNavigate();

  const accountQuery = useQuery(accountDetailQueryOptions(accountId, { page: 1, tab: "overview" }));
  const account = accountQuery.data;

  function close() {
    void navigate({
      to: "/accounts/$accountId",
      params: { accountId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: "overview" }),
      resetScroll: false,
    });
  }

  return (
    <Modal
      onClose={close}
      open
      panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
      placement="drawer"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-medium text-primary">
              Edit {account?.name ?? "Loan"}
            </DialogTitle>
            <p className="mt-0.5 text-sm text-secondary">
              Update loan parameters and amortization schedule terms.
            </p>
          </div>
          <IconButton className="shrink-0" icon="x" label="Close" onClick={close} />
        </div>

        {accountQuery.isPending ? (
          <output className="text-sm text-secondary">Loading account details…</output>
        ) : null}

        {accountQuery.isError ? (
          <Alert live="alert" title="Account unavailable" variant="error">
            <p>Could not load account details.</p>
          </Alert>
        ) : null}

        {account !== undefined ? <LoanEditForm account={account} onClose={close} /> : null}
      </div>
    </Modal>
  );
}

function LoanEditForm({ account, onClose }: { account: AccountDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const loan = account.loan;

  const [name, setName] = useState(account.name);
  const initialBal = loan?.initial_balance;
  const initRate = loan?.interest_rate;
  const initDown = loan?.down_payment;
  const initTerm = loan?.term_months;
  const initIns = loan?.insurance_rate;
  const initBalance = account.balance;

  const [balance, setBalance] = useState(
    initBalance !== undefined && initBalance !== null ? String(initBalance) : "",
  );
  const [subtype, setSubtype] = useState(loan?.subtype ?? "");
  const [initialBalance, setInitialBalance] = useState(
    initialBal !== undefined && initialBal !== null ? String(initialBal) : "",
  );
  const [interestRate, setInterestRate] = useState(
    initRate !== undefined && initRate !== null ? String(initRate) : "",
  );
  const [rateType, setRateType] = useState(loan?.rate_type ?? "fixed");
  const [downPayment, setDownPayment] = useState(
    initDown !== undefined && initDown !== null ? String(initDown) : "",
  );
  const [startDate, setStartDate] = useState(loan?.start_date ?? "");
  const [termMonths, setTermMonths] = useState(
    initTerm !== undefined && initTerm !== null ? String(initTerm) : "",
  );
  const [insuranceRate, setInsuranceRate] = useState(
    initIns !== undefined && initIns !== null ? String(initIns) : "",
  );
  const [insuranceRateType, setInsuranceRateType] = useState(loan?.insurance_rate_type ?? "");
  const [institutionName, setInstitutionName] = useState(account.institution_name ?? "");
  const [institutionDomain, setInstitutionDomain] = useState(account.institution_domain ?? "");
  const [notes, setNotes] = useState(account.notes ?? "");
  const [excludeFromReports, setExcludeFromReports] = useState(
    account.exclude_from_reports ?? false,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formData = new FormData();
      formData.set("authenticity_token", readCsrfToken());
      formData.set("_method", "patch");

      if (name.trim().length > 0) formData.set("account[name]", name.trim());
      if (balance.trim().length > 0) formData.set("account[balance]", balance.trim());
      formData.set("account[accountable_attributes][subtype]", subtype);
      if (initialBalance.trim().length > 0)
        formData.set("account[accountable_attributes][initial_balance]", initialBalance.trim());
      if (interestRate.trim().length > 0)
        formData.set("account[accountable_attributes][interest_rate]", interestRate.trim());
      formData.set("account[accountable_attributes][rate_type]", rateType);
      if (downPayment.trim().length > 0)
        formData.set("account[accountable_attributes][down_payment]", downPayment.trim());
      if (startDate.trim().length > 0)
        formData.set("account[accountable_attributes][start_date]", startDate.trim());
      if (termMonths.trim().length > 0)
        formData.set("account[accountable_attributes][term_months]", termMonths.trim());
      if (insuranceRate.trim().length > 0)
        formData.set("account[accountable_attributes][insurance_rate]", insuranceRate.trim());
      formData.set("account[accountable_attributes][insurance_rate_type]", insuranceRateType);
      formData.set("account[institution_name]", institutionName.trim());
      formData.set("account[institution_domain]", institutionDomain.trim());
      formData.set("account[notes]", notes.trim());
      formData.set("account[exclude_from_reports]", excludeFromReports ? "1" : "0");

      const response = await fetch(`/loans/${account.id}`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        redirect: "manual",
      });

      if (!response.ok && response.type !== "opaqueredirect")
        throw new Error(`Failed to update loan (${response.status})`);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);

      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to update loan");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {submitError !== null ? (
        <Alert live="alert" title={submitError} variant="error">
          <p>{submitError}</p>
        </Alert>
      ) : null}

      <form
        className="flex grow flex-col justify-between gap-6"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="space-y-4">
          <FormField
            id="loan-name"
            label="Account name"
            onChange={(e) => {
              setName(e.target.value);
            }}
            required
            type="text"
            value={name}
          />

          <FormField
            id="loan-balance"
            label="Balance"
            onChange={(e) => {
              setBalance(e.target.value);
            }}
            required
            step="0.01"
            type="number"
            value={balance}
          />

          <FormField
            as="select"
            id="loan-subtype"
            label="Loan type"
            onChange={(e) => {
              setSubtype(e.target.value);
            }}
            value={subtype}
          >
            <option value="">Select loan type</option>
            <option value="mortgage">Mortgage</option>
            <option value="student">Student</option>
            <option value="auto">Auto</option>
            <option value="personal">Personal</option>
          </FormField>

          <FormField
            id="loan-initial-balance"
            label="Original loan balance"
            onChange={(e) => {
              setInitialBalance(e.target.value);
            }}
            required
            step="0.01"
            type="number"
            value={initialBalance}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              id="loan-interest-rate"
              label="Interest rate (%)"
              min={0}
              onChange={(e) => {
                setInterestRate(e.target.value);
              }}
              step="0.005"
              type="number"
              value={interestRate}
            />

            <FormField
              as="select"
              id="loan-rate-type"
              label="Rate type"
              onChange={(e) => {
                setRateType(e.target.value);
              }}
              value={rateType}
            >
              <option value="fixed">Fixed</option>
              <option value="variable">Variable</option>
              <option value="arm">Adjustable rate (ARM)</option>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              id="loan-down-payment"
              label="Down payment"
              min={0}
              onChange={(e) => {
                setDownPayment(e.target.value);
              }}
              step="0.01"
              type="number"
              value={downPayment}
            />

            <FormField
              id="loan-start-date"
              label="Origination date"
              onChange={(e) => {
                setStartDate(e.target.value);
              }}
              type="date"
              value={startDate}
            />
          </div>

          <FormField
            id="loan-term-months"
            label="Term (months)"
            max={1200}
            min={1}
            onChange={(e) => {
              setTermMonths(e.target.value);
            }}
            type="number"
            value={termMonths}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              id="loan-insurance-rate"
              label="Insurance rate (%)"
              min={0}
              onChange={(e) => {
                setInsuranceRate(e.target.value);
              }}
              step="0.005"
              type="number"
              value={insuranceRate}
            />

            <FormField
              as="select"
              id="loan-insurance-type"
              label="Insurance type"
              onChange={(e) => {
                setInsuranceRateType(e.target.value);
              }}
              value={insuranceRateType}
            >
              <option value="">None</option>
              <option value="level_term">Level term</option>
              <option value="decreasing_life">Decreasing life</option>
            </FormField>
          </div>

          <details className="group" open={false}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-surface px-3 py-2 focus-ring [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-medium uppercase text-secondary">
                Additional details
              </span>
              <Icon
                className="text-secondary transition-transform duration-150 motion-safe:group-open:rotate-180"
                name="chevron-down"
              />
            </summary>
            <div className="mt-2 space-y-3">
              <FormField
                id="loan-institution-name"
                label="Institution name"
                onChange={(e) => {
                  setInstitutionName(e.target.value);
                }}
                type="text"
                value={institutionName}
              />
              <FormField
                id="loan-institution-domain"
                label="Institution domain"
                onChange={(e) => {
                  setInstitutionDomain(e.target.value);
                }}
                type="text"
                value={institutionDomain}
              />
              <FormField
                as="textarea"
                id="loan-notes"
                label="Notes"
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
                rows={4}
                value={notes}
              />
              <label className="flex items-center gap-2 text-sm text-primary">
                <input
                  checked={excludeFromReports}
                  className="checkbox checkbox--light"
                  onChange={(e) => {
                    setExcludeFromReports(e.target.checked);
                  }}
                  type="checkbox"
                />
                <span>Exclude from reports</span>
              </label>
            </div>
          </details>
        </div>

        <div className="mt-auto flex justify-end gap-2 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={isSubmitting} type="submit" variant="primary">
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </>
  );
}
