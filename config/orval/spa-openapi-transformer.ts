import { defineTransformer } from "orval";

const TRANSACTION_PATH = "/api/v1/transactions";
const SHOW_PATH = "/api/v1/transactions/{id}";
const CANDIDATES_PATH = "/api/v1/transactions/{transaction_id}/transfer_match_candidates";
const MATCH_PATH = "/api/v1/transactions/{transaction_id}/transfer_match";
const TRANSFER_SHOW_PATH = "/api/v1/transfers/{id}";

export default defineTransformer((document) => {
  const transactionPath = document.paths?.[TRANSACTION_PATH];
  const showPath = document.paths?.[SHOW_PATH];
  const candidatesPath = document.paths?.[CANDIDATES_PATH];
  const matchPath = document.paths?.[MATCH_PATH];
  const transferShowPath = document.paths?.[TRANSFER_SHOW_PATH];

  if (!transactionPath?.get)
    throw new Error(`${TRANSACTION_PATH} GET is missing from the OpenAPI document`);

  if (!transactionPath?.post)
    throw new Error(`${TRANSACTION_PATH} POST is missing from the OpenAPI document`);

  if (!showPath?.get) throw new Error(`${SHOW_PATH} GET is missing from the OpenAPI document`);

  if (!showPath?.patch) throw new Error(`${SHOW_PATH} PATCH is missing from the OpenAPI document`);

  if (!candidatesPath?.get)
    throw new Error(`${CANDIDATES_PATH} GET is missing from the OpenAPI document`);

  if (!matchPath?.post) throw new Error(`${MATCH_PATH} POST is missing from the OpenAPI document`);

  if (!transferShowPath?.get && !transferShowPath?.patch)
    throw new Error(`${TRANSFER_SHOW_PATH} is missing from the OpenAPI document`);

  const transactionGet = transactionPath.get;
  const transactionPost = transactionPath.post;
  const showGet = showPath.get;
  const showPatch = showPath.patch;
  const candidatesGet = candidatesPath.get;
  const matchPost = matchPath.post;
  const transferShowPatch = transferShowPath.patch;

  return {
    ...document,
    paths: {
      [TRANSACTION_PATH]: {
        get: transactionGet,
        post: transactionPost,
      },
      [SHOW_PATH]: {
        ...(showPath.parameters && { parameters: showPath.parameters }),
        get: showGet,
        patch: showPatch,
      },
      [CANDIDATES_PATH]: {
        ...(candidatesPath.parameters && { parameters: candidatesPath.parameters }),
        get: candidatesGet,
      },
      [MATCH_PATH]: {
        ...(matchPath.parameters && { parameters: matchPath.parameters }),
        post: matchPost,
      },
      [TRANSFER_SHOW_PATH]: {
        ...(transferShowPath.parameters && { parameters: transferShowPath.parameters }),
        patch: transferShowPatch,
      },
    },
  };
});
