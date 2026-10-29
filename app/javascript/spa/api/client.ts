export function readCsrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
}

/** All SPA data requests share the public API, regardless of browser or token authentication. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/v1/"))
    throw new Error("SPA data requests must use the same-origin /api/v1 API");

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    headers.set("X-CSRF-Token", readCsrfToken());
    if (typeof init.body === "string" && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
  }

  return fetch(`${url.pathname}${url.search}`, {
    ...init,
    method,
    headers,
    credentials: "same-origin",
    mode: "same-origin",
    redirect: "error",
  });
}
