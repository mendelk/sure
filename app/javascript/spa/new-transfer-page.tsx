/* eslint-disable import/max-dependencies -- Transfer creation composes API, routing, and shared form primitives. */
import { DialogTitle } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import {
  createTransfer,
  transferExchangeRateQueryOptions,
  transferFormOptionsQueryOptions,
  type SpaTransfer,
  type TransferFormOptions,
} from "./api/transfers";
import type { SpaBootstrap } from "./bootstrap";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { TagSelect } from "./components/tag-select";
import { AccountIdSchema, newIdempotencyKey, type AccountId, type TagId } from "./ids";
import { Modal } from "./modal";

export function validateNewTransferSearch(input: Record<string, unknown>): {
  from_account_id?: AccountId;
  to_account_id?: AccountId;
} {
  return {
    from_account_id:
      typeof input.from_account_id === "string"
        ? AccountIdSchema.parse(input.from_account_id)
        : undefined,
    to_account_id:
      typeof input.to_account_id === "string"
        ? AccountIdSchema.parse(input.to_account_id)
        : undefined,
  };
}

type TransferFormProps = {
  bootstrap: SpaBootstrap;
  defaultAccountId?: AccountId;
  defaultDestinationAccountId?: AccountId;
  onClose: () => void;
  onCreated?: (transfer: SpaTransfer) => void;
};

export function NewTransferPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const search = useSearch({
    strict: false,
    select: (input: Record<string, unknown>) => validateNewTransferSearch(input),
  });
  const navigate = useNavigate();
  function close() {
    if (search.from_account_id !== undefined)
      void navigate({ to: "/accounts/$accountId", params: { accountId: search.from_account_id } });
    else void navigate({ to: "/transactions" });
  }
  return (
    <Modal
      onClose={close}
      open
      placement="drawer"
      panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <DialogTitle className="text-lg font-medium text-primary">
            {bootstrap.accountDetailText.creation_transfer_tab}
          </DialogTitle>
          <IconButton icon="x" label="Close" onClick={close} />
        </div>
        <NewTransferForm
          bootstrap={bootstrap}
          defaultAccountId={search.from_account_id}
          defaultDestinationAccountId={search.to_account_id}
          onClose={close}
        />
      </div>
    </Modal>
  );
}

export function NewTransferForm(props: TransferFormProps) {
  const options = useQuery(transferFormOptionsQueryOptions(props.bootstrap.apiPaths.transfers));
  if (options.data === undefined) {
    if (options.isError) {
      return (
        <Alert title={options.error.message} variant="error">
          <Button onClick={() => void options.refetch()}>Retry</Button>
        </Alert>
      );
    }
    return (
      <output className="text-sm text-secondary">
        {props.bootstrap.accountDetailText.creation_loading}
      </output>
    );
  }
  return <TransferForm {...props} options={options.data} />;
}

function TransferForm({
  bootstrap,
  defaultAccountId,
  defaultDestinationAccountId,
  onClose,
  onCreated,
  options,
}: TransferFormProps & { options: TransferFormOptions }) {
  const queryClient = useQueryClient();
  const [fromId, setFromId] = useState<string>(defaultAccountId ?? "");
  const [toId, setToId] = useState<string>(defaultDestinationAccountId ?? "");
  const [date, setDate] = useState(options.default_date);
  const [amount, setAmount] = useState("");
  const [rateOverride, setRateOverride] = useState("");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [rateMode, setRateMode] = useState<"convert" | "calculate">("convert");
  const [sourceFee, setSourceFee] = useState("");
  const [destinationFee, setDestinationFee] = useState("");
  const [tagIds, setTagIds] = useState<TagId[]>([]);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const from = options.accounts.find((account) => account.id === fromId);
  const to = options.accounts.find((account) => account.id === toId);
  const crossCurrency = from !== undefined && to !== undefined && from.currency !== to.currency;
  const rateQuery = useQuery({
    ...transferExchangeRateQueryOptions(bootstrap.apiPaths.transfers, fromId, toId, date),
    enabled: crossCurrency && date !== "",
  });
  const effectiveRate =
    rateMode === "calculate"
      ? Number(amount) > 0 && Number(destinationAmount) > 0
        ? String(Number(destinationAmount) / Number(amount))
        : ""
      : rateOverride !== ""
        ? rateOverride
        : (rateQuery.data ?? "");
  const text = options.text;
  const mutation = useMutation({
    mutationFn: () =>
      createTransfer(bootstrap.apiPaths.transfers, {
        from_account_id: fromId,
        to_account_id: toId,
        date,
        amount,
        ...(crossCurrency && effectiveRate !== "" ? { exchange_rate: effectiveRate } : {}),
        source_fee_amount: sourceFee || "0",
        destination_fee_amount: destinationFee || "0",
        tag_ids: tagIds,
        idempotency_key: idempotencyKey,
      }),
    onSuccess: async (transfer) => {
      await queryClient.invalidateQueries({ queryKey: ["spa"] });
      onCreated?.(transfer);
      onClose();
    },
  });
  function resetConversion() {
    setRateOverride("");
    setDestinationAmount("");
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!mutation.isPending) mutation.mutate();
      }}
    >
      {mutation.isError ? (
        <Alert title={mutation.error.message} variant="error">
          {null}
        </Alert>
      ) : null}
      <fieldset className="space-y-2" disabled={mutation.isPending}>
        <FormField
          as="select"
          id="transfer-from"
          label={text.from}
          required
          value={fromId}
          onChange={(event) => {
            setFromId(event.target.value);
            resetConversion();
          }}
        >
          <option value="">{text.select_account}</option>
          {options.accounts.map((account) => (
            <option key={account.id} value={account.id} disabled={account.id === toId}>
              {account.name} ({account.currency})
            </option>
          ))}
        </FormField>
        <FormField
          as="select"
          id="transfer-to"
          label={text.to}
          required
          value={toId}
          onChange={(event) => {
            setToId(event.target.value);
            resetConversion();
          }}
        >
          <option value="">{text.select_account}</option>
          {options.accounts.map((account) => (
            <option key={account.id} value={account.id} disabled={account.id === fromId}>
              {account.name} ({account.currency})
            </option>
          ))}
        </FormField>
        <FormField
          id="transfer-date"
          type="date"
          label={text.date}
          required
          max={options.default_date}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            resetConversion();
          }}
        />
        <FormField
          id="transfer-amount"
          type="number"
          label={`${text.source_amount}${from ? ` (${from.currency})` : ""}`}
          required
          min="0.00000001"
          step="0.00000001"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
        />
        <TagSelect
          bootstrap={bootstrap}
          tags={options.tags}
          selectedTagIds={tagIds}
          onSelect={setTagIds}
          triggerLabel={text.tags}
          disabled={mutation.isPending}
        />
        {crossCurrency ? (
          <section className="space-y-2">
            <div className="flex gap-2" role="tablist" aria-label={text.exchange_rate}>
              <Button
                type="button"
                role="tab"
                aria-selected={rateMode === "convert"}
                variant={rateMode === "convert" ? "secondary" : "ghost"}
                onClick={() => {
                  setRateMode("convert");
                }}
              >
                {text.convert_tab}
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={rateMode === "calculate"}
                variant={rateMode === "calculate" ? "secondary" : "ghost"}
                onClick={() => {
                  setRateMode("calculate");
                }}
              >
                {text.calculate_rate_tab}
              </Button>
            </div>
            {rateMode === "convert" ? (
              <FormField
                id="transfer-rate"
                type="number"
                label={text.exchange_rate}
                description={text.exchange_rate_help}
                min="0.00000000000001"
                step="any"
                required
                value={rateOverride !== "" ? rateOverride : (rateQuery.data ?? "")}
                onChange={(event) => {
                  setRateOverride(event.target.value);
                }}
              />
            ) : (
              <FormField
                id="transfer-destination-amount"
                type="number"
                label={`${text.destination_amount} (${to.currency})`}
                required
                min="0.00000001"
                step="0.00000001"
                value={destinationAmount}
                onChange={(event) => {
                  setDestinationAmount(event.target.value);
                }}
              />
            )}
            {rateQuery.isError && rateOverride === "" && rateMode === "convert" ? (
              <p role="alert" className="text-sm text-destructive">
                {rateQuery.error.message}
              </p>
            ) : null}
            {Number(amount) > 0 && Number(effectiveRate) > 0 ? (
              <output className="block text-sm text-secondary">
                {text.destination_amount}:{" "}
                {(Number(amount) * Number(effectiveRate)).toLocaleString(undefined, {
                  maximumFractionDigits: 8,
                })}{" "}
                {to.currency}
              </output>
            ) : null}
          </section>
        ) : null}
        <details className="rounded-lg border border-primary p-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            {text.bank_charges}
          </summary>
          <div className="space-y-2 pt-2">
            <FormField
              id="transfer-source-fee"
              type="number"
              label={`${text.outgoing_fee}${from ? ` (${from.currency})` : ""}`}
              min="0"
              step="any"
              value={sourceFee}
              onChange={(event) => {
                setSourceFee(event.target.value);
              }}
            />
            <FormField
              id="transfer-destination-fee"
              type="number"
              label={`${text.incoming_fee}${to ? ` (${to.currency})` : ""}`}
              min="0"
              step="any"
              value={destinationFee}
              onChange={(event) => {
                setDestinationFee(event.target.value);
              }}
            />
          </div>
        </details>
        <Button type="submit" disabled={options.accounts.length < 2 || mutation.isPending}>
          {text.submit}
        </Button>
      </fieldset>
    </form>
  );
}
