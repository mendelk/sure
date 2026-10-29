import type { SpaTransaction } from "./api/transactions";

// Collapse transfer pairs to a single global-list row (pre-SPA ERB parity).
// The API returns both legs of a transfer, but the global list shows one
// "+/-" row per transfer: the outflow leg. The retired ERB `entries_by_date`
// helper dropped the inflow leg (`transfer_as_inflow`) and kept the outflow;
// the SPA row already renders transfer-kind rows as "+/-" under that same
// assumption.
//
// The outflow leg carries the positive entry amount, surfaced as the
// "expense" classification (inflows are "income"). A lone leg — counterpart
// filtered out, on another page, or inaccessible — renders as-is.
// Account-scoped lists only ever see one leg per transfer, so passing them
// through here is a no-op.
export function collapseTransferPairs(transactions: SpaTransaction[]): SpaTransaction[] {
  const keepByTransferId = new Map<string, SpaTransaction>();
  for (const transaction of transactions) {
    const transferId = transaction.transfer?.id;
    if (transferId === undefined) continue;
    const current = keepByTransferId.get(transferId);
    if (current === undefined || transaction.classification === "expense")
      keepByTransferId.set(transferId, transaction);
  }
  if (keepByTransferId.size === 0) return transactions;
  const emitted = new Set<string>();
  return transactions.filter((transaction) => {
    const transferId = transaction.transfer?.id;
    if (transferId === undefined) return true;
    if (keepByTransferId.get(transferId) !== transaction) return false;
    if (emitted.has(transferId)) return false;
    emitted.add(transferId);
    return true;
  });
}
