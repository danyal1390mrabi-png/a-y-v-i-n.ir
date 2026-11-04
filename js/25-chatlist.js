/* ============================================================
   آیوین — ۲۵: لیست گفتگوی تلگرام‌مانند + اصلاح «پیام جدید» + اعلان وب + هارت‌بیت
   ------------------------------------------------------------
   ۱) باگ «پیام جدید» (مخصوصاً اولین پیام یک کاربر به کاربر دیگر):
      • اولین پیام از یک نفر که هنوز با او گفتگویی نبود، خوانده‌شده حساب می‌شد
      • فرستنده‌ی جدید توی لیست گفتگوها ردیفی نداشت که نشانه‌اش نمایش داده بشه
      • اگر اتصال لحظه‌ای قطع می‌شد، دیگر پیام جدید نمی‌آمد (حالا خودکار وصل می‌شود)
      • لیست گفتگوها فقط ۱۰۰۰ ردیف اول را می‌خواند و ممکن بود گفتگوها جا بیفتند
   ۲) لیست گفتگو: آخرین پیام، ساعت/تاریخ شمسی، تیک خوانده‌شدن، «شما:»،
      شمارنده‌ی پیام‌های خوانده‌نشده، دکمه‌ی شناور مدادی (گفتگوی جدید)
   ۳) اعلان وب: سرویس‌ورکر + نمایش اعلان وقتی برنامه در پس‌زمینه است
   ۴) هارت‌بیت «آنلاین بودن»: دقیق‌تر شد تا وقتی کاربر آنلاین است پیامک نرود
   ============================================================ */
(function () {
  "use strict";

  /* ---------- ابزارهای کوچک ---------- */
  function $(id) { return document.getElementById(id); }
  function FA(n) { try { return Number(n).toLocaleString("fa-IR"); } catch (e) { return String(n); } }
  function U() { return (typeof myProfile !== "undefined") ? myProfile : null; }
  function esc(s) { return (typeof escapeHtml === "function") ? escapeHtml(s == null ? "" : String(s)) : String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); }
  function same(a, b) { return typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase(); }
  function key(t, id) { return t + ":" + id; }
  function qv(s) { return String(s || "").replace(/["\\]/g, ""); }

  var lastMap = {};   // "dmUser:ali" → { text, mine, at, readAt, who }
  var counts = {};    // "dmUser:ali" → تعداد خوانده‌نشده
  var syncing = null, lastSyncAt = 0;
  var decorateTimer = null;

  /* ---------- متن پیش‌نمایش آخرین پیام ---------- */
  function previewOf(m) {
    if (!m) return "";
    if (m.deleted) return "این پیام حذف شد";
    if (m.image_path) return "🖼 عکس";
    if (m.video_path) return "🎬 ویدیو";
    if (m.audio_path) return "🎤 پیام صوتی";
    if (m.file_path) return "📎 " + (m.file_name || "فایل");
    var t = String(m.text || "").replace(/\s+/g, " ").trim();
    if (!t && m.sticker_emoji) return m.sticker_emoji;
    if (/https:\/\/meet\.google\.com\//.test(t)) return "📞 دعوت به تماس";
    return t.slice(0, 70) || "پیام";
  }

  /* ---------- ساعت / تاریخ شمسی مثل تلگرام ---------- */
  function whenText(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    var now = new Date();
    if (d.toDateString() === now.toDateString()) {
      try { return d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return ""; }
    }
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "دیروز";
    try {
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "numeric", day: "numeric" }).format(d);
    } catch (e) { return d.toLocaleDateString("fa-IR"); }
  }

  /* ---------- پیدا کردن ردیف‌های لیست ---------- */
  function rowsFor(type, id) {
    var k = String(id).replace(/["\\]/g, "\\$&");
    var sel = type === "room" ? '.room-item[data-room-id="' + k + '"]'
      : type === "dmUser" ? '.switcher-item[data-username="' + k + '"]'
      : '.switcher-item[data-bot-id="' + k + '"]';
    return document.querySelectorAll("#homeSectionChats " + sel);
  }
  function chatRows() {
    return document.querySelectorAll("#homeSectionChats .room-item[data-room-id], #homeSectionChats .switcher-item[data-username], #homeSectionChats .switcher-item[data-bot-id]");
  }

  /* ---------- تزیین یک ردیف (ساعت، تیک، آخرین پیام، شمارنده) ---------- */
  function decorate(el) {
    var info = null;
    try { info = itemInfo(el); } catch (e) {}
    if (!info) return;
    var k = key(info.type, info.id);
    var L = lastMap[k];
    var n = counts[k] || 0;
    el.classList.add("cl-row");
    el.querySelectorAll(".unread-dot").forEach(function (d) { d.remove(); });

    var side = null;
    for (var i = 0; i < el.children.length; i++) if (el.children[i].classList.contains("cl-side")) { side = el.children[i]; break; }
    if (!side) { side = document.createElement("div"); side.className = "cl-side"; el.appendChild(side); }

    var tick = "";
    if (L && L.mine && info.type !== "room") tick = '<span class="cl-tick' + (L.readAt ? " read" : "") + '">' + (L.readAt ? "✓✓" : "✓") + "</span>";
    var timeHtml = L ? '<span class="cl-meta">' + tick + '<span class="cl-time">' + esc(whenText(L.at)) + "</span></span>" : "";
    var badgeHtml = n > 0 ? '<span class="cl-badge">' + (n > 99 ? "+" + FA(99) : FA(n)) + "</span>" : "";
    side.innerHTML = timeHtml + badgeHtml;
    el.classList.toggle("cl-unread", n > 0);

    var sub = el.querySelector(".room-sub, .switcher-item-sub");
    if (sub) {
      if (sub.dataset.clOrig === undefined) {
        // اگر نسخه‌ی قدیمی «پیام جدید» را جایگزین کرده بود، متن اصلی را برگردان
        var orig = (sub.dataset.origHtml !== undefined ? sub.dataset.origHtml : sub.innerHTML);
        if (sub.dataset.origHtml === undefined && sub.querySelector(".unread-label")) {
          orig = info.type === "room" ? "گروه" : info.type === "dmUser" ? "@" + esc(info.id) : "";
        }
        sub.dataset.clOrig = orig;
        delete sub.dataset.origHtml;
      }
      sub.classList.add("cl-sub");
      var html;
      if (L) {
        var pre = "";
        if (L.mine) pre = '<span class="cl-you">شما:</span> ';
        else if (info.type === "room" && L.who) pre = '<span class="cl-you">' + esc(L.who) + ":</span> ";
        html = (n > 0 ? '<span class="cl-new">پیام جدید</span> ' : pre) + '<span class="cl-txt">' + esc(L.text) + "</span>";
      } else {
        html = n > 0 ? '<span class="cl-new">پیام جدید</span>' : sub.dataset.clOrig;
      }
      sub.innerHTML = html;
    }
  }

  function decorateAll() {
    chatRows().forEach(decorate);
  }
  function scheduleDecorate() {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(function () { decorateAll(); sortAll(); }, 30);
  }

  /* ---------- مرتب‌سازی: جدیدترین پیام بالا (پین‌شده‌ها را applyChatPrefs بالا می‌برد) ---------- */
  function rowTime(el) {
    var info = null;
    try { info = itemInfo(el); } catch (e) {}
    if (!info) return 0;
    var L = lastMap[key(info.type, info.id)];
    return L ? new Date(L.at).getTime() : Number(el.dataset.lastMessageAt || 0);
  }
  function sortContainer(c) {
    if (!c) return;
    var rows = [].filter.call(c.children, function (x) { return x.matches && x.matches(".room-item, .switcher-item"); });
    if (rows.length < 2) return;
    var sorted = rows.slice().sort(function (a, b) { return rowTime(b) - rowTime(a); });
    var changed = sorted.some(function (r, i) { return r !== rows[i]; });
    if (!changed) return;
    var anchor = null;
    for (var i = 0; i < c.children.length; i++) if (c.children[i].classList.contains("archive-row")) { anchor = c.children[i]; break; }
    sorted.forEach(function (r) { c.insertBefore(r, anchor); });
    try { if (typeof applyChatPrefs === "function") applyChatPrefs(); } catch (e) {}
  }
  function sortAll() {
    ["homeAllGroups", "roomsList", "homeAllUsers", "homeUsersPane"].forEach(function (id) { sortContainer($(id)); });
  }

  /* ---------- خواندن آخرین پیام‌ها و شمارنده‌ی خوانده‌نشده‌ها ---------- */
  async function syncInbox(force) {
    var u = U();
    if (!u || typeof supabaseClient === "undefined" || !supabaseClient) return;
    if (syncing) return syncing;
    if (!force && Date.now() - lastSyncAt < 8000) return;
    syncing = (async function () {
      try {
        try { if (typeof loadChatPrefs === "function") await loadChatPrefs(); } catch (e) {}
        var name = qv(u.username);
        var ids = Array.from(myRoomIds);
        var jobs = [
          supabaseClient.from("private_messages").select("*")
            .or('sender_username.eq."' + name + '",receiver_username.eq."' + name + '"')
            .order("created_at", { ascending: false }).limit(500),
          ids.length
            ? supabaseClient.from("messages").select("*").in("room_id", ids).order("created_at", { ascending: false }).limit(500)
            : Promise.resolve({ data: [] }),
          supabaseClient.from("room_reads").select("room_id,last_read_at").eq("username", u.username)
        ].map(function (p) { return Promise.resolve(p).catch(function (e) { return { data: null, error: e }; }); });
        var r = await Promise.all(jobs);

        var dms = r[0].data || [], rms = r[1].data || [], rr = {};
        (r[2].data || []).forEach(function (x) { rr[String(x.room_id)] = x.last_read_at; });
        var nl = {}, nc = {};

        dms.forEach(function (m) {
          var mine = same(m.sender_username, u.username);
          var other = mine ? m.receiver_username : m.sender_username;
          if (!other) return;
          var bot = String(other).indexOf("bot-") === 0;
          var type = bot ? "dmBot" : "dmUser";
          var id = bot ? String(other).slice(4) : other;
          var k = key(type, id);
          if (!nl[k]) nl[k] = { text: previewOf(m), mine: mine, at: m.created_at, readAt: m.read_at || null };
          if (!mine && !m.deleted && !(type === "dmUser" && typeof blockedByMe !== "undefined" && blockedByMe.has(other))) {
            var lr = lastReadMap[type + ":" + id];
            // اگر قبلاً این گفتگو را روی این دستگاه باز نکرده‌ای، فقط پیام‌های read_at خالی «جدید» حساب می‌شوند
            var unread = lr ? (new Date(m.created_at) > new Date(lr)) : !m.read_at;
            if (unread) nc[k] = (nc[k] || 0) + 1;
          }
        });

        rms.forEach(function (m) {
          var rid = String(m.room_id), k = key("room", rid);
          var mine = same(m.username, u.username);
          if (!nl[k]) nl[k] = { text: previewOf(m), mine: mine, at: m.created_at, who: m.name || m.username || "" };
          if (!mine && !m.deleted) {
            var lr = lastReadMap["room:" + rid] || rr[rid];
            if (lr && new Date(m.created_at) > new Date(lr)) nc[k] = (nc[k] || 0) + 1;
          }
        });

        lastMap = nl;
        // همگام‌سازی با مجموعه‌های قدیمی (unreadRooms / unreadDmUsers / unreadDmBots)
        ["room", "dmUser", "dmBot"].forEach(function (t) { unreadSetFor(t).clear(); });
        var fin = {};
        Object.keys(nc).forEach(function (k) {
          var p = k.indexOf(":"), t = k.slice(0, p), id = k.slice(p + 1);
          if (isConvOpen(t, id) || isMutedConv(t, id)) return;
          fin[k] = nc[k];
          unreadSetFor(t).add(String(id));
        });
        counts = fin;
        lastSyncAt = Date.now();
        scheduleDecorate();
        updateTabTitle();
      } catch (e) {
        console.warn("syncInbox:", e);
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  /* عدد کل پیام‌های جدید در عنوان تب مرورگر */
  var baseTitle = document.title || "آیوین";
  function updateTabTitle() {
    var total = 0;
    Object.keys(counts).forEach(function (k) { total += counts[k] || 0; });
    document.title = total > 0 ? "(" + FA(total) + ") " + baseTitle : baseTitle;
  }

  /* ---------- جایگزین‌کردن توابع قدیمیِ خوانده‌نشده ---------- */
  window.checkInitialUnread = function () { return syncInbox(true); };

  window.setUnreadDom = function (type, id) {
    var k = key(type, id);
    var has = unreadSetFor(type).has(String(id));
    if (has && !(counts[k] > 0)) counts[k] = 1;
    if (!has) delete counts[k];
    rowsFor(type, id).forEach(decorate);
    updateTabTitle();
  };

  /* ---------- ساخت ردیف برای فرستنده‌ی جدید (اولین پیام) ---------- */
  function buildUserRow(u) {
    var online = !!(typeof onlineUsersState !== "undefined" && onlineUsersState[u.username]);
    var item = document.createElement("div");
    item.className = "switcher-item";
    item.dataset.username = u.username;
    item.dataset.lastMessageAt = String(Date.now());
    item.innerHTML = '<span class="avatar-wrap"><span class="avatar" style="' + userAvatarStyle(u) + '">' + userAvatarGlyph(u) + "</span>" + (online ? '<span class="online-dot"></span>' : "") + "</span>" +
      '<div class="switcher-item-info"><div class="switcher-item-name">' + esc(u.name) + vBadge(u) + '</div><div class="switcher-item-sub">' + (online ? '<span class="online-badge">آنلاین</span>' : "@" + esc(u.username)) + "</div></div>";
    item.addEventListener("click", function () { chooseHomeEntity({ type: "dmUser", user: u }); });
    return item;
  }
  function buildBotRow(bot) {
    var item = document.createElement("div");
    item.className = "switcher-item";
    item.dataset.botId = bot.id;
    item.dataset.lastMessageAt = String(Date.now());
    item.innerHTML = '<span class="avatar-wrap"><span class="avatar" style="background:' + bot.color + '">' + bot.avatar + "</span></span>" +
      '<div class="switcher-item-info"><div class="switcher-item-name">' + esc(bot.name) + '</div><div class="switcher-item-sub">' + esc(bot.tagline || "") + "</div></div>";
    item.addEventListener("click", function () { chooseHomeEntity({ type: "dmBot", bot: bot }); });
    return item;
  }

  async function ensureRow(type, id) {
    if (type === "room") return;
    if (rowsFor(type, id).length) { try { bumpConversationInHomeLists(type, id); } catch (e) {} return; }
    var targets = [$("homeAllUsers"), $("homeUsersPane")].filter(function (c) { return c && (c.id === "homeAllUsers" || c.children.length); });
    if (!targets.length) return;
    var build = null;
    if (type === "dmBot") {
      var bot = (typeof AI_BOTS !== "undefined") ? AI_BOTS.find(function (b) { return String(b.id) === String(id); }) : null;
      if (!bot) return;
      build = function () { return buildBotRow(bot); };
    } else {
      var r = null;
      try { r = await selectUsers(function (q) { return q.eq("username", id).maybeSingle(); }); } catch (e) {}
      if (!r || !r.data) return;
      var uu = r.data;
      build = function () { return buildUserRow(uu); };
    }
    targets.forEach(function (c) {
      if (c.querySelector('[data-username="' + String(id).replace(/["\\]/g, "\\$&") + '"], [data-bot-id="' + String(id).replace(/["\\]/g, "\\$&") + '"]')) return;
      c.querySelectorAll(".switcher-empty").forEach(function (e) { e.remove(); });
      c.insertBefore(build(), c.firstChild);
    });
    scheduleDecorate();
  }

  /* ---------- اعلان سیستم (وقتی برنامه در پس‌زمینه است) ---------- */
  function sysNotify(type, id, title, body) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (document.visibilityState === "visible" && document.hasFocus()) return;
      if (isMutedConv(type, id)) return;
      var opts = { body: body, icon: "icon-192.png", badge: "icon-192.png", tag: "ayv-" + type + "-" + id, renotify: true, dir: "rtl", lang: "fa", data: { type: type, id: String(id) } };
      var fallback = function () { try { var n = new Notification(title, opts); n.onclick = function () { window.focus(); openConv(type, String(id)); n.close(); }; } catch (e) {} };
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.showNotification) reg.showNotification(title, opts); else fallback();
        }).catch(fallback);
      } else fallback();
    } catch (e) {}
  }

  /* ---------- پیام تازه‌ی خصوصی ---------- */
  function onDm(m) {
    var u = U();
    if (!m || !u) return;
    var fromMe = same(m.sender_username, u.username), toMe = same(m.receiver_username, u.username);
    if (fromMe === toMe) return;
    if (fromMe) {
      // پیامی که خودم فرستادم: آخرین پیام لیست و ردیفِ گفتگوی تازه (اولین پیام) را به‌روز کن
      var oth = String(m.receiver_username || "");
      var isB = oth.indexOf("bot-") === 0;
      var tp = isB ? "dmBot" : "dmUser", oid = isB ? oth.slice(4) : oth;
      if (!oid) return;
      lastMap[key(tp, oid)] = { text: previewOf(m), mine: true, at: m.created_at || new Date().toISOString(), readAt: m.read_at || null };
      ensureRow(tp, oid).then(function () { rowsFor(tp, oid).forEach(decorate); sortAll(); });
      return;
    }
    var sender = String(m.sender_username || "");
    var bot = sender.indexOf("bot-") === 0;
    var type = bot ? "dmBot" : "dmUser";
    var id = bot ? sender.slice(4) : sender;
    if (!id) return;
    if (!bot && typeof blockedByMe !== "undefined" && blockedByMe.has(sender)) return;

    var k = key(type, id);
    lastMap[k] = { text: previewOf(m), mine: false, at: m.created_at || new Date().toISOString() };

    var open = isConvOpen(type, id), muted = isMutedConv(type, id);
    if (!open && !muted) {
      counts[k] = (counts[k] || 0) + 1;
      unreadSetFor(type).add(String(id));
    }
    ensureRow(type, id).then(function () {
      try { bumpConversationInHomeLists(type, id); } catch (e) {}
      rowsFor(type, id).forEach(decorate);
      sortAll();
      updateTabTitle();
    });
    if (!open && !muted) { try { window.ayvinIncoming && window.ayvinIncoming(type, id); } catch (e) {} }
    sysNotify(type, id, m.sender_name || sender, previewOf(m));
  }

  /* ---------- تیک خوانده‌شدن (پیام من را طرف مقابل خواند) ---------- */
  function onDmUpdate(m) {
    var u = U();
    if (!m || !u || !same(m.sender_username, u.username)) return;
    var other = String(m.receiver_username || "");
    var bot = other.indexOf("bot-") === 0;
    var type = bot ? "dmBot" : "dmUser", id = bot ? other.slice(4) : other;
    var L = lastMap[key(type, id)];
    if (L && L.mine && m.read_at && new Date(m.created_at).getTime() >= new Date(L.at).getTime()) {
      L.readAt = m.read_at;
      rowsFor(type, id).forEach(decorate);
    }
  }

  /* ---------- پیام تازه‌ی گروه ---------- */
  function onRoomMsg(m) {
    var u = U();
    if (!m || !u) return;
    var rid = String(m.room_id);
    if (!myRoomIds.has(rid)) return;
    var mine = same(m.username, u.username);
    var k = key("room", rid);
    lastMap[k] = { text: previewOf(m), mine: mine, at: m.created_at || new Date().toISOString(), who: m.name || m.username || "" };
    if (!mine) {
      var open = isConvOpen("room", rid), muted = isMutedConv("room", rid);
      if (!open && !muted) {
        counts[k] = (counts[k] || 0) + 1;
        unreadSetFor("room").add(rid);
        try { window.ayvinIncoming && window.ayvinIncoming("room", rid); } catch (e) {}
      }
      var rn = document.querySelector('.room-item[data-room-id="' + rid.replace(/["\\]/g, "\\$&") + '"] .room-name');
      var title = rn && rn.firstChild ? String(rn.firstChild.textContent || "").trim() : "گروه";
      sysNotify("room", rid, title || "گروه", (m.name || m.username || "") + ": " + previewOf(m));
    }
    try { bumpConversationInHomeLists("room", rid); } catch (e) {}
    rowsFor("room", rid).forEach(decorate);
    sortAll();
    updateTabTitle();
  }

  /* ---------- دیده‌بان پیام‌ها (با اتصال دوباره‌ی خودکار) ---------- */
  var wasDown = false, reconnectTimer = null;
  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(function () {
      if (typeof sessionActive === "undefined" || !sessionActive) return;
      if (globalUnreadChannel && globalUnreadChannel.state === "joined") return;
      try { if (globalUnreadChannel) supabaseClient.removeChannel(globalUnreadChannel); } catch (e) {}
      globalUnreadChannel = null;
      window.startGlobalUnreadWatcher();
    }, 3000);
  }

  window.startGlobalUnreadWatcher = function () {
    if (globalUnreadChannel) return;
    var u = U();
    if (!u || !supabaseClient) return;
    var ch = supabaseClient.channel("ayv-inbox-" + qv(u.username) + "-" + Date.now().toString(36));
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, function (p) { onRoomMsg(p.new); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages" }, function (p) { onDm(p.new); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages" }, function (p) { onDmUpdate(p.new); })
      .subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          if (wasDown) { wasDown = false; syncInbox(true); }   // پیام‌هایی که وقتِ قطعی آمده‌اند را بگیر
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (globalUnreadChannel === ch) { wasDown = true; scheduleReconnect(); }
        }
      });
    globalUnreadChannel = ch;
  };

  // هر ۳۰ ثانیه یک بار (وقتی برنامه جلوی چشم است) برای اطمینان همگام می‌شود
  setInterval(function () {
    if (typeof sessionActive === "undefined" || !sessionActive) return;
    if (document.visibilityState !== "visible") return;
    syncInbox(true);
  }, 30000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && typeof sessionActive !== "undefined" && sessionActive) { syncInbox(true); }
  });
  window.addEventListener("online", function () { syncInbox(true); });

  /* ---------- لیست گفتگوهای خصوصی (بدون سقف ۱۰۰۰ ردیف) ---------- */
  window.loadMyDmPartners = async function (container) {
    var u = U();
    if (!container) return;
    if (!u) { container.innerHTML = ""; return; }
    var tok = (container._clTok || 0) + 1;
    container._clTok = tok;
    container.innerHTML = '<div class="switcher-empty">در حال بارگذاری...</div>';

    var name = qv(u.username);
    var users = new Map(), bots = new Map(), from = 0, PAGE = 1000, failed = false;
    for (var page = 0; page < 8; page++) {
      var r = await supabaseClient.from("private_messages").select("sender_username,receiver_username,created_at")
        .or('sender_username.eq."' + name + '",receiver_username.eq."' + name + '"')
        .order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (r.error) { failed = true; break; }
      (r.data || []).forEach(function (m) {
        var other = same(m.sender_username, u.username) ? m.receiver_username : m.sender_username;
        if (!other || same(other, u.username)) return;
        var t = m.created_at ? new Date(m.created_at).getTime() : 0;
        if (String(other).indexOf("bot-") === 0) { var b = String(other).slice(4); if (!bots.has(b)) bots.set(b, t); }
        else if (!users.has(String(other))) users.set(String(other), t);
      });
      if (!r.data || r.data.length < PAGE) break;
      from += PAGE;
    }
    if (container._clTok !== tok) return;
    container.innerHTML = "";
    if (failed && !users.size && !bots.size) {
      var er = document.createElement("div"); er.className = "switcher-empty"; er.textContent = "خطا در بارگذاری گفتگوها."; container.appendChild(er); return;
    }

    var rows = [];
    bots.forEach(function (t, bid) {
      var bot = (typeof AI_BOTS !== "undefined") ? AI_BOTS.find(function (b) { return String(b.id) === bid; }) : null;
      if (!bot) return;
      var item = buildBotRow(bot);
      item.dataset.lastMessageAt = String(t);
      if (sessionActive && currentConv && currentConv.type === "dmBot" && currentConv.bot.id === bot.id) item.classList.add("active");
      rows.push(item);
    });

    var names = Array.from(users.keys());
    for (var i = 0; i < names.length; i += 80) {
      var chunk = names.slice(i, i + 80);
      var res = await selectUsers(function (q) { return q.in("username", chunk); });
      if (container._clTok !== tok) return;
      ((res && res.data) || []).forEach(function (uu) {
        var item = buildUserRow(uu);
        item.dataset.lastMessageAt = String(users.get(String(uu.username)) || 0);
        if (sessionActive && currentConv && currentConv.type === "dmUser" && currentConv.user.username === uu.username) item.classList.add("active");
        rows.push(item);
      });
    }
    if (container._clTok !== tok) return;

    if (!rows.length) {
      var em = document.createElement("div"); em.className = "switcher-empty"; em.textContent = "هنوز با کسی پیام خصوصی رد و بدل نکردی."; container.appendChild(em); return;
    }
    rows.sort(function (a, b) { return Number(b.dataset.lastMessageAt) - Number(a.dataset.lastMessageAt); });
    rows.forEach(function (r) { container.appendChild(r); });

    await syncInbox(false);
    scheduleDecorate();
    try { if (typeof applyChatPrefs === "function") applyChatPrefs(); } catch (e) {}
  };

  /* گروه‌ها: بعد از ساخت لیست، ساعت و آخرین پیام را هم نشان بده */
  var _loadRooms = window.loadRooms;
  if (typeof _loadRooms === "function") {
    window.loadRooms = async function (container, mode) {
      var out = await _loadRooms.apply(this, arguments);
      try {
        if ((mode || "mine") === "mine") { await syncInbox(false); scheduleDecorate(); }
      } catch (e) {}
      return out;
    };
  }

  /* وقتی گفتگو باز می‌شود، شمارنده صفر شود */
  window.clearUnread = function (type, id) {
    if (id == null) return;
    var had = unreadSetFor(type).delete(String(id));
    delete counts[key(type, id)];
    if (had) rowsFor(type, id).forEach(decorate);
    updateTabTitle();
  };

  /* ---------- باز کردن یک گفتگو (کلیک روی اعلان) ---------- */
  async function openConv(type, id) {
    try {
      if (!U() || !type || !id) return;
      if (type === "dmUser") {
        var r = await selectUsers(function (q) { return q.eq("username", id).maybeSingle(); });
        if (r && r.data) chooseHomeEntity({ type: "dmUser", user: r.data });
      } else if (type === "dmBot") {
        var bot = AI_BOTS.find(function (b) { return String(b.id) === String(id); });
        if (bot) chooseHomeEntity({ type: "dmBot", bot: bot });
      } else if (type === "room") {
        var rr = await supabaseClient.from("rooms").select("*").eq("id", id).maybeSingle();
        if (rr && rr.data) selectRoom(rr.data);
      }
    } catch (e) { console.warn("openConv:", e); }
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) {
      var d = e.data || {};
      if (d.type === "ayvin-open" && d.convType && d.id) openConv(d.convType, d.id);
      if (d.type === "ayvin-push") syncInbox(true);
    });
  }
  // اگر برنامه با کلیک روی اعلان تازه باز شده باشد: ?open=dmUser:ali
  var pendingOpen = null;
  try {
    var qs = new URLSearchParams(location.search).get("open");
    if (qs && qs.indexOf(":") > 0) { pendingOpen = { type: qs.slice(0, qs.indexOf(":")), id: qs.slice(qs.indexOf(":") + 1) }; history.replaceState({}, "", location.pathname + location.hash); }
  } catch (e) {}
  var pendingTimer = setInterval(function () {
    if (!pendingOpen) { clearInterval(pendingTimer); return; }
    if (typeof sessionActive !== "undefined" && sessionActive && U()) {
      var p = pendingOpen; pendingOpen = null; clearInterval(pendingTimer);
      setTimeout(function () { openConv(p.type, p.id); }, 600);
    }
  }, 700);

  /* ---------- اعلان وب: فعال‌سازی مطمئن + درخواست ملایم ---------- */
  var _enablePush = window.enableDanyalBrowserPush;
  window.enableDanyalBrowserPush = async function () {
    if (!("Notification" in window)) throw new Error("مرورگر اعلان را پشتیبانی نمی‌کند");
    if (!U()) throw new Error("اول وارد حساب شو");
    var perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("اجازه‌ی اعلان داده نشد؛ از تنظیمات مرورگر فعالش کن.");
    // ثبت Push سمت سرور؛ اگر نشد هم اعلان محلی کار می‌کند
    try {
      if (typeof _enablePush === "function" && "serviceWorker" in navigator) {
        await Promise.race([
          _enablePush(),
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 12000); })
        ]);
      }
    } catch (e) { console.warn("push subscribe:", e); }
    return true;
  };
  if (window.DanyalBackend) window.DanyalBackend.enablePush = window.enableDanyalBrowserPush;

  function softAskNotifications() {
    try {
      if (!("Notification" in window) || Notification.permission !== "default") return;
      if (typeof sessionActive === "undefined" || !sessionActive || !U()) return;
      var last = Number(localStorage.getItem("ayvNotifAsk") || 0);
      if (Date.now() - last < 3 * 24 * 3600 * 1000) return;
      localStorage.setItem("ayvNotifAsk", String(Date.now()));
      showAppConfirm("اعلان فعال شود تا وقتی برنامه بسته است هم پیام‌های جدیدت را از دست ندهی؟", { confirmText: "فعال کن" }).then(function (ok) {
        if (!ok) return;
        window.enableDanyalBrowserPush().then(function () { showToast("اعلان فعال شد ✅"); }, function (e) { showToast(e.message || "فعال‌سازی اعلان ناموفق بود", { error: true }); });
      });
    } catch (e) {}
  }
  var askArmed = false;
  document.addEventListener("click", function () {
    if (askArmed) return;
    if (typeof sessionActive === "undefined" || !sessionActive) return;
    askArmed = true;
    setTimeout(softAskNotifications, 4000);
  }, true);

  /* ---------- هارت‌بیت «آنلاین بودن» (برای نرفتن پیامک وقتی کاربر آنلاین است) ----------
     • هر ۱۵ ثانیه و فقط وقتی برنامه جلوی چشم است
     • حالت «مخفی کردن آنلاین» دیگر هارت‌بیت را قطع نمی‌کند (last_seen_at جایی نمایش داده نمی‌شود)
     • به‌محض رفتن به پس‌زمینه / بستن، زمان به ۱۰ دقیقه قبل برمی‌گردد تا همان لحظه آفلاین حساب شود */
  var hbTimer = null;
  function putSeen(ts, keepalive) {
    var u = U();
    if (!u || !u.username || typeof supabaseClient === "undefined" || !supabaseClient) return;
    if (keepalive) {
      try {
        fetch(SUPABASE_URL + "/rest/v1/users?username=eq." + encodeURIComponent(u.username), {
          method: "PATCH", keepalive: true,
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ last_seen_at: ts })
        }).catch(function () {});
      } catch (e) {}
      return;
    }
    try { supabaseClient.from("users").update({ last_seen_at: ts }).eq("username", u.username).then(function () {}, function () {}); } catch (e) {}
  }
  function pingNow() { putSeen(new Date().toISOString(), false); }
  function pingAway() { putSeen(new Date(Date.now() - 10 * 60 * 1000).toISOString(), true); }

  window.startLastSeenHeartbeat = function () {
    if (hbTimer) return;
    pingNow();
    hbTimer = setInterval(function () { if (document.visibilityState === "visible") pingNow(); }, 15000);
    lastSeenHeartbeatTimer = hbTimer;
  };
  window.stopLastSeenHeartbeat = function () {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    lastSeenHeartbeatTimer = null;
  };
  document.addEventListener("visibilitychange", function () {
    if (!hbTimer) return;
    if (document.visibilityState === "visible") pingNow(); else pingAway();
  });
  window.addEventListener("pagehide", function () { if (hbTimer) pingAway(); });
  window.addEventListener("focus", function () { if (hbTimer) pingNow(); });

  /* ---------- دکمه‌ی شناور مدادی (گفتگوی جدید) ---------- */
  function openNewSheet() {
    if (!U()) { showToast("اول وارد حسابت شو."); return; }
    var bg = document.createElement("div");
    bg.className = "cl-sheet-bg";
    bg.innerHTML = '<div class="cl-sheet" role="dialog" aria-label="گفتگوی جدید"><div class="cl-grip"></div>' +
      '<button type="button" data-a="dm"><span class="cl-ico">💬</span><span>پیام جدید</span></button>' +
      '<button type="button" data-a="group"><span class="cl-ico">👥</span><span>گروه جدید</span></button>' +
      '<button type="button" data-a="channel"><span class="cl-ico">📢</span><span>کانال جدید</span></button></div>';
    function close() { bg.classList.remove("show"); setTimeout(function () { bg.remove(); }, 180); }
    bg.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("button[data-a]");
      if (a) {
        var act = a.dataset.a;
        close();
        setTimeout(function () {
          try {
            if (act === "dm") showHomeSection("contacts");
            else if (act === "group" || act === "channel") {
              if (typeof window.ayvinOpenCreateEntity === "function") window.ayvinOpenCreateEntity(act);
              else showToast("صفحه ساخت در دسترس نیست؛ صفحه را رفرش کن.", { error: true });
            }
          } catch (err) { console.warn(err); }
        }, 120);
      } else if (e.target === bg) close();
    });
    document.body.appendChild(bg);
    requestAnimationFrame(function () { bg.classList.add("show"); });
  }

  function initFab() {
    var shell = document.querySelector("#roomsScreen .home-shell");
    if (!shell || $("clFab")) return;
    var b = document.createElement("button");
    b.id = "clFab"; b.type = "button"; b.setAttribute("aria-label", "گفتگوی جدید");
    b.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    b.addEventListener("click", openNewSheet);
    shell.appendChild(b);
  }

  function boot() { initFab(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
