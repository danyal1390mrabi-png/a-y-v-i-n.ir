/* پنل تماس گوگل میت (فایل جدید). به هیچ فایل دیگری وابسته نیست جز meet-config.js؛
   اگر showToast موجود باشد از آن استفاده می‌کند. هیچ رفتار قبلی را عوض نمی‌کند:
   لینک‌ها هیچ‌وقت preventDefault نمی‌شوند و مثل قبل در تب جدید باز می‌شوند. */
(function () {
  "use strict";
  var cfg = window.MEET_PANEL_CONFIG;
  if (!cfg || cfg.enabled === false) return;
  var S = cfg.strings || {};
  var linkRe, ignored = (cfg.ignoredCodes || []).map(function (c) { return String(c).toLowerCase(); });
  try { linkRe = new RegExp(cfg.linkPattern, "i"); } catch (e) { return; }

  var ICONS = {
    video: '<svg viewBox="0 0 24 24" fill="none"><path d="M15 8.5L20 5.5V18.5L15 15.5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><rect x="3" y="6" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.8"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    min: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    max: '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" rx="2.5" stroke="currentColor" stroke-width="1.9"/></svg>',
    restore: '<svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="8.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 8.5V6.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.8"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  var root, pill, stage, fallback, linkEl, joinBtn, maxBtn, titleEl, subEl, fbTitle, fbDesc, noticeEl, loadingEl;
  var timeEls = [];
  var session = null, state = "hidden", cleanup = null, timer = null;

  function parseLink(raw) {
    if (!raw) return null;
    var m = String(raw).match(linkRe);
    if (!m || !m[1]) return null;
    var code = m[1].toLowerCase();
    if (ignored.indexOf(code) !== -1) return null;
    return { code: code, url: "https://meet.google.com/" + m[1] };
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html; // فقط برای رشته‌های ثابت و آیکون‌ها
    return n;
  }
  function ibtn(icon, label, cls, onClick) {
    var b = el("button", "mp-ibtn" + (cls ? " " + cls : ""), icon);
    b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
    b.addEventListener("click", onClick);
    return b;
  }
  function toast(msg, isErr) {
    if (typeof showToast === "function") showToast(msg, { error: !!isErr });
  }

  function build() {
    if (root) return;
    root = el("div", "meet-panel");
    root.id = "meetPanel";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", S.panelLabel || "");

    var head = el("div", "mp-head");
    head.appendChild(ibtn(ICONS.back, S.back, "", backToChat));
    var t = el("div", "mp-title");
    titleEl = el("b"); subEl = el("span");
    t.appendChild(titleEl); t.appendChild(subEl);
    head.appendChild(t);
    var tm = el("span", "mp-time"); tm.style.cssText = "font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;";
    timeEls.push(tm); head.appendChild(tm);
    head.appendChild(ibtn(ICONS.min, S.minimize, "", function () { setState("min"); }));
    maxBtn = ibtn(ICONS.max, S.maximize, "", function () { setState(state === "max" ? "normal" : "max"); });
    head.appendChild(maxBtn);
    head.appendChild(ibtn(ICONS.close, S.close, "mp-close", close));
    root.appendChild(head);

    noticeEl = el("div", "mp-notice");
    root.appendChild(noticeEl);

    stage = el("div", "mp-stage");
    root.appendChild(stage);

    fallback = el("div", "mp-fallback");
    fallback.appendChild(el("div", "mp-fallback-icon", ICONS.video));
    fbTitle = el("h3"); fallback.appendChild(fbTitle);
    fbDesc = el("p"); fallback.appendChild(fbDesc);
    linkEl = el("div", "mp-link"); fallback.appendChild(linkEl);
    var act = el("div", "mp-actions");
    joinBtn = el("a", "mp-btn primary"); joinBtn.target = "_blank"; joinBtn.rel = "noopener";
    var cp = el("button", "mp-btn secondary"); cp.type = "button"; cp.textContent = S.copy || "";
    cp.addEventListener("click", copyLink);
    act.appendChild(joinBtn); act.appendChild(cp);
    fallback.appendChild(act);
    root.appendChild(fallback);

    pill = el("button", "meet-pill", ICONS.video);
    pill.type = "button"; pill.id = "meetPill";
    pill.title = S.expand || ""; pill.setAttribute("aria-label", S.expand || "");
    var pl = el("span", "mp-pill-label"); pill.appendChild(pl); pill._label = pl;
    var pt = el("span", "mp-time"); timeEls.push(pt); pill.appendChild(pt);
    var px = el("span", "mp-pill-x", "✕"); px.setAttribute("aria-label", S.close || "");
    pill.appendChild(px);
    pill.addEventListener("click", function (e) {
      if (e.target === px) { close(); return; }
      setState("normal");
    });

    document.body.appendChild(root);
    document.body.appendChild(pill);
  }

  function fmt(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (m < 10 ? "0" : "") + m, ss = (s < 10 ? "0" : "") + s;
    return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }
  function tick() {
    if (!session) return;
    var txt = fmt(Math.floor((Date.now() - session.startedAt) / 1000));
    timeEls.forEach(function (n) { n.textContent = txt; });
  }

  function setState(next) {
    if (!root) return;
    state = next;
    root.classList.toggle("mp-normal", next === "normal");
    root.classList.toggle("mp-max", next === "max");
    pill.classList.toggle("show", next === "min");
    var isMax = next === "max";
    maxBtn.innerHTML = isMax ? ICONS.restore : ICONS.max;
    maxBtn.title = isMax ? S.restore : S.maximize;
    maxBtn.setAttribute("aria-label", maxBtn.title);
  }

  function mountEmbed(sess) {
    root.classList.remove("has-embed");
    stage.textContent = "";
    if (typeof sess.mount !== "function") return;
    loadingEl = el("div", "mp-loading");
    loadingEl.textContent = S.loading || "";
    stage.appendChild(loadingEl);
    root.classList.add("has-embed");
    var failed = function (err) {
      if (session !== sess) return;
      stage.textContent = "";
      root.classList.remove("has-embed");
      toast(S.embedFailed, true);
    };
    var done = function (r) {
      if (session !== sess) { if (typeof r === "function") { try { r(); } catch (e) {} } return; }
      if (typeof r === "function") cleanup = r;
      if (loadingEl && loadingEl.parentNode) loadingEl.remove();
    };
    try {
      var r = sess.mount(stage, sess);
      if (r && typeof r.then === "function") r.then(done, failed); else done(r);
    } catch (e) { failed(e); }
  }
  function unmountEmbed() {
    if (typeof cleanup === "function") { try { cleanup(); } catch (e) {} }
    cleanup = null;
    if (stage) stage.textContent = "";
    if (root) root.classList.remove("has-embed");
  }

  // نشست عمومی: میت، یا هر ارائه‌دهنده‌ی دیگر که mount(container, session) بدهد.
  function openCustom(o) {
    if (!o || !o.key || !o.url) return false;
    build();
    var same = session && session.key === o.key;
    if (!same) {
      unmountEmbed();
      session = {
        key: o.key, url: o.url, label: o.label || "", title: o.title || S.title || "",
        mount: o.mount || null, joinLabel: o.joinLabel || S.join || "",
        fallbackTitle: o.fallbackTitle || S.fallbackTitle || "",
        fallbackDesc: o.fallbackDesc || S.fallbackDesc || "",
        notice: o.notice || "", startedAt: Date.now(), code: o.code || ""
      };
      titleEl.textContent = session.title;
      subEl.textContent = session.label;
      linkEl.textContent = session.url;
      joinBtn.href = session.url;
      joinBtn.textContent = session.joinLabel;
      fbTitle.textContent = session.fallbackTitle;
      fbDesc.textContent = session.fallbackDesc;
      noticeEl.textContent = session.notice;
      noticeEl.style.display = session.notice ? "block" : "none";
      pill._label.textContent = session.label || session.title;
      clearInterval(timer);
      timer = setInterval(tick, 1000);
      tick();
      mountEmbed(session);
    }
    setState(state === "hidden" || state === "min" || !same ? (o.state || cfg.defaultState || "normal") : state);
    return true;
  }

  function open(rawUrl, opts) {
    var parsed = parseLink(rawUrl);
    if (!parsed) return false;
    opts = opts || {};
    var provider = cfg.embedProvider;
    return openCustom({
      key: "meet:" + parsed.code, code: parsed.code, url: parsed.url, label: opts.label || "",
      mount: typeof provider === "function" ? function (container, sess) {
        return provider({ container: container, url: sess.url, code: sess.code, label: sess.label });
      } : null
    });
  }

  function close() {
    unmountEmbed();
    clearInterval(timer); timer = null;
    session = null;
    if (root) { setState("hidden"); }
  }

  function backToChat() {
    setState("min");
    var area = document.getElementById("chatArea");
    if (area) area.scrollTop = area.scrollHeight;
  }

  function copyLink() {
    if (!session) return;
    var done = function () { toast(S.copied); };
    var fail = function () { toast(S.copyFailed, true); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(session.url).then(done, fail);
    } else {
      try {
        var ta = document.createElement("textarea");
        ta.value = session.url; ta.style.cssText = "position:fixed;opacity:0;";
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand("copy");
        ta.remove(); ok ? done() : fail();
      } catch (e) { fail(); }
    }
  }

  function convLabel() {
    var n = document.getElementById("callTargetLabel");
    if (n && n.textContent.trim()) return n.textContent.trim();
    var c = document.getElementById("convTitleName");
    return c ? c.textContent.trim() : "";
  }

  // کلیک روی لینک میت داخل چت یا مودال: پنل باز می‌شود، لینک مثل قبل در تب جدید باز می‌شود.
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (root && root.contains(t)) return;
    var sendBtn = t.closest("#callLinkSendBtn");
    if (sendBtn) {
      var input = document.getElementById("callLinkInput");
      var label = convLabel();
      var link = input && input.value ? input.value : "";
      if (parseLink(link)) setTimeout(function () { open(link, { label: label }); }, 0);
      return;
    }
    if (cfg.openLinksInPanel === false) return;
    var a = t.closest("a[href]");
    if (a && parseLink(a.getAttribute("href"))) {
      var c = document.getElementById("convTitleName");
      open(a.getAttribute("href"), { label: c ? c.textContent.trim() : "" });
    }
  }, true);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && state === "max") setState("normal");
  });

  // با خروج از حساب (نمایش صفحه‌ی ورود) پنل و لینک بسته می‌شود.
  var ls = document.getElementById("loginScreen");
  if (ls && window.MutationObserver) {
    new MutationObserver(function () {
      if (session && getComputedStyle(ls).display !== "none") close();
    }).observe(ls, { attributes: true, attributeFilter: ["style", "class"] });
  }

  window.MeetPanel = { open: open, openCustom: openCustom, isOpenKey: function (k) { return !!session && session.key === k; }, close: close, minimize: function () { setState("min"); }, parseLink: parseLink };
})();
