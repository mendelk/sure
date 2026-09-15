import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { readSpaBootstrap } from "./bootstrap";
import { createSpaRouter } from "./router";

const rootElement = document.querySelector<HTMLElement>("#spa-root");

if (!rootElement) {
  throw new Error("SPA root element is missing");
}

const router = createSpaRouter(readSpaBootstrap());

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
