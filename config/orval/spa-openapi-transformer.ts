import { defineTransformer } from "orval";

const TRANSACTION_PATH = "/api/v1/transactions";
const SHOW_PATH = "/api/v1/transactions/{id}";

export default defineTransformer((document) => {
  const transactionPath = document.paths?.[TRANSACTION_PATH];
  const showPath = document.paths?.[SHOW_PATH];

  if (!transactionPath?.get)
    throw new Error(`${TRANSACTION_PATH} GET is missing from the OpenAPI document`);

  if (!showPath?.get) throw new Error(`${SHOW_PATH} GET is missing from the OpenAPI document`);

  const transactionGet = transactionPath.get;
  const showGet = showPath.get;

  return {
    ...document,
    paths: {
      [TRANSACTION_PATH]: {
        get: transactionGet,
      },
      [SHOW_PATH]: {
        ...(showPath.parameters && { parameters: showPath.parameters }),
        get: showGet,
      },
    },
  };
});
