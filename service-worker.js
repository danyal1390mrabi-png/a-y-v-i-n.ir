/* ============================================================
   آیوین — سرویس‌ورکر
   • اعلان وب (Push) وقتی برنامه بسته یا در پس‌زمینه است
   • کلیک روی اعلان → باز شدن همان گفتگو
   (قبلاً این فایل وجود نداشت و برای همین اعلان وب کار نمی‌کرد)
   ============================================================ */
"use strict";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

/* ---------- رسیدن Push از سرور ---------- */
self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try { data = { body: event.data ? event.data.text() : "" }; } catch (e2) { data = {}; }
  }

  var title = data.title || "آیوین";
  var options = {
    body: data.body || "شما پیام جدیدی در آیوین دارید",
    icon: data.icon || "icon-192.png",
    badge: "icon-192.png",
    tag: data.tag || (data.data && data.data.id ? "ayv-" + (data.data.type || "x") + "-" + data.data.id : "ayv-msg"),
    renotify: true,
    dir: "rtl",
    lang: "fa",
    vibrate: [120, 60, 120],
    data: data.data || {}
  };

  event.waitUntil((async function () {
    var list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    var visible = false;
    list.forEach(function (c) {
      try { c.postMessage({ type: "ayvin-push" }); } catch (e) {}
      if (c.visibilityState === "visible") visible = true;
    });
    // اگر کاربر همین الان داخل برنامه است، خودِ برنامه صدا و نشانه را نشان می‌دهد
    if (visible) return;
    await self.registration.showNotification(title, options);
  })());
});

/* ---------- کلیک روی اعلان ---------- */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var d = event.notification.data || {};

  event.waitUntil((async function () {
    var list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ("focus" in c) {
        try { await c.focus(); } catch (e) {}
        try { c.postMessage({ type: "ayvin-open", convType: d.type || null, id: d.id || null }); } catch (e) {}
        return;
      }
    }
    var url = "./";
    if (d.type && d.id) url += "?open=" + encodeURIComponent(d.type + ":" + d.id);
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
