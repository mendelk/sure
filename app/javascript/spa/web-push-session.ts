import {
  initializeWebPushOwnerSession,
  type WebPushSessionOptions,
} from "../utils/web_push_owner.js";
import { apiFetch } from "./api/client";

async function saveSubscription(url: string, subscription: PushSubscription): Promise<void> {
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error("request_failed");
}

export function initializeWebPushSession(options: WebPushSessionOptions): () => void {
  return initializeWebPushOwnerSession(options, saveSubscription);
}
