import { initializeWebPushOwnerSession } from "./web_push_owner.js";
export { subscriptionFingerprint, rememberWebPushOwner } from "./web_push_owner.js";

export async function pushRequest(url, method, body) {
  const token = document.querySelector('meta[name="csrf-token"]')?.content;
  if (!token) throw new Error("request_failed");
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok || response.redirected) {
    const error = new Error("request_failed");
    error.publicMessage = typeof result.error === "string" ? result.error : null;
    throw error;
  }
  return result;
}

export function saveSubscription(createUrl, subscription) {
  return pushRequest(createUrl, "POST", { subscription: subscription.toJSON() });
}

export function initializeWebPushSession(options) {
  return initializeWebPushOwnerSession(options, saveSubscription);
}

