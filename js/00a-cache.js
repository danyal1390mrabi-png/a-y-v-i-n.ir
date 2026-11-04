/* آیوین — کش مرورگر برای کاربرها، پیام‌ها، گروه‌ها و کانال‌ها (IndexedDB)
   روش: اول شبکه؛ اگه شبکه قطع بود، خطا داد یا بیشتر از ۴ ثانیه طول کشید، آخرین نسخه‌ی ذخیره‌شده نشون داده می‌شه. */
(function () {
  "use strict";
  var DB = "ayvin-cache", ST = "r", MAX = 3000, TIMEOUT = 4000;
  var TABLES = /\/rest\/v1\//; // همه‌ی جدول‌ها
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      try {
        var q = indexedDB.open(DB, 1);
        q.onupgradeneeded = function () { q.result.createObjectStore(ST); };
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  function get(k) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var r = d.transaction(ST).objectStore(ST).get(k);
        r.onsuccess = function () { res(r.result || null); };
        r.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function put(k, v) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var t = d.transaction(ST, "readwrite");
        t.objectStore(ST).put(v, k);
        t.oncomplete = res; t.onerror = res;
      });
    }).catch(function () {});
  }
  function prune() {
    db().then(function (d) {
      var s = d.transaction(ST, "readwrite").objectStore(ST), items = [], cur = s.openCursor();
      cur.onsuccess = function () {
        var c = cur.result;
        if (c) { items.push({ k: c.key, t: (c.value && c.value.t) || 0 }); c.continue(); return; }
        if (items.length <= MAX) return;
        items.sort(function (a, b) { return a.t - b.t; });
        items.slice(0, items.length - MAX).forEach(function (x) { s.delete(x.k); });
      };
    }).catch(function () {});
  }
  function toResp(rec) {
    var h = { "Content-Type": rec.ct || "application/json" };
    if (rec.cr) h["Content-Range"] = rec.cr;
    return new Response(rec.body, { status: 200, headers: h });
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} // جلوگیری از پاک‌شدن خودکار کش
  window.ayvinClearCache = function () {
    try { if (window.caches) { caches.delete("ayvin-media-v1"); caches.delete("ayvin-lib-v1"); } } catch (e) {}
    return db().then(function (d) { d.transaction(ST, "readwrite").objectStore(ST).clear(); }).catch(function () {});
  };
  function keyOf(url, input, init) {
    var acc = "";
    try {
      var h = (init && init.headers) || (input && input.headers);
      if (h) acc = typeof h.get === "function" ? (h.get("accept") || "") : (h.Accept || h.accept || "");
    } catch (e) {}
    return url + "|" + acc;
  }
  function withTimeout(p, ms) {
    return new Promise(function (res) { var t = setTimeout(function () { res(null); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function () { clearTimeout(t); res(null); }); });
  }
  window.ayvinCachedFetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method !== "GET" || !TABLES.test(url) || !window.indexedDB) return fetch(input, init);
    var key = keyOf(url, input, init);
    var recP = withTimeout(get(key), 800); // خواندن کش هیچ‌وقت درخواست رو معطل نمی‌کنه
    var net = fetch(input, init).then(function (r) {
      if (r.ok) {
        var c = r.clone();
        c.text().then(function (b) {
          put(key, { body: b, ct: c.headers.get("content-type"), cr: c.headers.get("content-range"), t: Date.now() });
          if (Math.random() < 0.04) prune();
        }).catch(function () {});
        return r;
      }
      return recP.then(function (rec) { return rec ? toResp(rec) : r; });
    });
    var slow = new Promise(function (res) {
      setTimeout(function () { recP.then(function (rec) { if (rec) res(toResp(rec)); }); }, TIMEOUT);
    });
    return Promise.race([net.catch(function () { return recP.then(function (rec) { if (rec) return toResp(rec); throw new Error("network"); }); }), slow]);
  };
})();
