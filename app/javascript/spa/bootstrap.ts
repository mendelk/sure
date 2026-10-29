import * as z from "zod/mini";
import { ICON_KEYS } from "./icon";
import { AccountIdSchema, UserIdSchema } from "./ids";

const SpaBootstrapSchema = z.object({
  navItems: z.array(
    z.object({
      label: z.string(),
      href: z.string(),
      icon: z.enum(ICON_KEYS),
      preview: z.optional(z.boolean()),
      mobileOnly: z.optional(z.boolean()),
    }),
  ),
  currentUser: z.object({
    id: UserIdSchema,
    name: z.string(),
    initials: z.string(),
    email: z.string(),
  }),
  embedded: z.optional(z.nullable(z.boolean())),
  recurringTransactionsDisabled: z.optional(z.nullable(z.boolean())),
  uncategorizedCount: z.optional(z.nullable(z.number())),
  notificationInbox: z.optional(z.nullable(z.object({ href: z.string(), label: z.string() }))),
  reportBuilderText: z.record(z.string(), z.string()),
  accountDetailText: z.record(z.string(), z.string()),
  bulkUpdateText: z.record(z.string(), z.string()),
  homeText: z.record(z.string(), z.string()),
  flashMessages: z.array(
    z.object({
      message: z.string(),
      variant: z.enum(["success", "error"]),
    }),
  ),
  transactionCreation: z.object({
    currencies: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        step: z.string(),
        minorUnitConversion: z.number(),
      }),
    ),
    accountCurrencies: z.record(z.string(), z.string()),
    defaultCurrency: z.string(),
    defaultAccountId: z.nullable(AccountIdSchema),
  }),
  transactionTransferMatchText: z.object({
    auto_matched: z.string(),
    auto_matched_short: z.string(),
    confirm_match: z.string(),
    reject_match: z.string(),
    transfer_confirmed: z.string(),
  }),
  apiPaths: z.object({
    home: z.string(),
    transactions: z.string(),
    recurringTransactions: z.optional(z.string()),
    summary: z.string(),
    accounts: z.string(),
    accountFormOptions: z.string(),
    properties: z.string(),
    propertyFormOptions: z.string(),
    categories: z.string(),
    merchants: z.string(),
    tags: z.string(),
    transfers: z.string(),
    sureqlRun: z.string(),
    chats: z.optional(z.string()),
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
    newTransfer: z.string(),
    newBulkUpdate: z.optional(z.string()),
    lifetimeProjection: z.string(),
    reports: z.string(),
    settings: z.string(),
    changelog: z.string(),
    transactions: z.string(),
    familyMerchants: z.string(),
    newRule: z.string(),
    recurringTransactions: z.optional(z.string()),
    rules: z.optional(z.string()),
    categories: z.optional(z.string()),
    tags: z.optional(z.string()),
    transactionsCategorize: z.optional(z.string()),
    chats: z.optional(z.string()),
    newChat: z.optional(z.string()),
  }),
  railsUrlTemplates: z.object({
    newTransactionSplit: z.string(),
    newTransactionTransferMatch: z.string(),
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
