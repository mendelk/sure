import { useQueryClient } from "@tanstack/react-query";
import { useState, type SyntheticEvent } from "react";
import { invalidateAccountQueries, uploadStatements } from "../api/account-spa";
import { Alert } from "./alert";
import { Button } from "./button";
import { FormField } from "./form-field";

export function StatementUploadForm({
  id,
  accept,
  accountId = "",
  accounts,
  label = "Statement files",
  hint,
  submitLabel = "Upload",
  onChanged,
}: {
  id: string;
  accept: string;
  accountId?: string;
  accounts?: { id: string; name: string }[];
  label?: string;
  hint: string;
  submitLabel?: string;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [selectedAccount, setSelectedAccount] = useState(accountId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (files.length === 0) {
      setError("Select at least one statement file.");
      return;
    }
    const form = event.currentTarget;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await uploadStatements(files, selectedAccount);
      const messages = [...result.errors];
      if (result.duplicate_count > 0) {
        messages.push(
          `${result.duplicate_count} duplicate statement file(s) already in the vault.`,
        );
      }

      setNotice(messages.length > 0 ? messages.join(" ") : "Statements uploaded.");
      form.reset();
      setFiles([]);
      setSelectedAccount(accountId);
      await invalidateAccountQueries(queryClient);
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {error !== null ? (
        <Alert live="alert" variant="error">
          {error}
        </Alert>
      ) : null}
      {notice !== null ? <output className="text-sm text-secondary">{notice}</output> : null}
      <FormField
        id={`${id}-files`}
        type="file"
        multiple
        required
        disabled={submitting}
        accept={accept}
        label={label}
        description={hint}
        onChange={(event) => {
          setFiles(Array.from(event.target.files ?? []));
        }}
      />
      {accounts !== undefined ? (
        <FormField
          as="select"
          id={`${id}-account`}
          label="Account"
          value={selectedAccount}
          disabled={submitting}
          onChange={(event) => {
            setSelectedAccount(event.target.value);
          }}
        >
          <option value="">Leave unmatched</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </FormField>
      ) : null}
      <Button disabled={submitting} type="submit" size="sm">
        {submitting ? "Uploading…" : submitLabel}
      </Button>
    </form>
  );
}
