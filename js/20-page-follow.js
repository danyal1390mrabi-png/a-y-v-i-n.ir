/* ============================================================
   آیوین — ۲۰: صفحه‌ی من + فالوور + شیر پست + ساخت گروه/کانال (یک گزینه)
   • تنظیمات ← «صفحه‌ی من»: پست‌ها، لایک/کامنت/بازدید/شیر هر پست، و کنترل‌ها
     (بستن کامنت، مخفی کردن تعداد لایک، بستن شیر) برای کل صفحه یا هر پست
   • فالوور: دکمه‌ی دنبال کردن در پروفایل و اکسپلور + شمارنده و لیست
   • شیر: ارسال پست به شخص داخل آیوین، کپی لینک، اشتراک‌گذاری بیرونی
   • تنظیمات ← «ساخت گروه / کانال»: یک پنجره برای هر دو
   جدول‌ها در supabase-page-follow.sql
   ============================================================ */
(function () {
  "use strict";

  var SITE_URL = "https://ayvin.ir";

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
  function maxPosts() { return window.AYVIN_MAX_POSTS || 10; }
  function ex() { return window.ayvinExplore || null; }
  function openLightbox(url) {
    var img = $("lightboxImg"), ov = $("lightboxOverlay");
    if (!img || !ov || !url) return;
    img.src = url;
    ov.classList.add("open");
  }
  function keyOf(username, postId) { return String(username).toLowerCase() + ":" + postId; }
  function flagsOf(ps, p) {
    ps = (ps && typeof ps === "object") ? ps : {};
    p = p || {};
    return { noComments: !!(ps.comments_off || p.no_comments), hideLikes: !!(ps.hide_likes || p.hide_likes), noShare: !!(ps.shares_off || p.no_share) };
  }
  function isBlocked(u) {
    try {
      var k = String(u).toLowerCase();
      return (typeof blockedByMe !== "undefined" && (blockedByMe.has(u) || blockedByMe.has(k))) ||
             (typeof blockedMe !== "undefined" && (blockedMe.has(u) || blockedMe.has(k)));
    } catch (e) { return false; }
  }
  function likeLikeEscape(s) { return String(s).replace(/[\\%_,()]/g, function (c) { return c === "," || c === "(" || c === ")" ? "" : "\\" + c; }); }

  /* ============================================================
     ۱) فالوور
     ============================================================ */
  var fwSet = null, fwOwner = null, chips = [];

  async function loadFollowing() {
    var u = meLower();
    if (!u) return new Set();
    if (fwSet && fwOwner === u) return fwSet;
    fwOwner = u;
    fwSet = new Set();
    try {
      var r = await supabaseClient.from("follows").select("following").eq("follower", u).limit(5000);
      if (!r.error) (r.data || []).forEach(function (x) { fwSet.add(String(x.following).toLowerCase()); });
    } catch (e) {}
    return fwSet;
  }
  function isFollowingSync(u) { return !!(fwSet && fwSet.has(String(u).toLowerCase())); }

  async function setFollow(username, on) {
    var me_ = meLower(), target = String(username).toLowerCase();
    if (!me_) { toast("اول وارد حسابت شو."); return false; }
    if (me_ === target) return false;
    await loadFollowing();
    var was = fwSet.has(target);
    if (on) fwSet.add(target); else fwSet.delete(target);
    repaintChips();
    try {
      var r = on
        ? await supabaseClient.from("follows").insert({ follower: me_, following: target })
        : await supabaseClient.from("follows").delete().eq("follower", me_).eq("following", target);
      if (r.error && r.error.code !== "23505") throw r.error;
      return true;
    } catch (e) {
      console.warn("follow:", e);
      if (was) fwSet.add(target); else fwSet.delete(target);
      repaintChips();
      toast("ثبت دنبال کردن ناموفق بود؛ فایل SQL صفحه/فالوور رو در Supabase اجرا کن.", true, 4200);
      return false;
    }
  }

  async function fetchCounts(username) {
    var u = String(username).toLowerCase(), out = { followers: 0, following: 0 };
    try {
      var a = await supabaseClient.from("follows").select("follower", { count: "exact", head: true }).eq("following", u);
      var b = await supabaseClient.from("follows").select("following", { count: "exact", head: true }).eq("follower", u);
      if (!a.error) out.followers = a.count || 0;
      if (!b.error) out.following = b.count || 0;
    } catch (e) {}
    return out;
  }

  function paintChip(c) {
    var on = isFollowingSync(c.user);
    c.btn.textContent = c.full ? (on ? "✓ دنبال می‌کنی" : "➕ دنبال کردن") : (on ? "✓ دنبال شده" : "➕ دنبال");
    c.btn.classList.toggle("on", on);
  }
  function repaintChips() {
    chips = chips.filter(function (c) { return c.btn.isConnected; });
    chips.forEach(paintChip);
  }

  function makeFollowButton(username, full) {
    if (!me() || String(username).toLowerCase() === meLower()) return null;
    var btn = el("button", full ? "fw-btn" : "fw-chip");
    btn.type = "button";
    var c = { user: username, btn: btn, full: !!full, after: null };
    chips.push(c);
    paintChip(c);
    loadFollowing().then(function () { paintChip(c); });
    btn.onclick = function (e) {
      e.stopPropagation(); e.preventDefault();
      btn.disabled = true;
      setFollow(username, !isFollowingSync(username)).then(function () {
        btn.disabled = false;
        if (typeof c.after === "function") c.after();
      });
    };
    return btn;
  }
  window.ayvinMakeFollowChip = function (u) { return makeFollowButton(u, false); };

  /* لیست دنبال‌کننده‌ها / دنبال‌شونده‌ها */
  async function openFollowList(username, mode) {
    var m = ensureSimpleModal("followListModal", mode === "followers" ? "👥 دنبال‌کننده‌ها" : "👤 دنبال می‌کنه");
    var body = m.querySelector(".sm-body");
    body.innerHTML = '<div class="mp-empty">در حال بارگذاری...</div>';
    m.classList.add("open");
    var u = String(username).toLowerCase();
    try {
      var r = mode === "followers"
        ? await supabaseClient.from("follows").select("follower").eq("following", u).order("created_at", { ascending: false }).limit(200)
        : await supabaseClient.from("follows").select("following").eq("follower", u).order("created_at", { ascending: false }).limit(200);
      if (r.error) throw r.error;
      var names = (r.data || []).map(function (x) { return String(mode === "followers" ? x.follower : x.following); });
      if (!names.length) { body.innerHTML = '<div class="mp-empty">' + (mode === "followers" ? "هنوز دنبال‌کننده‌ای نیست." : "هنوز کسی رو دنبال نمی‌کنه.") + '</div>'; return; }
      var cond = names.map(function (n) { return "username.ilike." + likeLikeEscape(n); }).join(",");
      var pr = await selectUsers(function (q) { return q.or(cond); });
      var rows = (pr && pr.data) || [];
      body.innerHTML = "";
      if (!rows.length) { body.innerHTML = '<div class="mp-empty">موردی پیدا نشد.</div>'; return; }
      rows.forEach(function (p) {
        if (isBlocked(p.username)) return;
        var row = el("div", "fw-row");
        var av = el("span", "avatar");
        try { setAvatarElement(av, p, p.name || p.username); } catch (e) {}
        row.appendChild(av);
        var tx = el("div");
        var nm = el("div", "fw-name");
        nm.innerHTML = esc(p.name || p.username) + (typeof vBadge === "function" ? vBadge(p) : "");
        tx.appendChild(nm);
        tx.appendChild(el("div", "fw-sub", "@" + p.username));
        row.appendChild(tx);
        row.onclick = function () { m.classList.remove("open"); if (typeof showProfile === "function") showProfile(p); };
        body.appendChild(row);
      });
    } catch (e) {
      console.warn("follow list:", e);
      body.innerHTML = '<div class="mp-empty">بارگذاری نشد.<br>مطمئن شو فایل SQL رو اجرا کردی.</div>';
    }
  }

  /* جعبه‌ی فالوور داخل پروفایل (17-onboarding صدا می‌زنه) */
  window.ayvinRenderFollowBox = function (box, p, own) {
    if (!box || !p || !p.username) return;
    var wrap = el("div", "fw-box");
    var stats = el("div", "fw-stats");
    function stat(label, id, mode) {
      var s = el("div", "fw-stat");
      s.innerHTML = '<b id="' + id + '">—</b><span>' + label + '</span>';
      if (mode) s.onclick = function () { openFollowList(p.username, mode); };
      return s;
    }
    var sFollowers = stat("دنبال‌کننده", "fwNumFollowers", "followers");
    var sFollowing = stat("دنبال‌شونده", "fwNumFollowing", "following");
    stats.appendChild(sFollowers);
    stats.appendChild(sFollowing);
    wrap.appendChild(stats);
    box.appendChild(wrap);

    function refresh() {
      fetchCounts(p.username).then(function (c) {
        if (!wrap.isConnected) return;
        sFollowers.querySelector("b").textContent = fmtCount(c.followers);
        sFollowing.querySelector("b").textContent = fmtCount(c.following);
      });
    }
    refresh();
    if (!own) {
      var btn = makeFollowButton(p.username, true);
      if (btn) {
        chips[chips.length - 1].after = refresh;
        wrap.appendChild(btn);
      }
    }
  };

  /* ============================================================
     ۲) تنظیمات صفحه و پست
     ============================================================ */
  async function getPageSettings() {
    try {
      var r = await supabaseClient.from("users").select("page_settings").eq("username", me()).maybeSingle();
      if (!r.error && r.data && r.data.page_settings && typeof r.data.page_settings === "object") return r.data.page_settings;
    } catch (e) {}
    return {};
  }
  async function savePageSettings(obj) {
    var r = await supabaseClient.from("users").update({ page_settings: obj }).eq("username", me());
    if (r.error) throw r.error;
    try { myProfile.page_settings = obj; } catch (e) {}
  }

  function openPageSettings(onChange) {
    var m = ensureSimpleModal("pageSettingsModal", "⚙️ تنظیمات صفحه");
    var body = m.querySelector(".sm-body");
    body.innerHTML = '<div class="mp-empty">در حال بارگذاری...</div>';
    m.classList.add("open");
    getPageSettings().then(function (ps) {
      body.innerHTML =
        toggleRow("psComments", "بستن کامنت‌ها", "هیچ‌کس زیر پست‌های تو نمی‌تونه کامنت بذاره.", !!ps.comments_off) +
        toggleRow("psHideLikes", "مخفی کردن تعداد لایک‌ها", "تعداد لایک پست‌ها فقط برای خودت نمایش داده می‌شه.", !!ps.hide_likes) +
        toggleRow("psShares", "بستن اشتراک‌گذاری (شیر)", "دیگران نمی‌تونن پست‌هات رو برای کسی بفرستن.", !!ps.shares_off) +
        '<div class="mp-note">این تنظیمات برای همه‌ی پست‌های صفحه‌ات اعمال می‌شه. برای هر پست هم می‌تونی جداگونه از دکمه‌ی ⚙️ زیر همون پست محدودیت اضافه کنی.</div>';
      var map = { psComments: "comments_off", psHideLikes: "hide_likes", psShares: "shares_off" };
      Object.keys(map).forEach(function (id) {
        body.querySelector("#" + id).onchange = async function (e) {
          var cb = e.target, next = Object.assign({}, ps);
          next[map[id]] = !!cb.checked;
          try {
            await savePageSettings(next);
            ps = next;
            toast("ذخیره شد ✅");
            if (typeof onChange === "function") onChange();
          } catch (err) {
            cb.checked = !cb.checked;
            toast("ذخیره ناموفق بود؛ فایل SQL صفحه/فالوور رو در Supabase اجرا کن.", true, 4200);
          }
        };
      });
    });
  }

  async function updateMyPost(postId, patch) {
    var r = await supabaseClient.from("users").select("posts").eq("username", me()).maybeSingle();
    if (r.error) throw r.error;
    var posts = (r.data && Array.isArray(r.data.posts)) ? r.data.posts : [];
    posts = posts.map(function (p) { return (p && p.id === postId) ? Object.assign({}, p, patch) : p; });
    var u = await supabaseClient.from("users").update({ posts: posts }).eq("username", me());
    if (u.error) throw u.error;
    try { myProfile.posts = posts; } catch (e) {}
  }

  function openPostSettings(post, onChange) {
    var m = ensureSimpleModal("postSettingsModal", "⚙️ تنظیمات این پست");
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      toggleRow("pcComments", "بستن کامنت‌های این پست", "فقط برای همین پست.", !!post.no_comments) +
      toggleRow("pcHideLikes", "مخفی کردن تعداد لایک این پست", "برای بقیه نمایش داده نمی‌شه.", !!post.hide_likes) +
      toggleRow("pcShares", "بستن شیر این پست", "دیگران نمی‌تونن این پست رو بفرستن.", !!post.no_share);
    var map = { pcComments: "no_comments", pcHideLikes: "hide_likes", pcShares: "no_share" };
    Object.keys(map).forEach(function (id) {
      body.querySelector("#" + id).onchange = async function (e) {
        var cb = e.target, patch = {};
        patch[map[id]] = !!cb.checked;
        try {
          await updateMyPost(post.id, patch);
          post[map[id]] = !!cb.checked;
          toast("ذخیره شد ✅");
          if (typeof onChange === "function") onChange();
        } catch (err) { cb.checked = !cb.checked; toast("ذخیره ناموفق بود.", true); }
      };
    });
    m.classList.add("open");
  }

  /* ============================================================
     ۳) شیر
     ============================================================ */
  function postLink(item) { return SITE_URL + "/?post=" + encodeURIComponent(item.key); }

  function recordShare(item) {
    try {
      if (!meLower()) return;
      supabaseClient.from("post_shares").insert({ post_id: item.key, username: meLower() }).then(function (r) {
        if (r && !r.error) { var c = shareCounts[item.key]; if (c != null) shareCounts[item.key] = c + 1; }
      }, function () {});
    } catch (e) {}
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

  function shareText(item) {
    var p = item.post || {}, snippet = p.text ? String(p.text).replace(/\s+/g, " ").slice(0, 80) : (p.video ? "🎬 ویدیو" : "🖼️ عکس");
    return "📌 یه پست از @" + item.username + " توی آیوین:\n" + snippet + "\n" + postLink(item);
  }

  async function sendToUser(item, user) {
    var text = shareText(item);
    var r = await supabaseClient.from("private_messages").insert({
      dm_key: dmKeyForUser(user.username),
      sender_username: myProfile.username,
      sender_name: myProfile.name || myProfile.username,
      receiver_username: user.username,
      text: text
    });
    if (r.error) throw r.error;
  }

  window.ayvinSharePost = function (item) {
    if (!item || !item.key) return;
    if (!me()) { toast("اول وارد حسابت شو."); return; }
    var own = String(item.username).toLowerCase() === meLower();
    if (item.flags && item.flags.noShare && !own) { toast("صاحب این پست اشتراک‌گذاری رو بسته.", true); return; }

    var m = ensureSimpleModal("shareModal", "📤 ارسال پست");
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      '<div class="sh-ext"><button type="button" class="modal-close" id="shCopy">🔗 کپی لینک</button><button type="button" class="call-send-btn" id="shExt">📲 اشتراک‌گذاری</button></div>' +
      '<div class="ai-select-label">ارسال برای یک نفر در آیوین</div>' +
      '<input class="sh-search" id="shSearch" type="text" placeholder="جستجوی اسم یا یوزرنیم..." autocomplete="off">' +
      '<div class="sh-list" id="shList"><div class="mp-empty">در حال بارگذاری...</div></div>';
    m.classList.add("open");

    body.querySelector("#shCopy").onclick = function () { copyText(postLink(item), "لینک پست کپی شد ✅"); recordShare(item); };
    body.querySelector("#shExt").onclick = function () {
      var t = shareText(item);
      if (navigator.share) { navigator.share({ text: t }).then(function () { recordShare(item); }).catch(function () {}); }
      else { copyText(t, "متن پست کپی شد ✅"); recordShare(item); }
    };

    var list = body.querySelector("#shList"), input = body.querySelector("#shSearch"), timer = null, seq = 0;
    async function load(q) {
      var my = ++seq;
      list.innerHTML = '<div class="mp-empty">در حال بارگذاری...</div>';
      try {
        var r = await selectUsers(function (qq) {
          if (q) {
            var s = likeLikeEscape(q);
            return qq.or("username.ilike.%" + s + "%,name.ilike.%" + s + "%").limit(30);
          }
          return qq.limit(40);
        });
        if (my !== seq) return;
        var rows = ((r && r.data) || []).filter(function (u) { return u && u.username && String(u.username).toLowerCase() !== meLower() && !isBlocked(u.username); });
        list.innerHTML = "";
        if (!rows.length) { list.innerHTML = '<div class="mp-empty">کسی پیدا نشد.</div>'; return; }
        rows.forEach(function (u) {
          var row = el("div", "sh-row");
          var av = el("span", "avatar");
          try { setAvatarElement(av, u, u.name || u.username); } catch (e) {}
          row.appendChild(av);
          var nm = el("div", "sh-name");
          nm.innerHTML = esc(u.name || u.username) + '<div class="fw-sub">@' + esc(u.username) + '</div>';
          row.appendChild(nm);
          var b = el("button", null, "ارسال");
          b.type = "button";
          b.onclick = async function () {
            if (b.classList.contains("done")) return;
            b.disabled = true;
            try { await sendToUser(item, u); b.textContent = "✓ فرستاده شد"; b.classList.add("done"); recordShare(item); }
            catch (e) { console.warn("share send:", e); toast("ارسال ناموفق بود.", true); }
            b.disabled = false;
          };
          row.appendChild(b);
          list.appendChild(row);
        });
      } catch (e) { if (my === seq) list.innerHTML = '<div class="mp-empty">بارگذاری نشد.</div>'; }
    }
    input.oninput = function () { clearTimeout(timer); timer = setTimeout(function () { load(input.value.trim()); }, 300); };
    load("");
  };

  /* ============================================================
     ۴) کارت پست (برای صفحه‌ی من و نمایش لینک شیرشده)
     ============================================================ */
  var shareCounts = {};
  var cards = {};   // key -> { like, cmt, view, share, bar, flagsEl, item }

  function statFor(key) { var e = ex(); return e ? e.statFor(key) : { likes: 0, comments: 0, views: 0, liked: false }; }

  function paintCard(key) {
    var c = cards[key];
    if (!c || !c.like || !c.like.isConnected) return;
    var st = statFor(key), own = String(c.item.username).toLowerCase() === meLower();
    var hide = c.item.flags && c.item.flags.hideLikes && !own;
    c.likeBtn.classList.toggle("liked", !!st.liked);
    c.like.textContent = (st.liked ? "❤️ " : "🤍 ") + (hide ? "" : fmtCount(st.likes));
    c.cmt.textContent = "💬 " + fmtCount(st.comments);
    if (c.view) c.view.textContent = "👁 " + fmtCount(st.views);
    if (c.share) c.share.textContent = "📤 " + fmtCount(shareCounts[key] || 0);
    if (c.onPaint) c.onPaint();
  }
  window.ayvinOnPaint = function (key) { paintCard(key); };

  function buildPostCard(item, opts) {
    opts = opts || {};
    var p = item.post, own = !!opts.own;
    var card = el("div", "mp-card");
    var c = { item: item };
    cards[item.key] = c;

    if (opts.author) {
      var au = el("div", "mp-card-author");
      var av = el("span", "avatar");
      try { setAvatarElement(av, item.profile, item.profile.name); } catch (e) {}
      au.appendChild(av);
      var nm = el("div");
      nm.innerHTML = '<b>' + esc(item.profile.name || item.username) + '</b>' + (typeof vBadge === "function" ? vBadge(item.profile) : "") + '<div class="fw-sub">@' + esc(item.username) + '</div>';
      au.appendChild(nm);
      au.style.cursor = "pointer";
      au.onclick = function () { if (typeof showProfile === "function") { var mm = $("postViewerModal"); if (mm) mm.classList.remove("open"); showProfile(item.profile); } };
      card.appendChild(au);
    }
    if (p.image) {
      var im = el("img", "mp-card-media");
      im.src = p.image; im.alt = ""; im.loading = "lazy";
      im.onclick = function () { openLightbox(p.image); };
      card.appendChild(im);
    }
    if (p.video) {
      var vd = el("video", "mp-card-media");
      vd.src = p.video; vd.controls = true; vd.playsInline = true; vd.preload = "metadata";
      card.appendChild(vd);
    }
    if (p.text) card.appendChild(el("div", "mp-card-text", String(p.text)));
    if (p.at) {
      var dt = el("div", "mp-card-date");
      try { dt.textContent = new Date(p.at).toLocaleDateString("fa-IR"); } catch (e) {}
      card.appendChild(dt);
    }

    var bar = el("div", "mp-card-bar");
    var likeBtn = el("button", "mp-chip"); likeBtn.type = "button";
    c.like = el("span"); likeBtn.appendChild(c.like); c.likeBtn = likeBtn;
    likeBtn.onclick = function () { var e = ex(); if (e) e.toggleLike(item); };
    bar.appendChild(likeBtn);

    var cmtBtn = el("button", "mp-chip"); cmtBtn.type = "button";
    c.cmt = el("span"); cmtBtn.appendChild(c.cmt);
    cmtBtn.onclick = function () { var e = ex(); if (e) e.openComments(item); };
    bar.appendChild(cmtBtn);

    if (own) {
      var vw = el("span", "mp-chip static"); c.view = vw; bar.appendChild(vw);
    }

    var canShare = own || !(item.flags && item.flags.noShare);
    if (canShare) {
      var shBtn = el("button", "mp-chip"); shBtn.type = "button";
      if (own) { c.share = el("span"); shBtn.appendChild(c.share); }
      else shBtn.textContent = "📤 ارسال";
      shBtn.onclick = function () { window.ayvinSharePost(item); };
      bar.appendChild(shBtn);
    }

    if (own) {
      var setBtn = el("button", "mp-chip", "⚙️"); setBtn.type = "button";
      setBtn.onclick = function () { openPostSettings(p, function () { item.flags = flagsOf(opts.pageSettings, p); paintCard(item.key); paintFlags(c, p, opts.pageSettings); }); };
      bar.appendChild(setBtn);
      var delBtn = el("button", "mp-chip danger", "🗑️"); delBtn.type = "button";
      delBtn.onclick = async function () {
        if (!(await showAppConfirm("این پست حذف بشه؟", { confirmText: "حذف", danger: true }))) return;
        try {
          var r = await supabaseClient.from("users").select("posts").eq("username", me()).maybeSingle();
          var posts = (r.data && Array.isArray(r.data.posts)) ? r.data.posts : [];
          posts = posts.filter(function (x) { return x && x.id !== p.id; });
          var u = await supabaseClient.from("users").update({ posts: posts }).eq("username", me());
          if (u.error) throw u.error;
          myProfile.posts = posts;
          if (typeof window.ayvinPurgePost === "function") { try { await window.ayvinPurgePost(p, item.key); } catch (e) {} }
          toast("پست حذف شد");
          if (typeof opts.onDeleted === "function") opts.onDeleted();
        } catch (e) { toast("حذف ناموفق بود.", true); }
      };
      bar.appendChild(delBtn);
    }
    card.appendChild(bar);

    if (own) {
      var fl = el("div", "mp-flags"); c.flagsEl = fl; card.appendChild(fl);
      paintFlags(c, p, opts.pageSettings);
    }
    return card;
  }

  function paintFlags(c, p, ps) {
    if (!c.flagsEl) return;
    var f = flagsOf(ps, p), t = [];
    if (f.noComments) t.push("🔒 کامنت‌ها بسته است");
    if (f.hideLikes) t.push("🙈 تعداد لایک برای بقیه مخفیه");
    if (f.noShare) t.push("🚫 شیر بسته است");
    c.flagsEl.textContent = t.join(" · ");
    c.flagsEl.style.display = t.length ? "" : "none";
  }

  /* ============================================================
     ۵) صفحه‌ی من
     ============================================================ */
  var pageEl = null;
  window.ayvinMyPageOpen = function () { return !!(pageEl && pageEl.classList.contains("open")); };

  function ensurePage() {
    if (pageEl) return pageEl;
    pageEl = el("div"); pageEl.id = "myPageScreen";
    pageEl.innerHTML =
      '<div class="mp-top"><button type="button" class="mp-iconbtn" id="mpBack" aria-label="بازگشت">›</button>' +
      '<div class="mp-title" id="mpTitle">📄 صفحه‌ی من</div>' +
      '<button type="button" class="mp-iconbtn" id="mpSettings" aria-label="تنظیمات صفحه">⚙️</button></div>' +
      '<div class="mp-scroll" id="mpScroll"></div>';
    document.body.appendChild(pageEl);
    pageEl.querySelector("#mpBack").onclick = closePage;
    pageEl.querySelector("#mpSettings").onclick = function () { openPageSettings(function () { renderPage(true); }); };
    return pageEl;
  }
  function closePage() { if (pageEl) pageEl.classList.remove("open"); }

  var pageToken = 0, pageTarget = null;   // pageTarget = null یعنی صفحه‌ی خودم
  function pageIsOwn() { return !pageTarget || String(pageTarget).toLowerCase() === meLower(); }

  async function fetchPageRow(username, own) {
    var colsList = own ? ["posts,page_settings", "posts"]
      : ["username,name,avatar_url,verified,bio,posts,page_settings,privacy", "username,name,avatar_url,verified,bio,posts,page_settings",
         "username,name,avatar_url,bio,posts,page_settings", "username,name,avatar_url,posts"];
    for (var i = 0; i < colsList.length; i++) {
      try {
        var q = supabaseClient.from("users").select(colsList[i]);
        q = own ? q.eq("username", me()).maybeSingle() : q.ilike("username", likeLikeEscape(username)).limit(1);
        var r = await q;
        if (!r.error) return own ? (r.data || {}) : ((r.data && r.data[0]) || false);
      } catch (e) {}
    }
    return null;
  }

  async function renderPage(keepScroll) {
    var scroll = $("mpScroll");
    if (!scroll) return;
    var own = pageIsOwn();
    var token = ++pageToken, oldTop = keepScroll ? scroll.scrollTop : 0;
    pageEl.querySelector("#mpSettings").style.display = own ? "" : "none";
    if (!keepScroll) scroll.innerHTML = '<div class="mp-empty"><div class="ayv-spin" style="margin:0 auto 10px"></div>در حال بارگذاری صفحه...</div>';
    var row = await fetchPageRow(pageTarget, own);
    if (token !== pageToken) return;
    if (row === null) { scroll.innerHTML = '<div class="mp-empty">صفحه بارگذاری نشد؛ اینترنتت رو چک کن.</div>'; return; }
    if (row === false) { scroll.innerHTML = '<div class="mp-empty">این کاربر پیدا نشد.</div>'; return; }

    var prof = own ? myProfile : { username: row.username, name: row.name || row.username, avatar_url: row.avatar_url, verified: !!row.verified, bio: row.bio };
    var uname = own ? me() : row.username;
    if (!own) { try { if (typeof rememberPrivacy === "function") rememberPrivacy([row]); } catch (e) {} }
    pageEl.querySelector("#mpTitle").textContent = own ? "📄 صفحه‌ی من" : "📄 صفحه‌ی " + (prof.name || uname);

    var ps = (row.page_settings && typeof row.page_settings === "object") ? row.page_settings : {};
    var canPosts = true;
    if (!own) { try { canPosts = typeof canSeeField === "function" ? canSeeField(uname, "posts") : true; } catch (e) {} }
    var posts = (Array.isArray(row.posts) ? row.posts : []).filter(function (p) { return p && p.id; });
    posts = posts.slice().sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); });
    if (own) { try { myProfile.posts = row.posts || []; } catch (e) {} }

    cards = {};
    scroll.innerHTML = "";

    /* هدر */
    var head = el("div", "mp-head");
    var av = el("span", "avatar");
    try { setAvatarElement(av, prof, prof.name || "?"); } catch (e) {}
    head.appendChild(av);
    var nm = el("div", "mp-name");
    nm.innerHTML = esc(prof.name || uname) + (typeof vBadge === "function" ? vBadge(prof) : "");
    head.appendChild(nm);
    head.appendChild(el("div", "mp-user", "@" + uname));
    if (prof.bio) head.appendChild(el("div", "mp-bio", String(prof.bio)));
    scroll.appendChild(head);

    /* آمار فالوور */
    var fwWrap = el("div", "fw-box"), stats = el("div", "fw-stats");
    function mk(label, mode) {
      var s = el("div", "fw-stat");
      s.innerHTML = "<b>—</b><span>" + label + "</span>";
      if (mode) s.onclick = function () { openFollowList(uname, mode); };
      return s;
    }
    var sPosts = mk("پست"), sFollowers = mk("دنبال‌کننده", "followers"), sFollowing = mk("دنبال‌شونده", "following");
    sPosts.querySelector("b").textContent = (own || canPosts) ? (toFa(posts.length) + (own ? "/" + toFa(maxPosts()) : "")) : "—";
    [sPosts, sFollowers, sFollowing].forEach(function (s) { stats.appendChild(s); });
    fwWrap.appendChild(stats);
    scroll.appendChild(fwWrap);
    function refreshCounts() {
      fetchCounts(uname).then(function (cn) {
        if (!fwWrap.isConnected) return;
        sFollowers.querySelector("b").textContent = fmtCount(cn.followers);
        sFollowing.querySelector("b").textContent = fmtCount(cn.following);
      });
    }
    refreshCounts();

    /* دکمه‌ها */
    var act = el("div", "mp-actions");
    if (own) {
      var addBtn = el("button", "call-send-btn", "➕ پست جدید");
      addBtn.type = "button";
      if (posts.length >= maxPosts()) { addBtn.disabled = true; addBtn.textContent = "سقف " + toFa(maxPosts()) + " پست پر شده"; addBtn.style.opacity = ".6"; }
      addBtn.onclick = function () { if (typeof window.ayvinOpenPostModal === "function") window.ayvinOpenPostModal(); };
      var editBtn = el("button", "modal-close", "✏️ ویرایش مشخصات");
      editBtn.type = "button";
      editBtn.onclick = function () { if (typeof showProfile === "function") showProfile(myProfile); };
      act.appendChild(addBtn); act.appendChild(editBtn);
    } else {
      var fb = makeFollowButton(uname, true);
      if (fb) { fb.style.marginTop = "0"; chips[chips.length - 1].after = refreshCounts; act.appendChild(fb); }
      var infoBtn = el("button", "modal-close", "👤 مشخصات");
      infoBtn.type = "button";
      infoBtn.onclick = function () { if (typeof showProfile === "function") showProfile(prof); };
      act.appendChild(infoBtn);
    }
    scroll.appendChild(act);

    /* جمع کل (فقط صفحه‌ی خودم) */
    var tLikes, tCmts, tViews, tShares;
    if (own) {
      var tot = el("div", "mp-totals");
      var tcell = function (label) { var d = el("div", "mp-tot"); d.innerHTML = "<b>۰</b><span>" + label + "</span>"; tot.appendChild(d); return d.querySelector("b"); };
      tLikes = tcell("لایک"); tCmts = tcell("کامنت"); tViews = tcell("بازدید"); tShares = tcell("شیر");
      scroll.appendChild(tot);
    }

    scroll.appendChild(el("div", "mp-h", own ? "📝 پست‌های من" : "📝 پست‌ها"));
    var listBox = el("div");
    scroll.appendChild(listBox);

    var items = posts.map(function (p) {
      return { key: keyOf(uname, p.id), username: uname, profile: prof, post: p, flags: flagsOf(ps, p) };
    });

    function totals() {
      if (!own) return;
      var l = 0, c = 0, v = 0, s = 0;
      items.forEach(function (it) { var st = statFor(it.key); l += st.likes; c += st.comments; v += st.views; s += (shareCounts[it.key] || 0); });
      tLikes.textContent = fmtCount(l); tCmts.textContent = fmtCount(c); tViews.textContent = fmtCount(v); tShares.textContent = fmtCount(s);
    }

    if (!own && !canPosts) {
      items = [];
      listBox.innerHTML = '<div class="mp-empty">🔒 این کاربر پست‌هاش رو مخفی کرده.</div>';
    } else if (!items.length) {
      listBox.innerHTML = own
        ? '<div class="mp-empty">هنوز پستی نذاشتی.<br>با «➕ پست جدید» شروع کن.</div>'
        : '<div class="mp-empty">هنوز پستی نذاشته.</div>';
    } else {
      items.forEach(function (it) {
        var card = buildPostCard(it, { own: own, pageSettings: ps, onDeleted: function () { renderPage(true); } });
        cards[it.key].onPaint = totals;
        listBox.appendChild(card);
      });
    }

    if (own) scroll.appendChild(el("div", "mp-note", "💡 تعداد لایک همیشه برای خودت نمایش داده می‌شه؛ حتی اگه برای بقیه مخفی باشه."));
    scroll.scrollTop = oldTop;

    /* آمار */
    if (items.length) {
      var e = ex();
      if (e) { try { await e.loadStats(items); } catch (err) {} }
      if (own) {
        try {
          var sr = await supabaseClient.from("post_shares").select("post_id").in("post_id", items.map(function (i) { return i.key; })).limit(5000);
          if (!sr.error) {
            items.forEach(function (i) { shareCounts[i.key] = 0; });
            (sr.data || []).forEach(function (x) { shareCounts[x.post_id] = (shareCounts[x.post_id] || 0) + 1; });
          }
        } catch (err) {}
      }
      if (token !== pageToken) return;
      items.forEach(function (i) { paintCard(i.key); });
      totals();
    }
  }

  window.ayvinPostsChanged = function () { if (window.ayvinMyPageOpen() && pageIsOwn()) renderPage(true); };

  function openPageOf(username) {
    if (!me()) { toast("اول وارد حسابت شو."); return; }
    pageTarget = (!username || String(username).toLowerCase() === meLower()) ? null : String(username);
    ensurePage().classList.add("open");
    renderPage(false);
  }
  function openMyPage() { openPageOf(null); }
  window.ayvinOpenMyPage = openMyPage;
  window.ayvinOpenUserPage = openPageOf;

  /* ============================================================
     ۶) باز کردن لینک پست (?post=username:id)
     ============================================================ */
  async function fetchPostRow(username) {
    var colsList = ["username,name,avatar_url,verified,posts,page_settings,privacy", "username,name,avatar_url,posts,page_settings", "username,name,avatar_url,posts"];
    for (var i = 0; i < colsList.length; i++) {
      try {
        var r = await supabaseClient.from("users").select(colsList[i]).ilike("username", likeLikeEscape(username)).limit(1);
        if (!r.error) return (r.data && r.data[0]) || null;
      } catch (e) {}
    }
    return null;
  }

  async function openPostByKey(key) {
    var i = key.indexOf(":");
    if (i < 1) return false;
    var uname = key.slice(0, i), pid = key.slice(i + 1);
    var row = await fetchPostRow(uname);
    if (!row) { toast("این پست پیدا نشد.", true); return false; }
    try { if (typeof rememberPrivacy === "function") rememberPrivacy([row]); } catch (e) {}
    var own = String(row.username).toLowerCase() === meLower();
    var post = (Array.isArray(row.posts) ? row.posts : []).filter(function (p) { return p && p.id === pid; })[0];
    if (!post) { toast("این پست دیگه وجود نداره.", true); return false; }
    var allowed = true;
    try { allowed = own || (typeof canSeeField === "function" ? canSeeField(row.username, "posts") : true); } catch (e) {}
    if (!allowed || (!own && isBlocked(row.username))) { toast("دسترسی به این پست ممکن نیست.", true); return false; }

    var prof = { username: row.username, name: row.name || row.username, avatar_url: row.avatar_url, verified: !!row.verified };
    var item = { key: keyOf(row.username, pid), username: row.username, profile: prof, post: post, flags: flagsOf(row.page_settings, post) };
    var m = ensureSimpleModal("postViewerModal", "📌 پست");
    var body = m.querySelector(".sm-body");
    body.innerHTML = "";
    body.appendChild(buildPostCard(item, { own: false, author: true }));
    m.classList.add("open");
    var e2 = ex();
    if (e2) { try { await e2.loadStats([item]); } catch (err) {} }
    paintCard(item.key);
    return true;
  }

  var deepDone = false;
  function deepLinkTick() {
    if (deepDone) return;
    var key = null;
    try { key = new URLSearchParams(location.search).get("post"); } catch (e) {}
    if (!key) { deepDone = true; return; }
    if (!me() || !ex()) return;
    deepDone = true;
    try { history.replaceState({}, "", location.pathname); } catch (e) {}
    openPostByKey(key);
  }
  (function () {
    var n = 0, t = setInterval(function () { deepLinkTick(); if (deepDone || ++n > 40) clearInterval(t); }, 1000);
  })();

  /* ============================================================
     ۷) ساخت گروه / کانال (یک گزینه در تنظیمات)
     ============================================================ */
  var ceState = { type: "group", file: null, previewUrl: null };

  function resizeToBlob(file, max, quality) {
    return new Promise(function (resolve) {
      try {
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var s = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * s));
          c.height = Math.max(1, Math.round(img.height * s));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { resolve(b || file); }, "image/jpeg", quality);
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      } catch (e) { resolve(file); }
    });
  }
  async function uploadEntityAvatar(file, prefix) {
    var blob = await resizeToBlob(file, 640, 0.85);
    var path = "avatars/" + prefix + "_" + Date.now() + ".jpg";
    var r = await supabaseClient.storage.from("images").upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
    if (r.error) throw r.error;
    var u = supabaseClient.storage.from("images").getPublicUrl(path);
    return u && u.data && u.data.publicUrl;
  }

  function openCreateEntity(startType) {
    if (!me()) { toast("اول وارد حسابت شو."); return; }
    ceState = { type: "group", file: null, previewUrl: null };
    var m = ensureSimpleModal("createEntityModal", "➕ ساخت گروه / کانال");
    var body = m.querySelector(".sm-body");
    var botsHtml = "";
    try { if (typeof AI_BOTS !== "undefined") botsHtml = AI_BOTS.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.avatar) + " " + esc(b.name) + "</option>"; }).join(""); } catch (e) {}

    body.innerHTML =
      '<div class="ce-seg"><button type="button" data-t="group" class="on">👥 گروه</button><button type="button" data-t="channel">📢 کانال</button></div>' +
      '<button type="button" class="ce-avatar" id="ceAvatar" aria-label="عکس">📷</button>' +
      '<div class="ce-lbl" id="ceAvatarLbl">عکس گروه (الزامی)</div>' +
      '<input id="ceAvatarFile" type="file" accept="image/*" style="display:none">' +
      '<input id="ceName" type="text" maxlength="30" placeholder="اسم گروه (انگلیسی)" autocomplete="off">' +
      '<input id="ceBio" type="text" maxlength="150" placeholder="بیوگرافی (الزامی)" autocomplete="off">' +
      '<div id="ceGroupOnly">' +
        '<input id="cePass" type="text" maxlength="30" placeholder="پسورد (اختیاری)" autocomplete="off">' +
        '<div class="ai-select-label">دستیار هوش مصنوعی گروه (اختیاری)</div>' +
        '<select id="ceAi"><option value="">— بدون هوش مصنوعی —</option>' + botsHtml + '</select>' +
      '</div>' +
      '<div id="ceChannelOnly" style="display:none">' +
        '<div class="ai-select-label">نوع کانال</div>' +
        '<select id="cePrivate"><option value="false">🌐 عمومی</option><option value="true">🔒 خصوصی</option></select>' +
      '</div>' +
      '<div class="login-error" id="ceError"></div>' +
      '<button type="button" class="call-send-btn" id="ceCreate">ساخت گروه</button>';
    m.classList.add("open");

    var nameEl = body.querySelector("#ceName"), err = body.querySelector("#ceError"), createBtn = body.querySelector("#ceCreate");
    function setType(t) {
      ceState.type = t;
      body.querySelectorAll(".ce-seg button").forEach(function (b) { b.classList.toggle("on", b.dataset.t === t); });
      body.querySelector("#ceGroupOnly").style.display = t === "group" ? "" : "none";
      body.querySelector("#ceChannelOnly").style.display = t === "channel" ? "" : "none";
      body.querySelector("#ceAvatarLbl").textContent = (t === "group" ? "عکس گروه" : "عکس کانال") + " (الزامی)";
      nameEl.placeholder = t === "group" ? "اسم گروه (انگلیسی)" : "اسم کانال";
      nameEl.maxLength = t === "group" ? 30 : 80;
      createBtn.textContent = t === "group" ? "ساخت گروه" : "ساخت کانال";
      err.textContent = "";
    }
    body.querySelectorAll(".ce-seg button").forEach(function (b) { b.onclick = function () { setType(b.dataset.t); }; });

    var avBtn = body.querySelector("#ceAvatar"), avFile = body.querySelector("#ceAvatarFile");
    avBtn.onclick = function () { avFile.click(); };
    avFile.onchange = function () {
      var f = avFile.files && avFile.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { err.textContent = "فقط فایل تصویری انتخاب کن."; return; }
      if (f.size > 8 * 1024 * 1024) { err.textContent = "حجم عکس باید حداکثر ۸ مگابایت باشه."; return; }
      err.textContent = "";
      ceState.file = f;
      if (ceState.previewUrl) { try { URL.revokeObjectURL(ceState.previewUrl); } catch (e) {} }
      ceState.previewUrl = URL.createObjectURL(f);
      avBtn.style.backgroundImage = "url('" + ceState.previewUrl + "')";
      avBtn.classList.add("has-img");
    };

    createBtn.onclick = async function () {
      err.textContent = "";
      var name = nameEl.value.trim(), bio = body.querySelector("#ceBio").value.trim();
      if (!ceState.file) { err.textContent = "یه عکس انتخاب کن 📷"; return; }
      if (!name) { err.textContent = ceState.type === "group" ? "اسم گروه رو وارد کن." : "اسم کانال رو وارد کن."; return; }
      if (!bio) { err.textContent = "بیوگرافی رو بنویس ✍️"; return; }
      createBtn.disabled = true;
      var old = createBtn.textContent;
      createBtn.textContent = "در حال ساخت...";
      if (window.ayvinBusy) window.ayvinBusy(true);
      try {
        if (ceState.type === "group") await createGroup(m, name, bio, body, err);
        else await createChannel(m, name, bio, body, err);
      } finally {
        if (window.ayvinBusy) window.ayvinBusy(false);
        createBtn.disabled = false;
        createBtn.textContent = old;
      }
    };
    if (startType === "channel" || startType === "group") setType(startType);
  }
  window.ayvinOpenCreateEntity = function (t) { return openCreateEntity(t); };

  async function createGroup(m, name, bio, body, err) {
    if (!/^[A-Za-z0-9 _-]+$/.test(name)) { err.textContent = "اسم گروه فقط باید انگلیسی باشه (حروف، عدد، فاصله، - و _)."; return; }
    var password = body.querySelector("#cePass").value.trim();
    var aiBotId = body.querySelector("#ceAi").value || null;
    var slug = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    var passwordHash = password ? await sha256Hex(password) : null;
    var r = await supabaseClient.from("rooms").insert({ name: name, slug: slug, password_hash: passwordHash, ai_bot_id: aiBotId }).select().single();
    if (r.error || !r.data) { err.textContent = "ساخت گروه ناموفق بود."; return; }
    var room = r.data;
    try { await ensureRoomOwner(room.id); } catch (e) {}
    var upd = { bio: bio };
    try { upd.avatar_url = await uploadEntityAvatar(ceState.file, "room_" + room.id); }
    catch (e) { console.warn("room avatar:", e); toast("آپلود عکس گروه ناموفق بود؛ بعداً از اطلاعات گروه عوضش کن.", true, 4500); }
    var u = await supabaseClient.from("rooms").update(upd).eq("id", room.id);
    if (u.error) {
      if (upd.avatar_url) {
        var u2 = await supabaseClient.from("rooms").update({ avatar_url: upd.avatar_url }).eq("id", room.id);
        if (!u2.error) room.avatar_url = upd.avatar_url;
      }
      toast("بیوگرافی گروه ذخیره نشد؛ فایل supabase-features.sql رو اجرا کن.", true, 5000);
    } else Object.assign(room, upd);
    try { myRoomIds.add(String(room.id)); } catch (e) {}
    m.classList.remove("open");
    toast("گروه ساخته شد 👥");
    enterRoom(room);
  }

  async function createChannel(m, name, bio, body, err) {
    if (name.length < 2) { err.textContent = "اسم کانال خیلی کوتاهه."; return; }
    var priv = body.querySelector("#cePrivate").value === "true";
    var base = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    var slug = (base.length >= 3 ? base.slice(0, 28) : "ch") + "_" + Math.random().toString(36).slice(2, 7);
    var r = await supabaseClient.from("channels").insert({ name: name, slug: slug, description: bio, is_private: priv, owner_username: myProfile.username }).select().single();
    if (r.error || !r.data) { err.textContent = "ساخت کانال ناموفق بود."; return; }
    var c = r.data;
    var mm = await supabaseClient.from("channel_members").insert({ channel_id: c.id, username: myProfile.username, role: "owner" });
    if (mm.error) { err.textContent = "کانال ساخته شد ولی عضویت مالک ثبت نشد؛ SQL/RLS را بررسی کن."; return; }
    try {
      var url = await uploadEntityAvatar(ceState.file, "channel_" + c.id);
      var u = await supabaseClient.from("channels").update({ avatar_url: url }).eq("id", c.id);
      if (!u.error) c.avatar_url = url;
    } catch (e) { console.warn("channel avatar:", e); toast("آپلود عکس کانال ناموفق بود؛ بعداً از تنظیمات کانال عوضش کن.", true, 4500); }
    m.classList.remove("open");
    toast("کانال ساخته شد 📢");
    try { if (typeof window.loadActiveChannels === "function") await window.loadActiveChannels(); } catch (e) {}
    try {
      $("roomsScreen").style.display = "none";
      $("roomPasswordScreen").style.display = "none";
      $("chatScreen").style.display = "flex";
      await window.selectConversation({ type: "channel", channel: c });
    } catch (e) { console.warn("open channel:", e); }
  }

  /* ============================================================
     ۸) سیم‌کشی آیتم‌های تنظیمات
     ============================================================ */
  function rewire(setting, handler) {
    var item = document.querySelector('.settings-item[data-setting="' + setting + '"]');
    if (!item || !item.parentNode) return;
    var c = item.cloneNode(true);     // لیسنر عمومیِ «گزینه در دسترس نیست» با کلون حذف می‌شه
    item.parentNode.replaceChild(c, item);
    c.addEventListener("click", handler);
  }
  rewire("mypage", openMyPage);
  rewire("createEntity", openCreateEntity);

  /* همین کاربر عوض شد؛ کش فالوور پاک بشه */
  var _logout = window.logout;
  if (typeof _logout === "function") {
    window.logout = function () { fwSet = null; fwOwner = null; closePage(); return _logout.apply(this, arguments); };
  }
})();
