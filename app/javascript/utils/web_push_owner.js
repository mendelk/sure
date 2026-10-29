const OWNER_KEY = "sure:web-push-owner";

export async function subscriptionFingerprint(subscription) {
  const bytes = new TextEncoder().encode(subscription.endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function rememberWebPushOwner(userId, sessionId, subscription) {
  const fingerprint = await subscriptionFingerprint(subscription);
  try {
    localStorage.setItem(OWNER_KEY, JSON.stringify({ userId: String(userId), sessionId: String(sessionId), fingerprint }));
  } catch {
    // Storage may be blocked. Explicit enrollment still works without it.
  }
}

// The caller supplies its transport. This lifecycle never requests permission or
// creates a subscription; enrollment remains an explicit user gesture.
export function initializeWebPushOwnerSession({ userId, sessionId, enabled, configured, createUrl }, saveSubscription) {
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window)) return () => {};
  const serviceWorker = navigator.serviceWorker;
  let stopped = false;
  let running = false;
  const reconcile = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const registration = await serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription || stopped) return;
      let owner;
      try {
        owner = JSON.parse(localStorage.getItem(OWNER_KEY) || "null");
      } catch {
        return;
      }
      const fingerprint = await subscriptionFingerprint(subscription);
      const changedUser = owner && owner.userId !== String(userId);
      if (!enabled || (changedUser && !configured)) {
        if (!(await subscription.unsubscribe())) throw new Error("unsubscribe_failed");
        localStorage.removeItem(OWNER_KEY);
        window.dispatchEvent(new CustomEvent("web-push:renewed"));
        return;
      }
      if (!configured || (owner?.userId === String(userId) && owner?.sessionId === String(sessionId) && owner?.fingerprint === fingerprint)) return;
      try {
        await saveSubscription(createUrl, subscription);
      } catch (error) {
        // Do not leave an old account delivering private details after a switch.
        if (changedUser || !owner) await subscription.unsubscribe();
        throw error;
      }
      if (stopped) return;
      await rememberWebPushOwner(userId, sessionId, subscription);
      window.dispatchEvent(new CustomEvent("web-push:renewed"));
    } catch {
      // Explicit enrollment UI reports errors; background bookkeeping does not
      // produce desktop-shell/native alerts.
      window.dispatchEvent(new CustomEvent("web-push:reconcile-failed"));
    } finally {
      running = false;
    }
  };
  const message = (event) => {
    if (event.data?.type === "web-notifications:received") {
      window.dispatchEvent(new CustomEvent("web-notifications:received"));
    } else if (event.data?.type === "web-push:renewed") {
      void reconcile();
      window.dispatchEvent(new CustomEvent("web-push:changed"));
    }
  };
  serviceWorker.addEventListener("message", message);
  void reconcile();
  return () => {
    stopped = true;
    serviceWorker.removeEventListener("message", message);
  };
}
