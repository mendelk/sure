import { DialogTitle } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import {
  conversionOptionsQueryOptions,
  convertTransaction,
  transactionDetailQueryOptions,
} from "./api/transactions";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { TransactionIdSchema, type TransactionId } from "./ids";
import { Modal } from "./modal";

export function validateTransactionConversionSearch(search: Record<string, unknown>): {
  activity_label?: "Buy" | "Sell";
} {
  return search.activity_label === "Buy" || search.activity_label === "Sell"
    ? { activity_label: search.activity_label }
    : {};
}

export function TransactionConversionPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const transactionId = TransactionIdSchema.parse(params.transactionId);
  return (
    <TransactionConversionDialog
      transactionId={transactionId}
      initialActivityLabel={validateTransactionConversionSearch(search).activity_label}
      onClose={() => {
        void navigate({
          to: "/transactions/$transactionId",
          params: { transactionId },
          search: true,
        });
      }}
      transactionsPath={bootstrap.apiPaths.transactions}
    />
  );
}

export function TransactionConversionDialog({
  transactionId,
  transactionsPath = "/api/v1/transactions",
  initialActivityLabel,
  onClose,
  onConverted,
}: {
  transactionId: TransactionId;
  transactionsPath?: string;
  initialActivityLabel?: "Buy" | "Sell";
  onClose: () => void;
  onConverted?: () => void;
}) {
  const queryClient = useQueryClient();
  const transaction = useQuery(transactionDetailQueryOptions(transactionsPath, transactionId));
  const options = useQuery(conversionOptionsQueryOptions(transactionId));
  const [securityQuery, setSecurityQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const securitySearch = useQuery({
    ...conversionOptionsQueryOptions(transactionId, submittedQuery),
    enabled: submittedQuery.length > 0,
  });
  const [securityId, setSecurityId] = useState("__custom__");
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [name, setName] = useState("");
  const [label, setLabel] = useState<string>(initialActivityLabel ?? "");
  const conversion = useMutation({
    mutationFn: () =>
      convertTransaction(transactionId, {
        security_id: securityId,
        custom_ticker: securityId === "__custom__" ? ticker : undefined,
        exchange_operating_mic: exchange || undefined,
        qty: qty || undefined,
        price: price || undefined,
        investment_activity_label: label || undefined,
        trade_name: name || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transaction"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
      ]);
      onConverted?.();
      onClose();
    },
  });
  const ready =
    transaction.isSuccess &&
    options.isSuccess &&
    transaction.data.permissions.can_edit &&
    !transaction.data.excluded;
  return (
    <Modal open onClose={onClose} panelClassName="w-full max-w-xl rounded-xl bg-container p-6">
      <DialogTitle className="text-lg font-medium text-primary">
        Convert cash transaction to trade
      </DialogTitle>
      <p className="my-3 text-sm text-secondary">
        Create a security trade and exclude the original cash transaction atomically. Enter
        quantity, price, or both; a missing value is calculated from the original amount.
      </p>
      {transaction.data ? (
        <p className="mb-3 text-sm text-primary">
          {transaction.data.name} · {transaction.data.date} ·{" "}
          <span className="privacy-sensitive">{transaction.data.amount}</span>
        </p>
      ) : null}
      {transaction.isPending || options.isPending ? (
        <output>Loading conversion options…</output>
      ) : null}
      {transaction.isError || options.isError ? (
        <Alert
          live="alert"
          variant="warning"
          title={transaction.error?.message ?? options.error?.message}
        >
          <Button
            onClick={() => {
              void transaction.refetch();
              void options.refetch();
            }}
          >
            Try again
          </Button>
        </Alert>
      ) : null}
      {transaction.data?.excluded === true ? (
        <Alert live="alert" variant="warning">
          This transaction is already excluded or converted.
        </Alert>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) conversion.mutate();
        }}
      >
        <FormField
          as="select"
          id="conversion-security"
          label="Security"
          value={securityId}
          onChange={(event) => {
            setSecurityId(event.target.value);
          }}
        >
          <option value="__custom__">Enter custom ticker</option>
          {options.data?.securities.map((security) => (
            <option key={security.id} value={security.id}>
              {security.ticker} · {security.name}
            </option>
          ))}
        </FormField>
        {securityId === "__custom__" ? (
          <>
            <FormField
              id="conversion-ticker"
              label="Ticker"
              required
              value={ticker}
              onChange={(event) => {
                setTicker(event.target.value);
              }}
            />
            <div className="flex items-end gap-2">
              <FormField
                id="conversion-search"
                label="Search securities"
                value={securityQuery}
                onChange={(event) => {
                  setSecurityQuery(event.target.value);
                }}
              />
              <Button
                type="button"
                disabled={!securityQuery.trim() || securitySearch.isFetching}
                onClick={() => {
                  setSubmittedQuery(securityQuery.trim());
                }}
                variant="outline"
              >
                Search
              </Button>
            </div>
            {securitySearch.isFetching ? <output>Searching securities…</output> : null}
            {securitySearch.isError ? (
              <Alert live="alert" variant="warning">
                {securitySearch.error.message}
              </Alert>
            ) : null}
            {securitySearch.data?.search_results.length === 0 ? (
              <p className="text-xs text-secondary">
                No provider results. You can enter a custom ticker above.
              </p>
            ) : null}
            {securitySearch.data?.search_results.map((security) => (
              <Button
                key={security.ticker}
                type="button"
                variant="outline"
                onClick={() => {
                  setTicker(security.ticker);
                  setExchange(security.exchange_operating_mic ?? "");
                }}
              >
                {security.symbol} · {security.name} · {security.exchange_operating_mic} ·{" "}
                {security.price_provider}
              </Button>
            ))}
            <FormField
              id="conversion-exchange"
              label="Exchange MIC (optional)"
              value={exchange}
              onChange={(event) => {
                setExchange(event.target.value);
              }}
            />
          </>
        ) : null}
        <FormField
          id="conversion-qty"
          label="Quantity"
          type="number"
          min="0.000001"
          step="any"
          value={qty}
          onChange={(event) => {
            setQty(event.target.value);
          }}
        />
        <FormField
          id="conversion-price"
          label="Price per unit"
          type="number"
          min="0.000001"
          step="any"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);
          }}
        />
        <FormField
          as="select"
          id="conversion-label"
          label="Investment activity"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        >
          <option value="">Infer buy or sell from cash direction</option>
          {options.data?.activity_labels.map((activity) => (
            <option key={activity} value={activity}>
              {activity}
            </option>
          ))}
        </FormField>
        <FormField
          id="conversion-name"
          label="Trade name (optional)"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {conversion.isError ? (
          <Alert live="alert" variant="warning">
            {conversion.error.message}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button type="submit" disabled={!ready || conversion.isPending || (!qty && !price)}>
            Convert to trade
          </Button>
        </div>
      </form>
    </Modal>
  );
}
