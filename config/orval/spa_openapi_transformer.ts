import { defineTransformer } from "orval";

const SPA_TRANSACTION_PATH = "/api/spa/transactions";

export default defineTransformer((document) => {
  const transactionPath = document.paths?.[SPA_TRANSACTION_PATH];

  if (!transactionPath) {
    throw new Error(`${SPA_TRANSACTION_PATH} is missing from the OpenAPI document`);
  }

  return {
    ...document,
    paths: {
      [SPA_TRANSACTION_PATH]: transactionPath,
    },
  };
});
