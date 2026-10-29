import { z } from "zod";
import { apiFetch } from "./client";

const text = z.union([z.string(), z.number()]).transform(String);
const optionalText = text.nullish().transform((value) => value ?? "");
const optionSchema = z.object({ label: z.string(), value: z.string() });
export const providerFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean().default(false),
  configured: z.boolean().default(false),
  value: z.union([z.string(), z.number(), z.boolean()]).nullish(),
  options: z.array(optionSchema).default([]),
});
export type ProviderField = z.infer<typeof providerFieldSchema>;
const actionSchema = z.object({
  name: z.string(),
  label: z.string(),
  fields: z.array(providerFieldSchema),
});
export type ProviderAction = z.infer<typeof actionSchema>;
export const providerConfigurationSchema = z.object({
  provider: z.string(),
  item_id: z.string().nullable(),
  name: z.string(),
  fields: z.array(providerFieldSchema),
  authorization: z.object({
    kind: z.string(),
    href: optionalText,
    authorization_href: optionalText,
    flows: z
      .array(z.object({ name: z.string(), href: optionalText, action: optionalText }))
      .default([]),
  }),
  actions: z.array(actionSchema),
});
export type ProviderConfiguration = z.infer<typeof providerConfigurationSchema>;
const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: optionalText,
  balance: optionalText,
  linked_account_id: optionalText,
  linked_account_name: optionalText,
  accountable_type: optionalText,
  allowed_accountable_types: z.array(z.string()),
  suggested_subtype: optionalText,
  sync_start_date: optionalText,
  linkable_account_ids: z.array(z.string()),
});
export const providerSetupSchema = z.object({
  accounts: z.array(accountSchema),
  unlinked_accounts: z.array(accountSchema),
  linked_accounts: z.array(accountSchema),
  account_types: z.array(optionSchema.extend({ subtypes: z.array(optionSchema) })),
  linkable_accounts: z.array(z.object({ id: z.string(), name: z.string() })),
  owners: z.array(z.object({ id: z.string(), name: z.string() })),
  default_owner_id: z.string(),
  supports_account_sync_start_date: z.boolean(),
  supports_sync_start_date: z.boolean(),
  sync_start_date: optionalText,
  supports_setup: z.boolean(),
  syncing: z.boolean(),
  stale_accounts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      linked_account_id: z.string(),
      linked_account_name: z.string(),
    }),
  ),
});
export type ProviderSetup = z.infer<typeof providerSetupSchema>;
export const providerStatusSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  status: optionalText,
  sync: z.object({ syncing: z.boolean() }),
});
export const providerStatusesSchema = z.array(providerStatusSchema);
export const providerWorkspaceSchema = z.object({
  connection: providerStatusSchema,
  configuration: providerConfigurationSchema,
  setup: providerSetupSchema,
});
export const providerMetadataSchema = z.union([
  providerWorkspaceSchema,
  providerConfigurationSchema,
]);
export const providerBrokeragesSchema = z.array(
  z.object({
    authorization_id: z.string(),
    brokerage_name: optionalText,
    accounts: z.array(z.object({ id: z.string(), name: z.string(), linked: z.boolean() })),
  }),
);
const warningSchema = z.union([
  z.string().transform((message) => ({ message })),
  z.object({ message: z.string() }),
]);
const exchangeFieldSchema = z.object({ key: z.string(), label: optionalText, name: optionalText });
export const providerActionResultSchema = z.object({
  id: optionalText,
  item_id: optionalText,
  link_token: optionalText,
  status: optionalText,
  chain: optionalText,
  address: optionalText,
  flow_token: optionalText,
  user_code: optionalText,
  authorization_url: optionalText,
  verification_uri: optionalText,
  verification_uri_complete: optionalText,
  qr_code_image: optionalText,
  public_key: optionalText,
  credential: optionalText,
  assets_truncated: z.boolean().default(false),
  challenge: z
    .object({
      security_questions: z.array(z.string()).default([]),
      token_methods: z.array(z.string()).default([]),
      captcha_image: optionalText,
      token_read: optionalText,
      token_sent: z.boolean().default(false),
    })
    .nullish(),
  assets: z
    .array(
      z.object({
        key: z.string(),
        name: z.string(),
        symbol: z.string(),
        quantity: text,
        preselected: z.boolean(),
        tracked: z.boolean(),
      }),
    )
    .default([]),
  chains: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
  profiles: z.array(z.object({ id: text, type: optionalText })).default([]),
  institutions: z
    .array(
      z
        .object({
          InstitutionID: optionalText,
          InstitutionName: optionalText,
          id: optionalText,
          name: optionalText,
        })
        .transform((entry) => ({
          id: entry.InstitutionID !== "" ? entry.InstitutionID : entry.id,
          name: entry.InstitutionName !== "" ? entry.InstitutionName : entry.name,
        })),
    )
    .default([]),
  blockchains: z
    .array(z.tuple([text, text]).transform(([label, value]) => ({ label, value, name: label })))
    .default([]),
  exchanges: z
    .array(
      z.object({
        connection_id: text,
        name: z.string(),
        connection_fields: z.array(exchangeFieldSchema).default([]),
      }),
    )
    .default([]),
  banks: z
    .array(z.object({ name: z.string(), psu_types: z.array(z.string()).default([]) }))
    .default([]),
  warnings: z.array(warningSchema).default([]),
});
export type ProviderActionResult = z.infer<typeof providerActionResultSchema>;
export const emptyProviderActionResult = providerActionResultSchema.parse({});

export function providerConnectionPath(provider: string, id?: string) {
  const suffix = id === undefined || id === "" ? "" : `/${encodeURIComponent(id)}`;
  return `/api/v1/provider_connections/${encodeURIComponent(provider)}${suffix}`;
}

export async function providerRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await apiFetch(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ message: z.string().optional() }).safeParse(payload);
    throw new Error(
      error.success
        ? (error.data.message ?? "The provider request failed")
        : "The provider request failed",
    );
  }
  return z.object({ data: schema }).parse(payload).data;
}
