import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { TransactionIdSchema } from "../ids";
import { useState } from "react";
import { updateAccountActivity, type AccountActivity } from "../api/accounts";
import { Icon } from "../icon";
import { SearchablePicker } from "./searchable-picker";

type ActivityEntry = AccountActivity["groups"][number]["entries"][number];
const activityColors: Record<string, string> = {
  Buy: "var(--color-blue-500)",
  Sell: "var(--color-red-500)",
  Dividend: "var(--color-green-500)",
  Interest: "var(--color-green-500)",
  Contribution: "var(--color-violet-500)",
  Withdrawal: "var(--color-orange-500)",
  Reinvestment: "var(--color-blue-500)",
};

export function InvestmentActivityBadge({
  entry,
  text,
}: {
  entry: ActivityEntry;
  text: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const edit = entry.activity_edit;
  const value = entry.activity_label ?? "";
  const color = activityColors[value] ?? "var(--color-gray-500)";
  const mutation = useMutation({
    mutationFn: updateAccountActivity,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transaction"] }),
      ]);
    },
  });
  const badge = (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${value === "" ? "border-secondary bg-surface-inset text-secondary" : ""}`}
      style={
        value === ""
          ? undefined
          : {
              backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
              borderColor: `color-mix(in oklab, ${color} 25%, transparent)`,
              color,
            }
      }
    >
      {value === "" ? <Icon name="tag" className="size-3" /> : null}
      <span className="truncate">{entry.description ?? text.activity_type}</span>
      {edit !== null ? <Icon name="chevron-down" className="size-3" /> : null}
    </span>
  );
  if (edit === null) return badge;
  const options = [
    ...(value === "" ? [] : [{ label: text.activity_none, value: "" }]),
    ...entry.activity_options,
  ].filter((option) => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <SearchablePicker
      inline
      label={value === "" ? text.activity_type : `${text.activity_type}: ${entry.description}`}
      searchLabel={text.activity_search}
      query={query}
      onQueryChange={setQuery}
      selectedValues={[value]}
      options={options}
      disabled={mutation.isPending}
      error={mutation.isError ? text.activity_save_error : undefined}
      onSelect={async (label) => {
        if (label === value) return true;
        if (edit.convert_href !== null && (label === "Buy" || label === "Sell")) {
          await navigate({
            to: "/transactions/$transactionId/convert_to_trade",
            params: { transactionId: TransactionIdSchema.parse(edit.entryable_id) },
            search: { activity_label: label },
          });
          return true;
        }
        try {
          await mutation.mutateAsync({ edit, label });
          return true;
        } catch {
          return false;
        }
      }}
      trigger={badge}
    />
  );
}
