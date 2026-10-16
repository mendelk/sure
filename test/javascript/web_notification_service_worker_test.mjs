import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../app/views/pwa/service-worker.js", import.meta.url), "utf8");

function worker(windows = []) {
  const handlers = new Map();
  const notifications = [];
  const opened = [];
  const context = {
    URL,
    navigator: { onLine: false },
    fetch: async () => { throw new TypeError("offline"); },
    caches: { match: async () => "offline-page" },
    self: {
      location: { origin: "https://sure.example" },
      addEventListener: (name, handler) => handlers.set(name, handler),
      registration: { showNotification: async (title, options) => notifications.push({ title, options }) },
      clients: {
        matchAll: async () => windows,
        openWindow: async (url) => opened.push(url),
      },
    },
  };
  vm.runInNewContext(source, context);
  const invoke = async (name, values) => {
    let promise;
    handlers.get(name)({ ...values, waitUntil: (value) => { promise = value; } });
    await promise;
  };
  return { context, handlers, notifications, opened, invoke };
}

const payload = { title: "Sure notification", body: "Sign in to view it.", path: "/web_notifications", tag: "web-notification-123" };

test("push displays plain server text with stable replacement tags and signals open inboxes", async () => {
  const messages = [];
  const app = worker([{ postMessage: (message) => messages.push(message) }]);
  await app.invoke("push", { data: { json: () => payload } });
  await app.invoke("push", { data: { json: () => payload } });
  assert.equal(app.notifications.length, 2);
  assert.equal(app.notifications[0].options.tag, app.notifications[1].options.tag);
  assert.equal(app.notifications[0].options.renotify, false);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].type, "web-notifications:received");
});

test("push and click reject external or non-navigation destinations", async () => {
  for (const path of ["https://evil.example/steal", "//evil.example/steal", "/\\evil.example/steal", "javascript:alert(1)", null]) {
    const app = worker();
    await app.invoke("push", { data: { json: () => ({ ...payload, path }) } });
    assert.equal(app.notifications[0].options.data.path, "/web_notifications");
    await app.invoke("notificationclick", { notification: { close() {}, data: { path } } });
    assert.deepEqual(app.opened, ["https://sure.example/web_notifications"]);
  }
});

test("click reuses and focuses a same-origin application window", async () => {
  const navigated = [];
  let focused = 0;
  const client = { url: "https://sure.example/", postMessage() {},
    navigate: async (url) => { navigated.push(url); return client; },
    focus: async () => { focused++; } };
  const app = worker([client]);
  await app.invoke("notificationclick", { notification: { close() {}, data: { path: "/accounts/123?tab=activity" } } });
  assert.deepEqual(navigated, ["https://sure.example/accounts/123?tab=activity"]);
  assert.equal(focused, 1);
  assert.equal(app.opened.length, 0);
});

test("malformed push data never displays an undefined notification", async () => {
  const app = worker();
  await app.invoke("push", { data: { json: () => { throw new SyntaxError(); } } });
  await app.invoke("push", { data: { json: () => ({ title: {} }) } });
  await app.invoke("push", { data: null });
  assert.equal(app.notifications.length, 0);
});

test("existing offline navigation fallback remains active", async () => {
  const app = worker();
  let response;
  app.handlers.get("fetch")({ request: { mode: "navigate" }, respondWith: (value) => { response = value; } });
  assert.equal(await response, "offline-page");
});

test("subscription renewal only reuses an existing permission grant and notifies signed-in clients", async () => {
  const messages = [];
  const app = worker([{ postMessage: (message) => messages.push(message) }]);
  let subscriptions = 0;
  app.context.self.registration.pushManager = {
    permissionState: async () => "granted",
    subscribe: async () => { subscriptions++; },
  };
  await app.invoke("pushsubscriptionchange", { oldSubscription: { options: { applicationServerKey: "existing-key", userVisibleOnly: true } } });
  assert.equal(subscriptions, 1);
  assert.equal(messages[0].type, "web-push:renewed");
  app.context.self.registration.pushManager.permissionState = async () => "denied";
  await app.invoke("pushsubscriptionchange", { oldSubscription: { options: { applicationServerKey: "existing-key", userVisibleOnly: true } } });
  assert.equal(subscriptions, 1);
});
