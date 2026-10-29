import { DialogTitle } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { duplicateCandidatesQueryOptions, mergePostedTransaction } from "./api/transactions";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { Modal } from "./modal";
import type { TransactionId } from "./ids";

export function ManualDuplicateMergeDialog({
  transactionId,
  onClose,
  onMerged,
}: {
  transactionId: TransactionId;
  onClose: () => void;
  onMerged?: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState("");
  const queryClient = useQueryClient();
  const candidates = useQuery(duplicateCandidatesQueryOptions(transactionId, offset));
  const merge = useMutation({
    mutationFn: () => mergePostedTransaction(transactionId, selected),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transaction"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
      ]);
      onMerged?.();
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} panelClassName="w-full max-w-xl rounded-xl bg-container p-6">
      <DialogTitle className="text-lg font-medium text-primary">
        Merge pending transaction
      </DialogTitle>
      <p className="my-3 text-sm text-secondary">
        Choose its posted version in this account. The posted transaction survives, retaining the
        pending date and category. The pending transaction is removed.
      </p>
      {candidates.isPending ? <output>Loading posted transactions…</output> : null}
      {candidates.isError ? (
        <Alert live="alert" variant="warning" title={candidates.error.message}>
          <Button onClick={() => void candidates.refetch()}>Try again</Button>
        </Alert>
      ) : null}
      {candidates.data?.candidates.length === 0 ? (
        <p className="text-sm text-secondary">No eligible posted transactions.</p>
      ) : null}
      <div className="my-4 space-y-2">
        {candidates.data?.candidates.map((candidate) => (
          <label
            key={candidate.entry_id}
            className="flex items-center gap-3 rounded-lg border border-primary p-3 text-sm text-primary"
          >
            <input
              type="radio"
              name="posted-entry"
              value={candidate.entry_id}
              checked={selected === candidate.entry_id}
              disabled={merge.isPending}
              onChange={() => {
                setSelected(candidate.entry_id);
              }}
            />
            <span className="grow">
              {candidate.name}
              <span className="block text-xs text-secondary">{candidate.date}</span>
            </span>
            <span className="privacy-sensitive">{candidate.amount}</span>
          </label>
        ))}
      </div>
      {merge.isError ? (
        <Alert live="alert" variant="warning">
          {merge.error.message}
        </Alert>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={offset === 0 || candidates.isFetching || merge.isPending}
          onClick={() => {
            setOffset(Math.max(0, offset - 10));
            setSelected("");
          }}
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={candidates.data?.has_more !== true || candidates.isFetching || merge.isPending}
          onClick={() => {
            setOffset(offset + 10);
            setSelected("");
          }}
          variant="outline"
        >
          Next
        </Button>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button
          disabled={!selected || merge.isPending}
          onClick={() => {
            merge.mutate();
          }}
        >
          Merge transactions
        </Button>
      </div>
    </Modal>
  );
}
