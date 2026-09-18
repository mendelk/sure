import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage, validateTransactionSearch } from "../transactions-page";

export const Route = createFileRoute("/transactions")({
  validateSearch: validateTransactionSearch,
  component: TransactionsPage,
});
