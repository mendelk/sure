import { defineTransformer } from "orval";

const TRANSACTION_PATH = "/api/v1/transactions";

export default defineTransformer((document) => {
  const transactionPath = document.paths?.[TRANSACTION_PATH];

  if (!transactionPath) {
    throw new Error(`${TRANSACTION_PATH} is missing from the OpenAPI document`);
  }

  return {
    ...document,
    paths: {
      [TRANSACTION_PATH]: {
        get: transactionPath.get,
      },
    },
  };
});
