import { Button } from "./components/button";
import { Icon } from "./icon";
import { formatBaselineDate, type BaselineDiff } from "./lifetime-projection-storage";
import { Modal } from "./modal";

export function ProjectionBaselineRefreshModal({
  diff,
  isOpen,
  money,
  onClose,
  onConfirmRefresh,
}: {
  diff: BaselineDiff;
  isOpen: boolean;
  money: Intl.NumberFormat;
  onClose: () => void;
  onConfirmRefresh: () => void;
}) {
  const hasAdditions = diff.additions.length > 0;
  const hasRemovals = diff.removals.length > 0;
  const hasChanges = diff.changes.length > 0;
  const hasAccountDetails = hasAdditions || hasRemovals || hasChanges;

  return (
    <Modal
      ariaLabelledby="baseline-refresh-dialog-title"
      id="baseline-refresh-dialog"
      onClose={onClose}
      open={isOpen}
      panelClassName="w-full max-w-lg rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-container-inset p-2 text-secondary">
            <Icon name="refresh-ccw" size="md" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-primary" id="baseline-refresh-dialog-title">
              Refresh projection baseline?
            </h2>
            <p className="text-sm text-secondary">
              Adopt your live account balances as the starting baseline (Year 0) for this
              projection.
            </p>
          </div>
        </div>

        {/* Comparison Summary Card */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-secondary bg-container-inset p-3.5 text-xs">
          <div>
            <span className="font-medium uppercase tracking-wide text-secondary">
              Saved baseline
            </span>
            <div className="mt-1 text-base font-semibold tabular-nums text-primary privacy-sensitive">
              {money.format(diff.baselineNetWorth)}
            </div>
            <p className="mt-0.5 text-secondary">Captured {formatBaselineDate(diff.capturedAt)}</p>
          </div>

          <div>
            <span className="font-medium uppercase tracking-wide text-secondary">
              Current live finances
            </span>
            <div className="mt-1 text-base font-semibold tabular-nums text-primary privacy-sensitive">
              {money.format(diff.currentNetWorth)}
            </div>
            <p className="mt-0.5 font-medium text-primary tabular-nums privacy-sensitive">
              {diff.netWorthDelta >= 0 ? "+" : ""}
              {money.format(diff.netWorthDelta)} difference
            </p>
          </div>
        </div>

        {/* Detailed Account Changes Preview */}
        {hasAccountDetails ? (
          <div className="max-h-60 space-y-3 overflow-y-auto rounded-lg border border-secondary bg-container-inset/40 p-3.5 text-xs">
            {hasAdditions ? (
              <div className="space-y-1.5">
                <span className="font-medium uppercase tracking-wide text-secondary">
                  Added accounts ({diff.additions.length})
                </span>
                <ul className="space-y-1">
                  {diff.additions.map((account) => (
                    <li
                      className="flex items-center justify-between rounded-md bg-container px-2.5 py-1.5"
                      key={account.id}
                    >
                      <span className="font-medium text-primary">{account.name}</span>
                      <span className="tabular-nums text-primary privacy-sensitive">
                        {account.newBalance !== undefined ? money.format(account.newBalance) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hasRemovals ? (
              <div className="space-y-1.5">
                <span className="font-medium uppercase tracking-wide text-secondary">
                  Removed or closed accounts ({diff.removals.length})
                </span>
                <ul className="space-y-1">
                  {diff.removals.map((account) => (
                    <li
                      className="flex items-center justify-between rounded-md bg-container px-2.5 py-1.5 text-secondary"
                      key={account.id}
                    >
                      <span className="line-through">{account.name}</span>
                      <span className="tabular-nums privacy-sensitive">
                        {account.oldBalance !== undefined ? money.format(account.oldBalance) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hasChanges ? (
              <div className="space-y-1.5">
                <span className="font-medium uppercase tracking-wide text-secondary">
                  Balance changes ({diff.changes.length})
                </span>
                <ul className="space-y-1">
                  {diff.changes.map((account) => {
                    const delta = account.delta ?? 0;
                    return (
                      <li
                        className="flex items-center justify-between rounded-md bg-container px-2.5 py-1.5"
                        key={account.id}
                      >
                        <span className="font-medium text-primary">{account.name}</span>
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="text-secondary privacy-sensitive">
                            {account.oldBalance !== undefined
                              ? money.format(account.oldBalance)
                              : "—"}{" "}
                            →
                          </span>
                          <span className="font-medium text-primary privacy-sensitive">
                            {account.newBalance !== undefined
                              ? money.format(account.newBalance)
                              : "—"}
                          </span>
                          <span className="font-medium text-secondary privacy-sensitive">
                            ({delta >= 0 ? "+" : ""}
                            {money.format(delta)})
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {diff.unchanged.length > 0 ? (
              <p className="pt-1 text-center text-xs text-secondary">
                {diff.unchanged.length} other account
                {diff.unchanged.length === 1 ? "" : "s"} unchanged
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-secondary">
          Your projection horizon, annual income, annual spending, inflation, and return rate
          assumptions will be preserved. Only the starting balance and baseline reference date will
          be updated.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={onClose} size="sm" variant="secondary">
            Keep current baseline
          </Button>
          <Button onClick={onConfirmRefresh} size="sm" variant="primary">
            Update baseline
          </Button>
        </div>
      </div>
    </Modal>
  );
}
