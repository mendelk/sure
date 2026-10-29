import { DialogTitle } from "@headlessui/react";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import * as z from "zod/mini";
import { apiFetch } from "../api/client";
import { Modal } from "../modal";
import { Alert } from "./alert";
import { Button } from "./button";

const ProvidersSchema = z.object({
  providers: z.array(
    z.object({
      name: z.string(),
      key: z.string(),
      description: z.nullable(z.string()),
      path: z.string(),
    }),
  ),
  text: z.object({ title: z.string(), description: z.string(), no_providers: z.string() }),
});

export function AccountProviderPicker({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const text = bootstrap.accountDetailText;
  const query = useQuery({
    queryKey: ["spa", "account-provider-options", accountId],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(
        `/api/v1/accounts/${encodeURIComponent(accountId)}/provider_options`,
        { signal },
      );
      if (!response.ok) throw new Error(text.unavailable);
      return ProvidersSchema.parse(await response.json());
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary">
        {query.data?.text.title ?? text.accountable_provider_title}
      </DialogTitle>
      {query.isPending ? <p className="my-4 text-sm text-secondary">{text.loading}</p> : null}
      {query.isError ? (
        <Alert variant="error" live="alert">
          <p>{query.error.message}</p>
        </Alert>
      ) : null}
      {query.data ? (
        <p className="my-4 text-sm text-secondary">{query.data.text.description}</p>
      ) : null}
      {query.data?.providers.length === 0 ? (
        <p className="my-4 text-sm text-secondary">{query.data.text.no_providers}</p>
      ) : null}
      <ul className="my-4 space-y-2">
        {query.data?.providers.map((provider) => (
          <li key={provider.key}>
            <a
              className="block rounded-lg border border-primary p-3 text-sm text-primary hover:bg-container-hover"
              href={provider.path}
            >
              <span className="font-medium">{provider.name}</span>
              {provider.description !== null && provider.description !== "" ? (
                <p className="mt-1 text-secondary">{provider.description}</p>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {text.cancel}
        </Button>
      </div>
    </Modal>
  );
}
