import * as z from "zod/mini";

const SpaBootstrapSchema = z.object({
  currentUser: z.object({
    id: z.string(),
    name: z.string(),
    initials: z.string(),
    email: z.string(),
  }),
  embedded: z.optional(z.nullable(z.boolean())),
  recurringTransactionsDisabled: z.optional(z.nullable(z.boolean())),
  apiPaths: z.object({
    transactions: z.string(),
    recurringTransactions: z.optional(z.string()),
    summary: z.string(),
    accounts: z.string(),
    categories: z.string(),
    merchants: z.string(),
    tags: z.string(),
    transfers: z.string(),
    sureqlRun: z.string(),
  }),
  railsPaths: z.object({
    home: z.string(),
    logo: z.string(),
    accounts: z.string(),
    budgets: z.string(),
    dashboards: z.string(),
    imports: z.string(),
    newImport: z.string(),
    newTransaction: z.string(),
    reports: z.string(),
    settings: z.string(),
    changelog: z.string(),
    signOut: z.string(),
    transactions: z.string(),
    familyMerchants: z.string(),
    newRule: z.string(),
    recurringTransactions: z.optional(z.string()),
  }),
});

export type SpaBootstrap = z.infer<typeof SpaBootstrapSchema>;

export function readSpaBootstrap(): SpaBootstrap {
  const element = document.querySelector<HTMLScriptElement>("#spa-bootstrap");
  const textContent: unknown = element?.textContent;

  if (typeof textContent !== "string" || textContent.length === 0)
    throw new Error("SPA bootstrap data is missing");

  const payload: unknown = JSON.parse(textContent);
  return SpaBootstrapSchema.parse(payload);
}
