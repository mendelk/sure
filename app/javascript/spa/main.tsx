import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { readSpaBootstrap } from "./bootstrap";
import { createSpaRouter } from "./router";

const rootElement = document.querySelector<HTMLElement>("#spa-root");

if (!rootElement) throw new Error("SPA root element is missing");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

const router = createSpaRouter(readSpaBootstrap());

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
