/* تماس داخل برنامه با Jitsi (iframe API رسمی) روی پنل js/15-meet-panel.js.
   فایل جدید است؛ جریان گوگل میت و هیچ فایل قبلی را عوض نمی‌کند. */
(function () {
  "use strict";
  var cfg = window.MEET_PANEL_CONFIG;
  var J = cfg && cfg.jitsi;
  var P = window.MeetPanel;
  if (!cfg || cfg.enabled === false || !J || J.enabled === false || !J.domain || !P || !P.openCustom) return;
  var S = cfg.strings || {};
  // حالت JaaS (سرویس رسمی 8x8): اگر jaas.appId پر باشد، دامنه و پیشوند اتاق خودکار تنظیم می‌شود.
  var appId = (J.jaas && J.jaas.appId ? String(J.jaas.appId) : "").trim().replace(/\/+$/, "");
  var useJaas = !!appId;
  var domain = useJaas ? "8x8.vc" : String(J.domain).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  var prefix = (useJaas ? appId + "/" : "") + (J.roomNamePrefix || "");
  var esc = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
  var urlRe = new RegExp("^https://" + esc(domain) + "/([A-Za-z0-9_./-]+?)/?(?:[?#].*)?$");
  var scriptPromise = null;

  function toast(msg, err) { if (typeof showToast === "function") showToast(msg, { error: !!err }); }

  function parse(raw) {
    var m = raw && String(raw).match(urlRe);
    if (!m) return null;
    var room = m[1];
    if (prefix && room.indexOf(prefix) !== 0) return null; // فقط اتاق‌های ساخته‌شده‌ی این برنامه
    return { room: room, url: "https://" + domain + "/" + room };
  }

  function randomId(n) {
    var a = new Uint8Array(n), out = "", chars = "abcdefghjkmnpqrstuvwxyz23456789";
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < n; i++) out += chars[a[i] % chars.length];
    return out;
  }

  function loadApi() {
    if (window.JitsiMeetExternalAPI) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var sc = document.createElement("script");
      sc.src = "https://" + domain + "/" + (useJaas ? appId + "/" : "") + "external_api.js";
      sc.async = true;
      sc.onload = function () { window.JitsiMeetExternalAPI ? resolve() : reject(new Error("api")); };
      sc.onerror = function () { scriptPromise = null; reject(new Error("load")); };
      document.head.appendChild(sc);
    });
    return scriptPromise;
  }

  function myName() {
    try { return (typeof myProfile !== "undefined" && myProfile && myProfile.name) || ""; } catch (e) { return ""; }
  }

  // توکن JaaS و کنترل سهمیه‌ی رایگان از Edge Function سوپابیس (supabase/functions/jaas-token).
  function callJaasFn(body) {
    var fn = (J.jaas && J.jaas.tokenFunction) || "jaas-token";
    if (typeof supabaseClient === "undefined" || !supabaseClient) return Promise.reject(new Error("no-supabase"));
    return supabaseClient.functions.invoke(fn, { body: body }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      var p = ctx && typeof ctx.json === "function" ? ctx.json().catch(function () { return {}; }) : Promise.resolve({});
      return p.then(function (d) {
        var e = new Error((d && d.error) || "call-failed");
        e.quota = !!(d && d.error === "quota-reached");
        throw e;
      });
    });
  }
  function jaasUser() {
    var u = null;
    try { u = (typeof myProfile !== "undefined" && myProfile) || null; } catch (e) {}
    return u ? u.username : "";
  }
  function fetchJaasJwt(room) {
    return callJaasFn({ room: room, name: myName() || "User", username: jaasUser() })
      .then(function (d) { if (!d || !d.token) throw new Error("jwt"); return d.token; });
  }
  // بررسی بدون مصرف سهمیه (قبل از ارسال دعوت). true = ادامه بده.
  function canStartCall() {
    if (!useJaas) return Promise.resolve(true);
    return callJaasFn({ action: "check", username: jaasUser() }).then(function () { return true; }, function (e) {
      if (e && e.quota) { toast(S.quotaReached, true); return false; }
      return true; // خطای شبکه/سرور: ورود واقعی هنوز توسط سرور کنترل می‌شود
    });
  }

  function mount(container, sess) {
    return loadApi().then(function () {
      var jwtP = typeof J.getJwt === "function" ? Promise.resolve(J.getJwt(sess.room)) : (useJaas ? fetchJaasJwt(sess.room) : Promise.resolve(null));
      return jwtP.then(function (jwt) { return jwt; }, function (e) {
        if (e && e.quota) { toast(S.quotaReached, true); if (P.isOpenKey("jitsi:" + sess.room)) P.close(); return "quota-reached"; }
        throw e;
      }).then(function (jwt) {
        if (jwt === "quota-reached") return function () {};
        var opts = {
          roomName: sess.room,
          parentNode: container,
          width: "100%",
          height: "100%",
          lang: J.lang || undefined,
          userInfo: { displayName: myName() }
        };
        if (jwt) opts.jwt = jwt;
        var api = new window.JitsiMeetExternalAPI(domain, opts);
        var closing = false;
        var leave = function () {
          if (closing) return;
          closing = true;
          if (P.isOpenKey("jitsi:" + sess.room)) setTimeout(P.close, 0);
        };
        api.addListener("readyToClose", leave);
        return function () { closing = true; try { api.dispose(); } catch (e) {} };
      });
    });
  }

  function openRoom(parsed, label) {
    return P.openCustom({
      key: "jitsi:" + parsed.room, url: parsed.url, label: label || "",
      title: S.jitsiTitle, joinLabel: S.jitsiJoinNewTab,
      fallbackTitle: S.jitsiFallbackTitle, fallbackDesc: S.jitsiFallbackDesc,
      notice: !useJaas && domain === "meet.jit.si" ? S.jitsiPublicNotice : "",
      state: J.defaultState || "max",
      mount: function (c) { return mount(c, { room: parsed.room }); }
    });
  }
  function convLabel() {
    var c = document.getElementById("convTitleName");
    return c ? c.textContent.trim() : "";
  }

  async function sendInvite(url) {
    var cc = typeof currentConv !== "undefined" ? currentConv : null;
    if (!cc) return false;
    var text = (S.jitsiInvite || "") + "\n" + url;
    var r;
    if (cc.type === "room") {
      r = await supabaseClient.from("messages").insert({
        name: myProfile.name, username: myProfile.username, text: text, phone: myProfile.phone,
        age: myProfile.age, city: myProfile.city, gender: myProfile.gender, room_id: cc.room.id
      });
      if (!r.error && typeof trimOldMessages === "function") trimOldMessages({ table: "messages", column: "room_id", value: cc.room.id });
    } else if (cc.type === "dmUser") {
      r = await supabaseClient.from("private_messages").insert({
        dm_key: cc.dmKey, sender_username: myProfile.username, sender_name: myProfile.name,
        receiver_username: cc.user.username, text: text
      });
      if (!r.error && typeof trimOldMessages === "function") trimOldMessages({ table: "private_messages", column: "dm_key", value: cc.dmKey });
    } else { return false; }
    return !r.error;
  }

  async function startCall() {
    var cc = typeof currentConv !== "undefined" ? currentConv : null;
    if (!cc || (cc.type !== "room" && cc.type !== "dmUser")) { toast(S.jitsiNeedChat, true); return; }
    if (!(await canStartCall())) return;
    var room = prefix + randomId(14);
    var parsed = { room: room, url: "https://" + domain + "/" + room };
    var label = convLabel();
    var ok = false;
    try { ok = await sendInvite(parsed.url); } catch (e) { ok = false; }
    if (!ok) { toast(S.jitsiSendFailed, true); return; }
    openRoom(parsed, label);
  }

  // دکمه‌ی جدا کنار دکمه‌ی میت (دکمه‌ی میت دست‌نخورده می‌ماند)
  var callBtn = document.getElementById("callBtn");
  if (callBtn && callBtn.parentNode) {
    var jb = document.createElement("button");
    jb.className = "call-btn"; jb.id = "jitsiCallBtn"; jb.type = "button";
    jb.title = S.jitsiButton || ""; jb.setAttribute("aria-label", S.jitsiButton || "");
    jb.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    jb.addEventListener("click", startCall);
    callBtn.parentNode.insertBefore(jb, callBtn);
    var sync = function () { jb.style.display = getComputedStyle(callBtn).display === "none" ? "none" : "flex"; };
    sync();
    if (window.MutationObserver) new MutationObserver(sync).observe(callBtn, { attributes: true, attributeFilter: ["style", "class"] });
  }

  // کلیک روی لینک تماس داخل چت: داخل پنل باز شود (اگر نشد، لینک عادی در تب جدید باز می‌شود).
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest("a[href]");
    if (!a || a.closest("#meetPanel")) return;
    var parsed = parse(a.getAttribute("href"));
    if (!parsed) return;
    if (openRoom(parsed, convLabel())) e.preventDefault();
  }, true);
})();
