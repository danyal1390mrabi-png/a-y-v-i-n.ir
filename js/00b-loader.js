/* ============================================================
   آیوین — ۰۰ب: نشانگر «در حال بارگذاری»
   • صفحه‌ی شروع (اسپلش) تا وقتی اولین صفحه‌ی برنامه آماده بشه
   • نوار باریک بالای صفحه که هر وقت برنامه داره از سرور چیزی می‌گیره یا می‌فرسته، نشون داده می‌شه
   باید قبل از ساخته شدن کلاینت Supabase لود بشه (قبل از 00-config.js).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- اسپلش ---------- */
  var splash = document.createElement("div");
  splash.id = "ayvSplash";
  splash.innerHTML = '<div class="ayv-spin"></div><div class="sp-logo">💬 آیوین</div><div class="sp-note">در حال بارگذاری...</div>';
  document.body.appendChild(splash);

  var SCREENS = ["roomsScreen", "loginScreen", "welcomeBackScreen", "phoneVerifyScreen", "usernameLoginScreen", "otpScreen", "chatScreen", "roomPasswordScreen"];
  var splashGone = false;
  function anyScreenVisible() {
    for (var i = 0; i < SCREENS.length; i++) {
      var e = document.getElementById(SCREENS[i]);
      if (!e) continue;
      var d = e.style.display;
      if (d && d !== "none") return true;
    }
    return false;
  }
  function hideSplash() {
    if (splashGone) return;
    splashGone = true;
    splash.classList.add("hide");
    setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 450);
  }
  var started = Date.now();
  var poll = setInterval(function () {
    if (anyScreenVisible() || Date.now() - started > 10000) { clearInterval(poll); hideSplash(); }
  }, 120);

  /* ---------- نوار بالای صفحه (هر درخواست شبکه) ---------- */
  var bar = document.createElement("div");
  bar.id = "ayvTopBar";
  bar.innerHTML = "<i></i>";
  document.body.appendChild(bar);

  var pending = 0, showT = null, hideT = null;
  function update() {
    if (pending > 0) {
      clearTimeout(hideT);
      if (!showT && !bar.classList.contains("on")) showT = setTimeout(function () { showT = null; if (pending > 0) bar.classList.add("on"); }, 150);
    } else {
      clearTimeout(showT); showT = null;
      clearTimeout(hideT);
      hideT = setTimeout(function () { if (pending === 0) bar.classList.remove("on"); }, 250);
    }
  }
  var _fetch = window.fetch;
  if (typeof _fetch === "function") {
    window.fetch = function () {
      pending++; update();
      var done = false;
      function fin() { if (!done) { done = true; pending = Math.max(0, pending - 1); update(); } }
      var p;
      try { p = _fetch.apply(this, arguments); } catch (e) { fin(); throw e; }
      p.then(fin, fin);
      return p;
    };
  }

  /* برای بقیه‌ی کدها: window.ayvinBusy(true/false) */
  var manual = 0;
  window.ayvinBusy = function (on) {
    manual = Math.max(0, manual + (on ? 1 : -1));
    pending = Math.max(0, pending + (on ? 1 : -1));
    update();
  };
})();
