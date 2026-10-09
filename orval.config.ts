import { defineConfig } from "orval";
import brandSpaApiIds from "./config/orval/spa-id-branding";

export default defineConfig({
  spaTransactions: {
    hooks: {
      afterAllFilesWrite: brandSpaApiIds,
    },
    input: {
      target: "./docs/api/openapi.yaml",
      override: {
        transformer: "./config/orval/spa-openapi-transformer.ts",
      },
      filters: {
        mode: "include",
        tags: ["Transactions"],
      },
    },
    output: {
      client: "zod",
      mode: "single",
      target: "./app/javascript/spa/api/generated.ts",
      override: {
        zod: {
          generateEachHttpStatus: true,
          useBrandedTypes: true,
          strict: {
            response: true,
          },
          variant: "mini",
          version: 4,
        },
      },
    },
  },
});
