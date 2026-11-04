/* ============================================================
   آیوین — ۱۹: اکسپلور (پست‌های تصادفی کاربران) + معرفی دوستان (تیک آبی)
   • اکسپلور: اسکرولِ عمودی، هر پست یک صفحه؛ با رسیدن به پست، خودکار باز می‌شه
     (ویدیو خودش پخش می‌شه) و پست قبلی بسته (متوقف) می‌شه.
   • لایک، کامنت و بازدید برای هر پست (جدول‌ها در supabase-explore-invite.sql)
   • تنظیمات ← معرفی کردن دوستان: کد دعوت اختصاصی + پیشرفت تا تیک آبی
   • ثبت‌نام: فیلد «کد دعوت»
   ============================================================ */
(function () {
  "use strict";

  /* ---------- تنظیمات قابل تغییر ---------- */
  var MAX_USERS = 300;        // حداکثر تعداد کاربرانی که پست‌هاشون برای اکسپلور خونده می‌شه
  var BATCH = 8;              // هر بار چند پست به فید اضافه بشه
  var VIEW_DWELL_MS = 1200;   // بعد از چند میلی‌ثانیه ماندن روی پست، بازدید حساب بشه
  var NEED_INVITES = 5;       // تعداد دعوت لازم برای تیک آبی
  var SITE_URL = "https://ayvin.ir";
  var INVITE_PENDING_KEY = "ayvin_invite_pending";
  var INVITE_PARAM_KEY = "ayvin_invite_param";

  /* ---------- ابزارهای کوچک ---------- */
  function $(id) { return document.getElementById(id); }
  function toFa(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); }
  function esc(s) {
    return typeof escapeHtml === "function" ? escapeHtml(s) :
      String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function toast(msg, err, ms) { if (typeof showToast === "function") showToast(msg, { error: !!err, duration: ms || 2600 }); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function me() {
    try { return (typeof myProfile !== "undefined" && myProfile && myProfile.username) ? String(myProfile.username) : null; } catch (e) { return null; }
  }
  function meLower() { var u = me(); return u ? u.toLowerCase() : null; }
  function fmtCount(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return toFa((n / 1000000).toFixed(1).replace(/\.0$/, "")) + "M";
    if (n >= 1000) return toFa((n / 1000).toFixed(1).replace(/\.0$/, "")) + "K";
    return toFa(n);
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  var GRADS = [
    ["#4f46e5", "#06b6d4"], ["#db2777", "#f97316"], ["#059669", "#0ea5e9"], ["#7c3aed", "#ec4899"],
    ["#ea580c", "#facc15"], ["#0f766e", "#22c55e"], ["#1d4ed8", "#a855f7"], ["#be123c", "#7c3aed"]
  ];
  function gradFor(key) {
    var h = 0, s = String(key);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var g = GRADS[h % GRADS.length];
    return "linear-gradient(155deg," + g[0] + "," + g[1] + ")";
  }

  /* ============================================================
     ۱) اکسپلور
     ============================================================ */
  var section = $("homeSectionExplore");
  var feed = $("exploreFeed");
  var refreshBtn = $("exploreRefreshBtn");

  var pool = [];            // همه‌ی پست‌های بُرخورده
  var shown = 0;            // چندتاش تا حالا نمایش داده شده
  var loaded = false, loading = false, endAdded = false;
  var activeSlide = null;
  var soundOn = true;       // پخش با صدا؛ اگه مرورگر اجازه نداد خودش بی‌صدا می‌شه
  var viewed = {};          // پست‌هایی که بازدیدشون ثبت شده
  var statsMap = {};        // key -> {likes, comments, views, liked}
  var slidesByKey = {};
  var itemsByKey = {};
  var io = null, viewTimer = null, statsWarned = false, savedScroll = 0;

  if (section && feed) {
    try { if (typeof homeSections !== "undefined") homeSections.explore = section; } catch (e) {}
  }

  function sizeSlides() {
    if (!feed) return;
    var h = feed.clientHeight;
    if (h > 0) feed.style.setProperty("--exh", h + "px");
  }
  if (feed && window.ResizeObserver) {
    new ResizeObserver(function () { sizeSlides(); }).observe(feed);
  }
  window.addEventListener("resize", sizeSlides);

  function isBlocked(u) {
    try {
      var k = String(u).toLowerCase();
      return (typeof blockedByMe !== "undefined" && (blockedByMe.has(u) || blockedByMe.has(k))) ||
             (typeof blockedMe !== "undefined" && (blockedMe.has(u) || blockedMe.has(k)));
    } catch (e) { return false; }
  }

  async function fetchUserRows() {
    var colsList = [
      "username,name,avatar_url,verified,posts,privacy,page_settings",
      "username,name,avatar_url,verified,posts,privacy",
      "username,name,avatar_url,posts,privacy",
      "username,name,avatar_url,posts"
    ];
    for (var i = 0; i < colsList.length; i++) {
      try {
        var r = await supabaseClient.from("users").select(colsList[i]).not("posts", "is", null).limit(MAX_USERS);
        if (!r.error) return r.data || [];
      } catch (e) {}
    }
    return null;
  }

  async function buildPool() {
    var rows = await fetchUserRows();
    if (rows === null) return null;
    try { if (typeof rememberPrivacy === "function") rememberPrivacy(rows); } catch (e) {}
    var out = [];
    rows.forEach(function (row) {
      if (!row || !row.username || !Array.isArray(row.posts) || !row.posts.length) return;
      if (isBlocked(row.username)) return;
      var allowed = true;
      try { allowed = typeof canSeeField === "function" ? canSeeField(row.username, "posts") : true; } catch (e) {}
      if (!allowed) return;
      var prof = { username: row.username, name: row.name || row.username, avatar_url: row.avatar_url, verified: !!row.verified };
      row.posts.forEach(function (p) {
        if (!p || !p.id || !(p.image || p.video || (p.text && String(p.text).trim()))) return;
        out.push({ key: String(row.username).toLowerCase() + ":" + p.id, username: row.username, profile: prof, post: p, flags: flagsOf(row.page_settings, p) });
      });
    });
    return shuffle(out);
  }

  /* تنظیمات صفحه‌ی صاحب پست: بستن کامنت / مخفی کردن لایک / بستن شیر (صفحه یا خودِ پست) */
  function flagsOf(ps, p) {
    ps = (ps && typeof ps === "object") ? ps : {};
    p = p || {};
    return { noComments: !!(ps.comments_off || p.no_comments), hideLikes: !!(ps.hide_likes || p.hide_likes), noShare: !!(ps.shares_off || p.no_share) };
  }
  function isMineItem(item) { return String(item.username).toLowerCase() === meLower(); }

  /* ---------- ساخت یک صفحه‌ی پست ---------- */
  function makeSlide(item) {
    var p = item.post;
    var s = el("div", "ex-slide");
    s.dataset.key = item.key;
    var hasMedia = !!(p.video || p.image);
    var r = {};

    if (p.video) {
      var v = document.createElement("video");
      v.className = "ex-media ex-video";
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.loop = true;
      v.preload = "none";
      v.dataset.src = p.video;
      v.muted = !soundOn;
      s.appendChild(v);
      r.video = v;
    } else if (p.image) {
      var bg = document.createElement("img");
      bg.className = "ex-bg";
      bg.alt = "";
      bg.setAttribute("aria-hidden", "true");
      bg.loading = "lazy";
      bg.src = p.image;
      s.appendChild(bg);
      var im = document.createElement("img");
      im.className = "ex-media";
      im.alt = "";
      im.loading = "lazy";
      im.draggable = false;
      im.src = p.image;
      s.appendChild(im);
    } else {
      s.classList.add("ex-textonly");
      s.style.background = gradFor(item.key);
      var tb = el("div", "ex-textbox");
      tb.appendChild(el("div", "ex-bigtext", String(p.text)));
      s.appendChild(tb);
    }

    s.appendChild(el("div", "ex-shade"));
    s.appendChild(el("div", "ex-pause", "▶"));
    r.heart = el("div", "ex-heart", "❤️");
    s.appendChild(r.heart);

    /* نویسنده و متن */
    var info = el("div", "ex-info");
    var au = el("div", "ex-author");
    var av = el("span", "avatar");
    try { if (typeof setAvatarElement === "function") setAvatarElement(av, item.profile, item.profile.name); else av.textContent = (item.profile.name || "?").charAt(0); } catch (e) {}
    au.appendChild(av);
    var nm = el("div");
    var nameLine = el("div", "ex-author-name");
    nameLine.appendChild(document.createTextNode(item.profile.name || item.username));
    if (item.profile.verified && typeof vBadge === "function") {
      var vb = document.createElement("span");
      vb.innerHTML = vBadge(item.profile);
      nameLine.appendChild(vb);
    }
    nm.appendChild(nameLine);
    nm.appendChild(el("div", "ex-author-sub", "@" + item.username));
    au.appendChild(nm);
    try {
      var fchip = typeof window.ayvinMakeFollowChip === "function" ? window.ayvinMakeFollowChip(item.username) : null;
      if (fchip) au.appendChild(fchip);
    } catch (e) {}
    au.onclick = function (e) {
      e.stopPropagation();
      if (typeof showProfile === "function") showProfile(item.profile);
    };
    info.appendChild(au);
    if (hasMedia && p.text && String(p.text).trim()) {
      var cap = el("div", "ex-caption", String(p.text));
      cap.onclick = function (e) { e.stopPropagation(); cap.classList.toggle("open"); };
      info.appendChild(cap);
    }
    if (p.at) {
      var dt = el("div", "ex-date");
      try { dt.textContent = new Date(p.at).toLocaleDateString("fa-IR"); } catch (e) {}
      info.appendChild(dt);
    }
    s.appendChild(info);

    /* دکمه‌های کنار */
    var act = el("div", "ex-actions");

    var likeBtn = el("button", "ex-act");
    likeBtn.type = "button";
    likeBtn.setAttribute("aria-label", "لایک");
    likeBtn.innerHTML = '<span class="ex-ico">🤍</span><span class="ex-n">۰</span>';
    likeBtn.onclick = function (e) { e.stopPropagation(); toggleLike(item); };
    act.appendChild(likeBtn);
    r.likeBtn = likeBtn;

    var cmtBtn = el("button", "ex-act");
    cmtBtn.type = "button";
    cmtBtn.setAttribute("aria-label", "کامنت‌ها");
    cmtBtn.innerHTML = '<span class="ex-ico">💬</span><span class="ex-n">۰</span>';
    cmtBtn.onclick = function (e) { e.stopPropagation(); openComments(item); };
    act.appendChild(cmtBtn);
    r.cmtBtn = cmtBtn;

    if (!(item.flags && item.flags.noShare && !isMineItem(item)) && typeof window.ayvinSharePost === "function") {
      var shBtn = el("button", "ex-act");
      shBtn.type = "button";
      shBtn.setAttribute("aria-label", "ارسال");
      shBtn.innerHTML = '<span class="ex-ico">📤</span><span class="ex-n">ارسال</span>';
      shBtn.onclick = function (e) { e.stopPropagation(); window.ayvinSharePost(item); };
      act.appendChild(shBtn);
    }

    var viewBox = el("div", "ex-view");
    viewBox.innerHTML = '<span class="ex-ico">👁</span><span class="ex-n">۰</span>';
    act.appendChild(viewBox);
    r.viewBox = viewBox;

    if (r.video) {
      var snd = el("button", "ex-act ex-sound");
      snd.type = "button";
      snd.setAttribute("aria-label", "صدا");
      snd.innerHTML = '<span class="ex-ico"><span class="ex-on">🔊</span><span class="ex-off">🔇</span></span>';
      snd.onclick = function (e) { e.stopPropagation(); setSound(!soundOn); };
      act.appendChild(snd);
    }
    s.appendChild(act);

    /* لمس: یک‌بار = پخش/مکث ویدیو، دو‌بار = لایک */
    var lastTap = 0;
    s.addEventListener("click", function (e) {
      if (e.target.closest(".ex-act,.ex-author,.ex-caption,.ex-view")) return;
      var now = Date.now();
      if (now - lastTap < 320) {
        lastTap = 0;
        var st = statFor(item.key);
        if (!st.liked) toggleLike(item);
        r.heart.classList.remove("go"); void r.heart.offsetWidth; r.heart.classList.add("go");
        return;
      }
      lastTap = now;
      if (r.video) {
        if (r.video.paused) { s._manual = false; playVideo(r.video); s.classList.remove("ex-paused"); }
        else { s._manual = true; r.video.pause(); s.classList.add("ex-paused"); }
      }
    });

    s._r = r;
    slidesByKey[item.key] = s;
    itemsByKey[item.key] = item;
    return s;
  }

  function statFor(key) {
    return statsMap[key] || (statsMap[key] = { likes: 0, comments: 0, views: 0, liked: false });
  }

  function paint(key) {
    try { if (typeof window.ayvinOnPaint === "function") window.ayvinOnPaint(key); } catch (e) {}
    var s = slidesByKey[key];
    if (!s || !s._r) return;
    var st = statFor(key), r = s._r;
    var it = itemsByKey[key];
    var hideLikes = !!(it && it.flags && it.flags.hideLikes && !isMineItem(it));
    r.likeBtn.classList.toggle("liked", !!st.liked);
    r.likeBtn.querySelector(".ex-ico").textContent = st.liked ? "❤️" : "🤍";
    r.likeBtn.querySelector(".ex-n").textContent = hideLikes ? "" : fmtCount(st.likes);
    r.cmtBtn.querySelector(".ex-n").textContent = fmtCount(st.comments);
    r.viewBox.querySelector(".ex-n").textContent = fmtCount(st.views);
  }

  async function loadStats(items) {
    if (!items.length || !supabaseClient) return;
    try {
      var r = await supabaseClient.rpc("explore_stats", { p_ids: items.map(function (i) { return i.key; }), p_user: meLower() || "" });
      if (r.error) throw r.error;
      (r.data || []).forEach(function (row) {
        statsMap[row.post_id] = { likes: Number(row.likes) || 0, comments: Number(row.comments) || 0, views: Number(row.views) || 0, liked: !!row.liked };
        paint(row.post_id);
      });
    } catch (e) {
      console.warn("explore_stats:", e);
      if (!statsWarned) {
        statsWarned = true;
        toast("برای فعال شدن لایک و کامنت، فایل SQL اکسپلور رو در Supabase اجرا کن.", true, 4200);
      }
    }
  }

  /* ---------- لایک ---------- */
  async function toggleLike(item) {
    var u = meLower();
    if (!u) { toast("اول وارد حسابت شو."); return; }
    var st = statFor(item.key), was = st.liked;
    st.liked = !was;
    st.likes = Math.max(0, st.likes + (was ? -1 : 1));
    paint(item.key);
    try {
      var r = was
        ? await supabaseClient.from("post_likes").delete().eq("post_id", item.key).eq("username", u)
        : await supabaseClient.from("post_likes").insert({ post_id: item.key, username: u });
      if (r.error && r.error.code !== "23505") throw r.error;
    } catch (e) {
      console.warn("like:", e);
      st.liked = was;
      st.likes = Math.max(0, st.likes + (was ? 1 : -1));
      paint(item.key);
      toast("ثبت لایک ناموفق بود.", true);
    }
  }

  /* ---------- بازدید ---------- */
  function markView(item) {
    var u = meLower();
    if (!u || viewed[item.key]) return;
    viewed[item.key] = 1;
    if (String(item.username).toLowerCase() === u) return;   // بازدید خودِ صاحب پست حساب نمی‌شه
    supabaseClient.from("post_views").insert({ post_id: item.key, username: u }).then(function (r) {
      if (r && !r.error) { var st = statFor(item.key); st.views++; paint(item.key); }
    }, function () {});
  }

  /* ---------- پخش و توقف ---------- */
  function ensureSrc(v, eager) {
    if (!v) return;
    if (!v.getAttribute("src") && v.dataset.src) {
      v.src = v.dataset.src;
      v.preload = eager ? "auto" : "metadata";
    }
  }
  function setSound(on) {
    soundOn = !!on;
    feed.classList.toggle("ex-muted", !soundOn);
    if (activeSlide && activeSlide._r && activeSlide._r.video) {
      activeSlide._r.video.muted = !soundOn;
      if (soundOn && activeSlide._r.video.paused && !activeSlide._manual) playVideo(activeSlide._r.video);
    }
  }
  function playVideo(v) {
    v.muted = !soundOn;
    var p;
    try { p = v.play(); } catch (e) {}
    if (p && p.catch) {
      p.catch(function () {
        // مرورگر پخش با صدا رو قبول نکرد؛ بی‌صدا پخش می‌کنیم
        v.muted = true;
        feed.classList.add("ex-muted");
        soundOn = false;
        var q; try { q = v.play(); } catch (e) {}
        if (q && q.catch) q.catch(function () {});
      });
    }
  }
  function closeSlide(s) {           // پست قبلی «بسته» می‌شه: ویدیو متوقف و به اول برمی‌گرده
    if (!s) return;
    var v = s._r && s._r.video;
    if (v) { try { v.pause(); v.currentTime = 0; } catch (e) {} }
    s._manual = false; s._auto = false;
    s.classList.remove("ex-paused");
    var cap = s.querySelector(".ex-caption");
    if (cap) cap.classList.remove("open");
  }
  function unloadFar(center) {
    Object.keys(slidesByKey).forEach(function (k) {
      var s = slidesByKey[k], v = s._r && s._r.video;
      if (!v || !v.getAttribute("src")) return;
      if (s === center || s === center.previousElementSibling || s === center.nextElementSibling) return;
      try { v.pause(); } catch (e) {}
      v.removeAttribute("src");
      try { v.load(); } catch (e) {}
      v.preload = "none";
    });
  }

  function setActive(s) {
    if (activeSlide === s) return;
    closeSlide(activeSlide);
    clearTimeout(viewTimer);
    activeSlide = s;
    var v = s._r && s._r.video;
    if (v) { ensureSrc(v, true); playVideo(v); }
    [s.nextElementSibling, s.previousElementSibling].forEach(function (n) {
      if (n && n._r && n._r.video) ensureSrc(n._r.video, false);
    });
    unloadFar(s);
    var item = itemsByKey[s.dataset.key];
    if (item) viewTimer = setTimeout(function () { if (activeSlide === s) markView(item); }, VIEW_DWELL_MS);
    // نزدیک ته فید: پست‌های بعدی رو اضافه کن
    var left = 0, n = s.nextElementSibling;
    while (n && left < 4) { left++; n = n.nextElementSibling; }
    if (left < 3) renderMore();
  }

  function onIntersect(entries) {
    entries.forEach(function (en) {
      var s = en.target;
      if (en.intersectionRatio >= 0.6) {
        if (s !== activeSlide) setActive(s);
        else if (s._auto && !s._manual) {                // برگشت از تب دیگر / صفحه‌ی چت
          s._auto = false;
          if (s._r && s._r.video) playVideo(s._r.video);
        }
      } else if (en.intersectionRatio === 0 && s === activeSlide) {
        if (s._r && s._r.video && !s._r.video.paused) { s._auto = true; s._r.video.pause(); }
        clearTimeout(viewTimer);
      }
    });
  }

  document.addEventListener("visibilitychange", function () {
    var s = activeSlide, v = s && s._r && s._r.video;
    if (!v) return;
    if (document.hidden) { if (!v.paused) { s._auto = true; v.pause(); } }
    else if (s._auto && !s._manual && section && section.classList.contains("active")) { s._auto = false; playVideo(v); }
  });

  /* ---------- رندر فید ---------- */
  function stateBox(icon, text, btnText, btnFn) {
    var d = el("div", "ex-state");
    d.appendChild(el("div", "ex-state-ico", icon));
    d.appendChild(el("div", null, text));
    if (btnText) { var b = el("button", null, btnText); b.type = "button"; b.onclick = btnFn; d.appendChild(b); }
    return d;
  }

  function renderMore() {
    if (!pool.length) return;
    if (shown >= pool.length) {
      if (!endAdded) {
        endAdded = true;
        feed.appendChild(stateBox("🎉", "همه‌ی پست‌ها رو دیدی!", "🔄 دوباره بُر بزن", function () { reloadFeed(); }));
      }
      return;
    }
    var chunk = pool.slice(shown, shown + BATCH);
    shown += chunk.length;
    chunk.forEach(function (it) {
      var s = makeSlide(it);
      feed.appendChild(s);
      if (io) io.observe(s);
      paint(it.key);
    });
    loadStats(chunk);
    if (shown >= pool.length && !endAdded) {
      endAdded = true;
      feed.appendChild(stateBox("🎉", "همه‌ی پست‌ها رو دیدی!", "🔄 دوباره بُر بزن", function () { reloadFeed(); }));
    }
  }

  function resetFeedState() {
    if (io) { try { io.disconnect(); } catch (e) {} }
    clearTimeout(viewTimer);
    Array.prototype.forEach.call(feed.querySelectorAll("video"), function (v) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {} });
    feed.innerHTML = "";
    pool = []; shown = 0; endAdded = false; activeSlide = null;
    slidesByKey = {}; itemsByKey = {};
    io = new IntersectionObserver(onIntersect, { root: feed, threshold: [0, 0.6] });
  }

  async function reloadFeed() {
    if (loading || !feed) return;
    loading = true;
    resetFeedState();
    sizeSlides();
    var ld = el("div", "ex-state");
    ld.appendChild(el("div", "ex-spin"));
    ld.appendChild(el("div", null, "در حال آوردن پست‌ها..."));
    feed.appendChild(ld);
    var res = null;
    try { res = await buildPool(); } catch (e) { res = null; }
    feed.innerHTML = "";
    if (res === null) {
      feed.appendChild(stateBox("📡", "پست‌ها بارگذاری نشد؛ اینترنتت رو چک کن.", "تلاش دوباره", function () { reloadFeed(); }));
    } else if (!res.length) {
      feed.appendChild(stateBox("📝", "هنوز پستی نیست!\nاز «پروفایل من» اولین پست رو بذار.", "🔄 بارگذاری دوباره", function () { reloadFeed(); }));
    } else {
      pool = res;
      renderMore();
    }
    feed.scrollTop = 0;
    loading = false;
    loaded = true;
  }

  if (refreshBtn) refreshBtn.addEventListener("click", function () { reloadFeed(); });

  /* وقتی تب اکسپلور باز می‌شه */
  function onEnterExplore() {
    sizeSlides();
    if (!loaded && !loading) { reloadFeed(); return; }
    if (savedScroll) { feed.scrollTop = savedScroll; }
  }

  /* showHomeSection رو دور می‌زنیم تا اکسپلور هم یک تب معمولی باشه */
  var _origShow = window.showHomeSection;
  if (typeof _origShow === "function") {
    window.showHomeSection = function (which) {
      if (which !== "explore" && feed && section && section.classList.contains("active")) savedScroll = feed.scrollTop;
      var res = _origShow.apply(this, arguments);
      if (which === "explore") { try { onEnterExplore(); } catch (e) { console.warn(e); } }
      return res;
    };
  }

  /* ============================================================
     ۲) کامنت‌ها
     ============================================================ */
  var sheetBg = null, sheetState = null;

  function ensureSheet() {
    if (sheetBg) return sheetBg;
    sheetBg = el("div", "ex-sheet-bg");
    sheetBg.id = "exSheetBg";
    sheetBg.innerHTML =
      '<div class="ex-sheet" role="dialog" aria-label="کامنت‌ها">' +
        '<div class="ex-sheet-head"><div class="ex-sheet-title">💬 کامنت‌ها</div><button type="button" class="ex-sheet-x" id="exSheetX" aria-label="بستن">✕</button></div>' +
        '<div class="ex-clist" id="exCList"></div>' +
        '<div class="ex-compose"><input id="exCInput" type="text" maxlength="300" placeholder="یه کامنت بنویس..." autocomplete="off"><button type="button" id="exCSend">ارسال</button></div>' +
      '</div>';
    document.body.appendChild(sheetBg);
    sheetBg.addEventListener("click", function (e) { if (e.target === sheetBg) closeSheet(); });
    sheetBg.querySelector("#exSheetX").onclick = closeSheet;
    sheetBg.querySelector("#exCSend").onclick = sendComment;
    sheetBg.querySelector("#exCInput").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); sendComment(); } });
    return sheetBg;
  }
  function closeSheet() { if (sheetBg) sheetBg.classList.remove("open"); sheetState = null; }

  function fmtTime(ts) {
    try {
      var d = new Date(ts);
      return d.toLocaleDateString("fa-IR") + " " + d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  async function openComments(item) {
    if (!me()) { toast("اول وارد حسابت شو."); return; }
    var closed = !!(item.flags && item.flags.noComments);
    if (closed && !isMineItem(item)) { toast("صاحب این پست کامنت‌ها رو بسته.", true); return; }
    var bg = ensureSheet();
    sheetState = { item: item, profiles: {} };
    bg.classList.add("open");
    var comp = bg.querySelector(".ex-compose");
    if (comp) comp.style.display = closed ? "none" : "";
    var list = bg.querySelector("#exCList");
    list.innerHTML = '<div class="ex-cempty">در حال بارگذاری...</div>';
    bg.querySelector("#exCInput").value = "";
    try {
      var r = await supabaseClient.from("post_comments").select("id,username,name,text,created_at").eq("post_id", item.key).order("created_at", { ascending: true }).limit(200);
      if (r.error) throw r.error;
      if (!sheetState || sheetState.item !== item) return;
      var rows = r.data || [];
      // عکس و تیک کامنت‌گذارها
      var names = {};
      rows.forEach(function (c) { names[c.username] = 1; });
      var uns = Object.keys(names);
      if (uns.length && typeof selectUsers === "function") {
        try {
          var pr = await selectUsers(function (q) { return q.in("username", uns); });
          (pr && pr.data || []).forEach(function (p) { sheetState.profiles[String(p.username).toLowerCase()] = p; });
        } catch (e) {}
      }
      list.innerHTML = "";
      if (!rows.length) list.innerHTML = '<div class="ex-cempty">هنوز کامنتی نیست.<br>اولین نفر باش 😊</div>';
      rows.forEach(function (c) { list.appendChild(commentRow(c)); });
      list.scrollTop = list.scrollHeight;
      var st = statFor(item.key); st.comments = rows.length; paint(item.key);
    } catch (e) {
      console.warn("comments:", e);
      list.innerHTML = '<div class="ex-cempty">کامنت‌ها بارگذاری نشد.<br>مطمئن شو فایل SQL اکسپلور رو در Supabase اجرا کردی.</div>';
    }
  }

  function commentRow(c) {
    var key = String(c.username).toLowerCase();
    var prof = (sheetState && sheetState.profiles[key]) || { username: c.username, name: c.name || c.username };
    var row = el("div", "ex-c");
    row.dataset.id = c.id;
    var av = el("span", "avatar");
    try { if (typeof setAvatarElement === "function") setAvatarElement(av, prof, prof.name || c.name || c.username); else av.textContent = (c.name || "?").charAt(0); } catch (e) {}
    av.onclick = function () { if (typeof showProfile === "function" && prof.name) { closeSheet(); showProfile(prof); } };
    row.appendChild(av);
    var body = el("div", "ex-cbody");
    var nm = el("div", "ex-cname");
    nm.appendChild(document.createTextNode(c.name || c.username));
    if (prof.verified && typeof vBadge === "function") { var vb = document.createElement("span"); vb.innerHTML = vBadge(prof); nm.appendChild(vb); }
    nm.appendChild(el("span", "ex-ctime", fmtTime(c.created_at)));
    body.appendChild(nm);
    body.appendChild(el("div", "ex-ctext", c.text));
    if (key === meLower() || (sheetState && isMineItem(sheetState.item))) {
      var del = el("button", "ex-cdel", "🗑️ حذف");
      del.type = "button";
      del.onclick = async function () {
        try {
          var r = await supabaseClient.from("post_comments").delete().eq("id", c.id).eq("username", c.username);
          if (r.error) throw r.error;
          row.remove();
          if (sheetState) { var st = statFor(sheetState.item.key); st.comments = Math.max(0, st.comments - 1); paint(sheetState.item.key); }
          var list = sheetBg.querySelector("#exCList");
          if (!list.querySelector(".ex-c")) list.innerHTML = '<div class="ex-cempty">هنوز کامنتی نیست.<br>اولین نفر باش 😊</div>';
        } catch (e) { toast("حذف کامنت ناموفق بود.", true); }
      };
      body.appendChild(del);
    }
    row.appendChild(body);
    return row;
  }

  async function sendComment() {
    if (!sheetState) return;
    var u = meLower();
    if (!u) return;
    var inp = sheetBg.querySelector("#exCInput"), btn = sheetBg.querySelector("#exCSend");
    var text = inp.value.trim();
    if (!text) return;
    btn.disabled = true;
    var item = sheetState.item;
    try {
      var r = await supabaseClient.from("post_comments")
        .insert({ post_id: item.key, username: me(), name: (myProfile && (myProfile.name || myProfile.username)) || u, text: text })
        .select("id,username,name,text,created_at").single();
      if (r.error) throw r.error;
      if (!sheetState || sheetState.item !== item) return;
      sheetState.profiles[u] = myProfile;
      var list = sheetBg.querySelector("#exCList");
      var emptyEl = list.querySelector(".ex-cempty");
      if (emptyEl) list.innerHTML = "";
      list.appendChild(commentRow(r.data));
      list.scrollTop = list.scrollHeight;
      inp.value = "";
      var st = statFor(item.key); st.comments++; paint(item.key);
    } catch (e) {
      console.warn("send comment:", e);
      toast("ارسال کامنت ناموفق بود.", true);
    } finally {
      btn.disabled = false;
    }
  }

  /* ============================================================
     ۳) معرفی دوستان (تنظیمات)
     ============================================================ */
  function applyVerifiedLocally() {
    try {
      if (myProfile && !myProfile.verified) {
        myProfile.verified = true;
        if (typeof saveProfileLocally === "function") saveProfileLocally(myProfile);
        if (typeof refreshSettingsPane === "function") refreshSettingsPane();
        if (typeof broadcastMyProfile === "function") { try { broadcastMyProfile(); } catch (e) {} }
        toast("🎉 تبریک! تیک آبی گرفتی ✔️", false, 4200);
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function fetchInviteInfo(create) {
    var r = await supabaseClient.rpc("invite_info", { p_username: me(), p_create: create !== false });
    if (r.error) throw r.error;
    var d = r.data;
    if (!d || !d.ok) throw new Error((d && d.error) || "invite_info");
    return d;
  }

  async function openInvitePanel() {
    if (!me()) { toast("اول وارد حسابت شو."); return; }
    var m = ensureSimpleModal("inviteModal", "👥 معرفی کردن دوستان");
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      '<div class="inv-hero"><span class="inv-tick">✔</span><div>با آوردن <b>' + toFa(NEED_INVITES) + ' کاربر</b>، شما <b>تیک آبی</b> می‌گیرید!</div></div>' +
      '<div class="inv-h">آوردن دوست به آیوین</div>' +
      '<div class="inv-sub">این کد اختصاصی توئه. دوستت موقع ثبت‌نام، اون رو توی بخش «کد دعوت» وارد می‌کنه.</div>' +
      '<div class="inv-code" id="invCode">······</div>' +
      '<div class="inv-btns"><button type="button" class="modal-close" id="invCopy">📋 کپی کد</button><button type="button" class="call-send-btn" id="invShare">📤 دعوت دوستان</button></div>' +
      '<div class="inv-prog-top"><span>دعوت‌های موفق</span><b id="invCount">—</b></div>' +
      '<div class="inv-bar"><i id="invBar" style="width:0%"></i></div>' +
      '<div id="invDone"></div>' +
      '<div class="inv-note">هر دوستی که با کد تو ثبت‌نام کنه و شماره‌ی موبایلش رو تایید کنه، یک دعوت حساب می‌شه.</div>';
    m.classList.add("open");

    var codeEl = body.querySelector("#invCode");
    var code = "";
    body.querySelector("#invCopy").onclick = function () { if (code) copyText(code, "کد کپی شد ✅"); };
    body.querySelector("#invShare").onclick = function () {
      if (!code) return;
      var text = "من توی آیوین هستم! 💬\nموقع ثبت‌نام این کد دعوت رو وارد کن: " + code + "\n" + SITE_URL + "/?invite=" + code;
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); }
      else copyText(text, "متن دعوت کپی شد ✅");
    };

    try {
      var d = await fetchInviteInfo(true);
      code = d.code || "";
      codeEl.textContent = code || "—";
      var need = Number(d.needed) || NEED_INVITES, cnt = Math.min(Number(d.count) || 0, need);
      body.querySelector("#invCount").textContent = toFa(cnt) + " از " + toFa(need);
      body.querySelector("#invBar").style.width = Math.round(cnt / need * 100) + "%";
      if (d.verified) {
        body.querySelector("#invDone").innerHTML = '<div class="inv-done">✔ تیک آبی داری! ممنون که آیوین رو معرفی کردی 💙</div>';
        applyVerifiedLocally();
      }
    } catch (e) {
      console.warn("invite_info:", e);
      codeEl.textContent = "—";
      body.querySelector("#invDone").innerHTML = '<div class="inv-err">دریافت کد ناموفق بود.<br>مطمئن شو فایل SQL اکسپلور/دعوت رو در Supabase اجرا کردی.</div>';
    }
  }

  function copyText(text, okMsg) {
    function fallback() {
      try {
        var t = document.createElement("textarea");
        t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
        document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
        toast(okMsg);
      } catch (e) { toast("کپی نشد؛ دستی کپی کن.", true); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }

  // آیتم تنظیمات: لیسنر قدیمیِ «گزینه در دسترس نیست» رو با کلون‌کردن حذف می‌کنیم
  (function wireSettingsItem() {
    var item = document.querySelector('.settings-item[data-setting="invite"]');
    if (!item || !item.parentNode) return;
    var c = item.cloneNode(true);
    item.parentNode.replaceChild(c, item);
    c.addEventListener("click", openInvitePanel);
  })();

  /* ============================================================
     ۴) ثبت‌نام: کد دعوت
     ============================================================ */
  function inviteInput() { return $("inviteCodeInput"); }
  function inviteVal() {
    var i = inviteInput();
    return i ? String(i.value || "").trim().toUpperCase() : "";
  }

  // لینک دعوت: https://ayvin.ir/?invite=CODE  ← کد خودکار توی فیلد ثبت‌نام می‌شینه
  (function prefillFromUrl() {
    try {
      var m = location.search.match(/[?&]invite=([A-Za-z0-9]{4,12})/);
      if (m) localStorage.setItem(INVITE_PARAM_KEY, m[1].toUpperCase());
      var saved = localStorage.getItem(INVITE_PARAM_KEY);
      var i = inviteInput();
      if (i && saved && !i.value) i.value = saved;
    } catch (e) {}
  })();

  var _validate = window.ayvinValidateSignupExtras;
  window.ayvinValidateSignupExtras = function () {
    var e = typeof _validate === "function" ? _validate.apply(this, arguments) : "";
    if (e) return e;
    var c = inviteVal();
    if (c && !/^[A-Z0-9]{4,12}$/.test(c)) return "کد دعوت معتبر نیست (فقط حروف انگلیسی و عدد).";
    return "";
  };

  var _reset = window.ayvinResetSignupExtras;
  window.ayvinResetSignupExtras = function () {
    var res = typeof _reset === "function" ? _reset.apply(this, arguments) : undefined;
    var i = inviteInput(); if (i) i.value = "";
    return res;
  };

  async function applyInvite(code) {
    try {
      var r = await supabaseClient.rpc("invite_apply", { p_username: me(), p_code: code });
      var d = r && r.data;
      if (d && d.ok) {
        try { localStorage.setItem(INVITE_PENDING_KEY, "1"); localStorage.removeItem(INVITE_PARAM_KEY); } catch (e) {}
        toast("کد دعوت ثبت شد ✅");
      } else if (d && d.error === "bad_code") {
        toast("کد دعوت پیدا نشد؛ ثبت‌نامت انجام شد.", true, 3600);
      } else if (d && d.error === "self") {
        toast("نمی‌تونی از کد خودت استفاده کنی.", true);
      } else if (r && r.error) {
        console.warn("invite_apply:", r.error);
      }
    } catch (e) { console.warn("invite_apply:", e); }
  }

  var _applyExtras = window.ayvinApplySignupExtras;
  window.ayvinApplySignupExtras = async function () {
    var code = inviteVal();
    var res = typeof _applyExtras === "function" ? await _applyExtras.apply(this, arguments) : undefined;
    if (code && me()) await applyInvite(code);
    return res;
  };

  /* بعد از ورود به برنامه: اگه دعوت‌شده بودی و شمارت تایید شد، دعوت‌کننده شمرده بشه؛
     اگه خودت دعوت‌کننده‌ای و به ۵ نفر رسیدی، تیک آبی بگیری */
  async function silentInviteSync() {
    try {
      if (!me() || !supabaseClient) return;
      var pending = false;
      try { pending = localStorage.getItem(INVITE_PENDING_KEY) === "1"; } catch (e) {}
      if (pending) {
        var rc = await supabaseClient.rpc("invite_recheck", { p_username: me() });
        var rd = rc && rc.data;
        if (rd && rd.ok && (!rd.has_referral || rd.counted)) { try { localStorage.removeItem(INVITE_PENDING_KEY); } catch (e) {} }
      }
      var d = await fetchInviteInfo(false);
      if (d && d.verified) applyVerifiedLocally();
    } catch (e) { /* بی‌صدا: ممکنه SQL هنوز اجرا نشده باشه */ }
  }

  var _proceed = window.proceedJoin;
  if (typeof _proceed === "function") {
    window.proceedJoin = async function () {
      var res = await _proceed.apply(this, arguments);
      setTimeout(silentInviteSync, 2500);
      return res;
    };
  }

  /* برای صفحه‌ی من / نمایش لینک پست (js/20-page-follow.js) */
  window.ayvinExplore = { openComments: openComments, toggleLike: toggleLike, statFor: statFor, loadStats: loadStats };
})();
