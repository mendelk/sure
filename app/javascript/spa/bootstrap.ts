import * as z from "zod/mini";

const SpaBootstrapSchema = z.object({
  currentUser: z.object({
    id: z.string(),
    name: z.string(),
  }),
  embedded: z.boolean(),
  apiPaths: z.object({
    transactions: z.string(),
  }),
  railsPaths: z.object({
    home: z.string(),
    imports: z.string(),
    newImport: z.string(),
    newTransaction: z.string(),
    reports: z.string(),
    transactions: z.string(),
  }),
});

export type SpaBootstrap = z.infer<typeof SpaBootstrapSchema>;

export function readSpaBootstrap(): SpaBootstrap {
  const element = document.querySelector<HTMLScriptElement>("#spa-bootstrap");

  if (
    element === null ||
    element.textContent === null ||
    element.textContent.length === 0
  ) {
    throw new Error("SPA bootstrap data is missing");
  }

  const payload: unknown = JSON.parse(element.textContent);
  return SpaBootstrapSchema.parse(payload);
}
