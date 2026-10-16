const CACHE_VERSION = 'v1';
const OFFLINE_ASSETS = [
  '/offline.html',
  '/logo-offline.svg'
];

// Install event - cache the offline page and assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(OFFLINE_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve offline page when network fails
self.addEventListener('fetch', (event) => {
  // Handle navigation requests (page loads)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch((error) => {
        // Only show offline page for network errors
        if (error.name === 'TypeError' || !navigator.onLine) {
          return caches.match('/offline.html');
        }
        throw error;
      })
    );
  }
  // Handle offline assets (logo, etc.)
  else if (OFFLINE_ASSETS.some(asset => new URL(event.request.url).pathname === asset)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});

// Push payloads are server-rendered plain text. Never accept an external click
// target, even if an old/malformed payload reaches a browser registration.
function notificationDestination(path) {
  try {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      return new URL('/web_notifications', self.location.origin);
    }
    const destination = new URL(path, self.location.origin);
    if (destination.origin !== self.location.origin || destination.username || destination.password) {
      return new URL('/web_notifications', self.location.origin);
    }
    return destination;
  } catch {
    return new URL('/web_notifications', self.location.origin);
  }
}

async function notifyWindows(type) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type });
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string') return;
  const destination = notificationDestination(payload.path);
  const tag = typeof payload.tag === 'string' && /^[a-zA-Z0-9:_-]{1,200}$/.test(payload.tag)
    ? payload.tag : 'sure:web-notification';
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag,
      renotify: false,
      data: { path: destination.pathname + destination.search + destination.hash },
    }).then(() => notifyWindows('web-notifications:received'))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = notificationDestination(event.notification.data?.path);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matching = windows.find((client) => client.url === destination.href);
    if (matching) return matching.focus();
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing && 'navigate' in existing) {
      const navigated = await existing.navigate(destination.href);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(destination.href);
  })());
});

// Permission is never requested by the worker. Reconciliation on the next
// authenticated visit binds any browser-renewed endpoint to the current user.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    // Some browsers supply newSubscription themselves; others ask the worker
    // to renew using the already granted permission and existing VAPID key.
    if (!event.newSubscription && event.oldSubscription?.options?.applicationServerKey) {
      try {
        const options = event.oldSubscription.options;
        if (await self.registration.pushManager.permissionState(options) === 'granted') {
          await self.registration.pushManager.subscribe(options);
        }
      } catch {
        // The authenticated enrollment page reports unsupported/expired state
        // and offers a user-triggered retry; never request permission here.
      }
    }
    await notifyWindows('web-push:renewed');
  })());
});
