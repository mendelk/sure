import { Controller } from "@hotwired/stimulus";
import { pushRequest, rememberWebPushOwner, saveSubscription, subscriptionFingerprint } from "utils/web_push_session";

export default class extends Controller {
  static targets = ["status", "enable", "disable", "test", "devices", "guidance"];
  static values = {
    publicKey: String,
    configured: Boolean,
    enabled: Boolean,
    userId: String,
    sessionId: String,
    createUrl: String,
    messages: Object,
  };

  connect() {
    this.busy = false;
    void this.refresh();
  }

  async refresh(event) {
    if (event?.type === "web-push:renewed") {
      window.location.reload();
      return;
    }
    this.subscription = null;
    this.browser = null;
    this.supported = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    this.guidanceTarget.hidden = !(ios && !standalone);
    if (!window.isSecureContext) return this.setState("insecure");
    if (ios && !standalone) {
      this.supported = false;
      return this.setState("ios");
    }
    if (!this.supported) return this.setState("unsupported");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      this.subscription = await registration?.pushManager.getSubscription();
      if (this.subscription) {
        const fingerprint = await subscriptionFingerprint(this.subscription);
        this.browser = Array.from(this.devicesTarget.children).find((row) => row.dataset.endpointDigest === fingerprint && row.dataset.disabled !== "true");
        if (this.configuredValue && !this.sameKey(this.subscription.options.applicationServerKey, this.applicationServerKey())) this.browser = null;
        this.browser?.querySelector("[data-current-browser]")?.removeAttribute("hidden");
      }
      if (!this.enabledValue) this.setState("disabled");
      else if (!this.configuredValue) this.setState("unconfigured");
      else if (Notification.permission === "denied") this.setState("denied");
      else this.setState(this.browser ? "enabled" : this.subscription ? "revoked" : "not_enabled");
    } catch {
      this.setState("request_failed");
    }
  }

  async enable() {
    if (this.busy || !this.supported || !this.enabledValue || !this.configuredValue) return;
    this.busy = true;
    this.setState("working");
    let created = false;
    let subscription;
    try {
      // Permission must be requested directly from the user's click, not load.
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        this.setState(permission === "denied" ? "denied" : "dismissed");
        return;
      }
      await navigator.serviceWorker.register("/service-worker");
      const registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();
      const key = this.applicationServerKey();
      if (subscription && !this.sameKey(subscription.options.applicationServerKey, key)) {
        if (!(await subscription.unsubscribe())) throw new Error("unsubscribe_failed");
        this.subscription = null;
        this.browser = null;
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        created = true;
      }
      try {
        await saveSubscription(this.createUrlValue, subscription);
      } catch (error) {
        if (created) {
          const cleaned = await subscription.unsubscribe().catch(() => false);
          if (!cleaned) {
            this.subscription = subscription;
            throw new Error("cleanup_failed");
          }
          this.subscription = null;
        }
        throw error;
      }
      await rememberWebPushOwner(this.userIdValue, this.sessionIdValue, subscription);
      window.location.reload();
    } catch (error) {
      this.showError(error, "enroll_failed");
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }

  async disable() {
    if (this.busy || !this.subscription) return;
    this.busy = true;
    this.setState("working");
    try {
      if (!(await this.subscription.unsubscribe())) throw new Error("unsubscribe_failed");
      this.subscription = null;
      if (this.browser) {
        try {
          await pushRequest(this.browser.dataset.destroyUrl, "DELETE");
        } catch {
          this.browser = null;
          this.setState("revocation_failed");
          return;
        }
      }
      this.browser = null;
      window.location.reload();
    } catch (error) {
      this.showError(error, "unsubscribe_failed");
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }

  async test() {
    if (this.busy || !this.browser || !this.subscription) return;
    this.busy = true;
    this.setState("working");
    try {
      const result = await pushRequest(this.browser.dataset.testUrl, "POST", { confirmed: true, subscription: this.subscription.toJSON() });
      this.statusTarget.textContent = result.message;
    } catch (error) {
      this.showError(error, "request_failed");
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }

  reconcileFailed() {
    this.setState("request_failed");
  }

  applicationServerKey() {
    const base64 = this.publicKeyValue.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  }

  sameKey(existing, expected) {
    if (!existing) return false;
    const bytes = new Uint8Array(existing);
    return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
  }

  setState(key) {
    this.statusTarget.textContent = this.messagesValue[key] || this.messagesValue.request_failed;
    this.updateButtons();
  }

  showError(error, fallback) {
    // Only our own codes or localized same-origin JSON errors reach the page;
    // browser exception text can contain endpoints and must not be displayed.
    this.statusTarget.textContent = error.publicMessage || this.messagesValue[error.message] || this.messagesValue[fallback];
  }

  updateButtons() {
    this.enableTarget.disabled = this.busy || !this.supported || !this.enabledValue || !this.configuredValue || Boolean(this.browser) || (typeof Notification !== "undefined" && Notification.permission === "denied");
    this.disableTarget.disabled = this.busy || !this.subscription;
    this.testTarget.disabled = this.busy || !this.browser || !this.subscription || !this.enabledValue || !this.configuredValue;
  }
}
