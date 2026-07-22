// iooi service worker — push notifications

const IOOI_SW_VERSION = "2026-07-22-sea-upload-1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    await Promise.all(clients.map(async (client) => {
      try {
        await client.navigate(client.url);
      } catch {
        client.postMessage({ type: "IOOI_RELOAD_REQUIRED", version: IOOI_SW_VERSION });
      }
    }));
  })());
});

// 收到推送 → 弹通知(iOS 要求每次 push 都必须展示通知)
self.addEventListener("push", (event) => {
  let data = { title: "小k", body: "来看看我" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "iooi-care",
    })
  );
});

// 点通知 → 聚焦已打开的窗口,没有就新开
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
