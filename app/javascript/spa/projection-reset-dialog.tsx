import { Modal } from "./modal";
import { Button } from "./components/button";
import { Icon } from "./icon";

export function ProjectionResetDialog({
  isOpen,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      ariaLabelledby="reset-plan-dialog-title"
      id="reset-plan-dialog"
      onClose={onCancel}
      open={isOpen}
      panelClassName="w-full max-w-md rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-container-inset p-2 text-secondary">
            <Icon name="rotate-ccw" size="md" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-primary" id="reset-plan-dialog-title">
              Reset to starter plan?
            </h2>
            <p className="text-sm text-secondary">
              This will replace your custom assumptions saved in this browser with the standard
              starter plan.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg bg-container-inset p-3.5 text-xs text-secondary">
          <p className="font-medium text-primary">Local data that will be replaced:</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Horizon (reset to 30 years), annual income ($80,000), and annual spending ($60,000)
            </li>
            <li>Inflation rate (2.5% / year) and investment return (5.0% / year)</li>
            <li>Saved baseline balance and any unapplied edits in this browser</li>
          </ul>
          <p className="pt-1 text-xs text-secondary">
            Your live accounts, transactions, and family finances will remain unchanged.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={onCancel} size="sm" variant="secondary">
            Cancel
          </Button>
          <Button onClick={onConfirm} size="sm" variant="destructive">
            Reset plan
          </Button>
        </div>
      </div>
    </Modal>
  );
}
