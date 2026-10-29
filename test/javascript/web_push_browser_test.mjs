import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ownerSource = await readFile(new URL("../../app/javascript/utils/web_push_owner.js", import.meta.url), "utf8");
const ownerUrl = `data:text/javascript;base64,${Buffer.from(ownerSource).toString("base64")}`;
const owner = await import(ownerUrl);
const moduleSource = (await readFile(new URL("../../app/javascript/utils/web_push_session.js", import.meta.url), "utf8"))
  .replaceAll('"./web_push_owner.js"', JSON.stringify(ownerUrl));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
const shared = await import(moduleUrl);
const stimulusUrl = "data:text/javascript,export class Controller {}";
const controllerSource = (await readFile(new URL("../../app/javascript/controllers/web_push_controller.js", import.meta.url), "utf8"))
  .replace('"@hotwired/stimulus"', JSON.stringify(stimulusUrl))
  .replace('"utils/web_push_session"', JSON.stringify(moduleUrl));
const { default: BrowserController } = await import(`data:text/javascript;base64,${Buffer.from(controllerSource).toString("base64")}`);

function environment(t) {
  const keys = ["window", "document", "navigator", "Notification", "localStorage", "fetch", "crypto", "CustomEvent"];
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const install = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const requests = [];
  const storage = new Map();
  const calls = { permission: 0, subscribed: 0, unsubscribed: 0, reloaded: 0 };
  const browserSubscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/current-browser",
    options: { applicationServerKey: Uint8Array.from([1, 2, 3]).buffer },
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "current-public-key", auth: "current-auth" } }; },
    unsubscribe: async () => { calls.unsubscribed++; return true; },
  };
  let existing = null;
  const registration = { pushManager: {
    getSubscription: async () => existing,
    subscribe: async () => { calls.subscribed++; existing = browserSubscription; return existing; },
  } };
  const serviceWorker = new EventTarget();
  Object.assign(serviceWorker, { getRegistration: async () => registration, ready: Promise.resolve(registration), register: async () => registration });
  const browserWindow = new EventTarget();
  Object.assign(browserWindow, { isSecureContext: true, PushManager: class {}, Notification: {},
    matchMedia: () => ({ matches: false }), location: { reload: () => { calls.reloaded++; } } });
  install("window", browserWindow);
  install("navigator", { userAgent: "Test browser", platform: "Linux", maxTouchPoints: 0, serviceWorker });
  install("document", { querySelector: () => ({ content: "session-csrf-token" }) });
  install("Notification", { permission: "default", requestPermission: async () => { calls.permission++; return "granted"; } });
  install("localStorage", { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) });
  install("crypto", { subtle: { digest: async (_algorithm, bytes) => new Uint8Array(createHash("sha256").update(bytes).digest()).buffer } });
  install("CustomEvent", class extends Event { constructor(type, options) { super(type); this.detail = options?.detail; } });
  install("fetch", async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 201, redirected: false, json: async () => ({ id: "browser-id", status: null }) };
  });
  return { requests, calls, browserSubscription, registration, serviceWorker, storage,
    setExisting: (value) => { existing = value; } };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function controller() {
  const instance = new BrowserController();
  const messages = ["checking", "enabled", "not_enabled", "revoked", "working", "request_failed", "enroll_failed", "cleanup_failed", "denied", "insecure", "unsupported", "disabled", "unconfigured", "ios", "dismissed", "unsubscribe_failed", "revocation_failed"];
  Object.assign(instance, {
    publicKeyValue: "AQID", enabledValue: true, configuredValue: true, userIdValue: "user-1", sessionIdValue: "session-1", createUrlValue: "/web_push_subscriptions",
    messagesValue: Object.fromEntries(messages.map((key) => [key, key])),
    statusTarget: { textContent: "" }, enableTarget: {}, disableTarget: {}, testTarget: {}, guidanceTarget: {}, devicesTarget: { children: [] },
    supported: true, busy: false, subscription: null, browser: null,
  });
  return instance;
}

test("loading enrollment checks support without requesting permission or subscribing", async (t) => {
  const env = environment(t);
  const ui = controller();
  await ui.refresh();
  assert.equal(env.calls.permission, 0);
  assert.equal(env.calls.subscribed, 0);
  assert.equal(env.requests.length, 0);
  assert.equal(ui.statusTarget.textContent, "not_enabled");
});

test("a user gesture enrolls the real PushManager subscription with session CSRF", async (t) => {
  const env = environment(t);
  const ui = controller();
  await ui.enable();
  assert.equal(env.calls.permission, 1);
  assert.equal(env.calls.subscribed, 1);
  assert.equal(env.calls.reloaded, 1);
  assert.equal(env.requests[0].options.headers["X-CSRF-Token"], "session-csrf-token");
  assert.deepEqual(JSON.parse(env.requests[0].options.body), { subscription: env.browserSubscription.toJSON() });
});

test("denied permission never creates or saves a browser subscription", async (t) => {
  const env = environment(t);
  Notification.requestPermission = async () => "denied";
  const ui = controller();
  await ui.enable();
  assert.equal(env.calls.subscribed, 0);
  assert.equal(env.requests.length, 0);
  assert.equal(ui.statusTarget.textContent, "denied");
  assert.equal(ui.testTarget.disabled, true);
});

test("server save failure rolls back a newly created browser subscription", async (t) => {
  const env = environment(t);
  globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ error: "Localized server save error" }) });
  const ui = controller();
  await ui.enable();
  assert.equal(env.calls.unsubscribed, 1);
  assert.equal(env.calls.reloaded, 0);
  assert.equal(ui.statusTarget.textContent, "Localized server save error");
  assert.equal(ui.testTarget.disabled, true);
});

test("failed rollback visibly offers local cleanup rather than claiming enrollment", async (t) => {
  const env = environment(t);
  env.browserSubscription.unsubscribe = async () => false;
  globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({}) });
  const ui = controller();
  await ui.enable();
  assert.equal(ui.statusTarget.textContent, "cleanup_failed");
  assert.equal(ui.disableTarget.disabled, false);
  assert.equal(ui.testTarget.disabled, true);
});

test("test button supplies only the active browser's subscription proof", async (t) => {
  const env = environment(t);
  const ui = controller();
  ui.browser = { dataset: { testUrl: "/web_push_subscriptions/current/test" } };
  ui.subscription = env.browserSubscription;
  await ui.test();
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].url, "/web_push_subscriptions/current/test");
  assert.deepEqual(JSON.parse(env.requests[0].options.body), { confirmed: true, subscription: env.browserSubscription.toJSON() });
});

test("an account switch resaves an existing subscription without prompting permission", async (t) => {
  const env = environment(t);
  env.setExisting(env.browserSubscription);
  await shared.rememberWebPushOwner("old-user", "old-session", env.browserSubscription);
  const cleanup = shared.initializeWebPushSession({ userId: "new-user", sessionId: "new-session", enabled: true, configured: true, createUrl: "/web_push_subscriptions" });
  t.after(cleanup);
  await settle();
  assert.equal(env.requests.length, 1);
  assert.equal(env.calls.permission, 0);
  assert.equal(env.calls.subscribed, 0);
});

test("switching to an opted-out user unsubscribes the old account's local endpoint", async (t) => {
  const env = environment(t);
  env.setExisting(env.browserSubscription);
  await shared.rememberWebPushOwner("old-user", "old-session", env.browserSubscription);
  const cleanup = shared.initializeWebPushSession({ userId: "new-user", sessionId: "new-session", enabled: false, configured: true, createUrl: "/web_push_subscriptions" });
  t.after(cleanup);
  await settle();
  assert.equal(env.calls.unsubscribed, 1);
  assert.equal(env.requests.length, 0);
  assert.equal(env.calls.permission, 0);
});

test("normal visits do not silently re-enable a remotely revoked registration", async (t) => {
  const env = environment(t);
  env.setExisting(env.browserSubscription);
  await shared.rememberWebPushOwner("same-user", "same-session", env.browserSubscription);
  const cleanup = shared.initializeWebPushSession({ userId: "same-user", sessionId: "same-session", enabled: true, configured: true, createUrl: "/web_push_subscriptions" });
  t.after(cleanup);
  await settle();
  assert.equal(env.requests.length, 0);
});

test("a browser-renewed endpoint is saved for its existing owner without requesting permission", async (t) => {
  const env = environment(t);
  env.setExisting(env.browserSubscription);
  await shared.rememberWebPushOwner("same-user", "same-session", env.browserSubscription);
  env.browserSubscription.endpoint = "https://fcm.googleapis.com/fcm/send/renewed-browser";
  const cleanup = shared.initializeWebPushSession({ userId: "same-user", sessionId: "same-session", enabled: true, configured: true, createUrl: "/web_push_subscriptions" });
  t.after(cleanup);
  await settle();
  assert.equal(env.requests.length, 1);
  assert.equal(JSON.parse(env.requests[0].options.body).subscription.endpoint, env.browserSubscription.endpoint);
  assert.equal(env.calls.permission, 0);
});

test("failed account-switch registration removes the old user's local subscription", async (t) => {
  const env = environment(t);
  env.setExisting(env.browserSubscription);
  await shared.rememberWebPushOwner("old-user", "old-session", env.browserSubscription);
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const cleanup = shared.initializeWebPushSession({ userId: "new-user", sessionId: "new-session", enabled: true, configured: true, createUrl: "/web_push_subscriptions" });
  t.after(cleanup);
  await settle();
  assert.equal(env.calls.unsubscribed, 1);
  assert.equal(env.calls.permission, 0);
});

test("a new login for the same user rebinds the browser to the new session", async (t) => {
  const env = environment(t);
  env.setExisting(env.browserSubscription);
  await shared.rememberWebPushOwner("same-user", "old-session", env.browserSubscription);
  const cleanup = shared.initializeWebPushSession({ userId: "same-user", sessionId: "new-session", enabled: true, configured: true, createUrl: "/web_push_subscriptions" });
  t.after(cleanup);
  await settle();
  assert.equal(env.requests.length, 1);
  assert.equal(env.calls.permission, 0);
  assert.equal(JSON.parse(env.storage.get("sure:web-push-owner")).sessionId, "new-session");
});

test("browser owner reconciliation uses the supplied API transport without legacy requests", async (t) => {
  const env = environment(t);
  env.setExisting(env.browserSubscription);
  await owner.rememberWebPushOwner("old-user", "old-session", env.browserSubscription);
  const registrations = [];
  const cleanup = owner.initializeWebPushOwnerSession({
    userId: "new-user", sessionId: "new-session", enabled: true, configured: true,
    createUrl: "/api/v1/web_push_subscriptions",
  }, async (url, subscription) => { registrations.push({ url, subscription }); });
  t.after(cleanup);
  await settle();
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].url, "/api/v1/web_push_subscriptions");
  assert.equal(registrations[0].subscription, env.browserSubscription);
  assert.equal(env.requests.length, 0);
  assert.equal(env.calls.permission, 0);
  assert.equal(env.calls.subscribed, 0);
  assert.equal(JSON.parse(env.storage.get("sure:web-push-owner")).userId, "new-user");
});

test("failed API ownership transfer removes the previous user's local subscription", async (t) => {
  const env = environment(t);
  env.setExisting(env.browserSubscription);
  await owner.rememberWebPushOwner("old-user", "old-session", env.browserSubscription);
  let failures = 0;
  window.addEventListener("web-push:reconcile-failed", () => { failures++; });
  const cleanup = owner.initializeWebPushOwnerSession({
    userId: "new-user", sessionId: "new-session", enabled: true, configured: true,
    createUrl: "/api/v1/web_push_subscriptions",
  }, async () => { throw new Error("API denied registration"); });
  t.after(cleanup);
  await settle();
  assert.equal(env.calls.unsubscribed, 1);
  assert.equal(failures, 1);
  assert.equal(env.requests.length, 0);
  assert.equal(JSON.parse(env.storage.get("sure:web-push-owner")).userId, "old-user");
});
