/* ============================================================
   آیوین — ۲۳: صف ارسال آفلاین
   • اگه اینترنت نباشه (یا درخواست به خاطر شبکه شکست بخوره) پیام توی صف (IndexedDB) می‌مونه
     و با ⏳ توی چت نشون داده می‌شه؛ به محض وصل‌شدن خودکار و بی‌صدا ارسال می‌شه.
   • متن، عکس، ویدیو، فایل، موسیقی و پیام صوتی پشتیبانی می‌شن.
   • دکمه‌ی میکروفون/ارسال و منوی پیوست (موسیقی، موقعیت مکانی) هم اینجا وصل می‌شن.
   ============================================================ */
(function () {
  "use strict";
  var DB = "ayvin-outbox", ST = "q", queue = [], busy = false, timer = null, retryMs = 2000, state = {};
  var KINDS = {
    image: { bucket: "images", pre: "img_", label: "🖼️ عکس" },
    video: { bucket: "videos", pre: "vid_", label: "🎬 ویدیو" },
    file: { bucket: "files", pre: "file_", label: "📎 فایل" },
    audio: { bucket: "voice", pre: "voice_", label: "🎵 صدا" }
  };

  /* ---------- ذخیره‌ی پایدار (IndexedDB، با پشتیبان حافظه) ---------- */
  var dbp = null;
  function db() {
    return dbp || (dbp = new Promise(function (res, rej) {
      try {
        var q = indexedDB.open(DB, 1);
        q.onupgradeneeded = function () { q.result.createObjectStore(ST, { keyPath: "id" }); };
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      } catch (e) { rej(e); }
    }));
  }
  function save(it) { db().then(function (d) { d.transaction(ST, "readwrite").objectStore(ST).put(it); }).catch(function () {}); }
  function drop(it) {
    queue = queue.filter(function (x) { return x.id !== it.id; });
    delete state[it.id];
    db().then(function (d) { d.transaction(ST, "readwrite").objectStore(ST).delete(it.id); }).catch(function () {});
  }
  function load() {
    return db().then(function (d) {
      return new Promise(function (res) {
        var r = d.transaction(ST).objectStore(ST).getAll();
        r.onsuccess = function () { res(r.result || []); };
        r.onerror = function () { res([]); };
      });
    }).catch(function () { return []; });
  }

  /* ---------- کمکی‌ها ---------- */
  function toast(m, err) { try { showToast(m, err ? { error: true } : undefined); } catch (e) {} }
  function esc(s) { return typeof escapeHtml === "function" ? escapeHtml(s) : String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function canQueue() {
    var c = currentConv;
    if (!c || !myProfile) return false;
    if (c.type === "room") return myRoomIds.has(String(c.room.id)); // پیش‌نمایش گروه = عضو نیستی
    if (c.type === "dmUser") return !isBlockedEitherWay(c.user.username);
    return c.type === "dmBot";
  }
  function describe(c) {
    if (c.type === "room") return { type: "room", roomId: c.room.id };
    if (c.type === "dmUser") return { type: "dmUser", username: c.user.username, dmKey: c.dmKey || dmKeyForUser(c.user.username) };
    return { type: "dmBot", botId: c.bot.id, dmKey: c.dmKey || dmKeyForBot(c.bot.id) };
  }
  function matches(c, d) {
    if (!c || !d || c.type !== d.type) return false;
    if (d.type === "room") return String(c.room.id) === String(d.roomId);
    if (d.type === "dmUser") return c.user.username === d.username;
    return String(c.bot.id) === String(d.botId);
  }
  function isNet(e) {
    if (navigator.onLine === false) return true;
    var m = String((e && (e.message || e.details)) || e || "");
    return !(e && e.code) && /fetch|network|load failed|timeout|abort/i.test(m);
  }
  function stateOf(it) { return state[it.id] || "wait"; }

  /* ---------- حباب «در صف» داخل چت ---------- */
  function labelOf(it) {
    if (it.kind === "text") return it.text;
    return (KINDS[it.kind].label + (it.fileName ? " " + it.fileName : "")) + (it.kind === "audio" && it.text ? "\n" + it.text : "");
  }
  function renderPending(it) {
    if (!matches(currentConv, it.conv)) return;
    var old = chatArea.querySelector('[data-pending="' + it.id + '"]'), row = old || document.createElement("div"), s = stateOf(it);
    row.className = "msg-row me pending" + (s === "failed" ? " failed" : "");
    row.dataset.pending = it.id;
    var meta = s === "sending" ? "🕓 در حال ارسال…" : s === "sent" ? "✓ ارسال شد" : s === "failed" ? '❗ ارسال نشد · <button data-a="retry">تلاش دوباره</button> · <button data-a="del">حذف</button>' : (navigator.onLine === false ? "🕓 آفلاین — در صف ارسال" : "🕓 در صف ارسال");
    row.innerHTML = '<div class="msg-wrap"><div class="msg-bubble">' + esc(labelOf(it)) + '</div><div class="pending-meta">' + meta + "</div></div>";
    row.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.a === "del") { row.remove(); drop(it); updateBar(); }
        else { it.failed = false; it.tries = 0; state[it.id] = "wait"; save(it); renderPending(it); flush(); }
      };
    });
    if (!old) chatArea.appendChild(row);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
  function renderAllPending() {
    queue.forEach(function (it) { if (myProfile && it.user === myProfile.username) renderPending(it); });
  }
  new MutationObserver(function (muts) { // پیام واقعی رسید → حباب موقت برداشته شه
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1 || !n.classList.contains("msg-row") || n.classList.contains("pending") || !n.classList.contains("me")) return;
        var p = chatArea.querySelector('.msg-row.pending[data-pending]'); // قدیمی‌ترین پیام ارسال‌شده
        var all = chatArea.querySelectorAll(".msg-row.pending");
        for (var i = 0; i < all.length; i++) { if (state[all[i].dataset.pending] === "sent" || !queue.some(function (q) { return q.id === all[i].dataset.pending; })) { all[i].remove(); break; } }
      });
    });
  }).observe(chatArea, { childList: true });

  /* ---------- نوار وضعیت بالای کادر پیام ---------- */
  var bar = document.createElement("div");
  bar.id = "outboxBar";
  var footer = document.querySelector("footer.composer");
  if (footer && footer.parentNode) footer.parentNode.insertBefore(bar, footer);
  function updateBar() {
    var n = myProfile ? queue.filter(function (q) { return q.user === myProfile.username && !q.failed; }).length : 0;
    var off = navigator.onLine === false;
    bar.classList.toggle("show", off || n > 0);
    bar.textContent = off ? "📡 اینترنت قطعه؛ پیام‌هات ذخیره می‌شن و با وصل‌شدن خودکار ارسال می‌شن" + (n ? " (" + n + " در صف)" : "") : "🕓 " + n + " پیام در حال ارسال…";
  }

  /* ---------- ارسال واقعی یک آیتم ---------- */
  function fail(e) { return isNet(e) ? { net: true } : { drop: true, msg: String((e && e.message) || e || "") }; }
  async function deliver(it) {
    var p = myProfile, c = it.conv, extra = {}, text = it.text || "";
    try {
      if (it.blob) {
        var K = KINDS[it.kind];
        if (!it.url) {
          var ext = ((it.fileName || "").split(".").pop() || (it.kind === "audio" ? "webm" : "bin")).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
          var name = K.pre + Date.now() + "_" + Math.random().toString(36).slice(2) + "." + ext;
          var up = await supabaseClient.storage.from(K.bucket).upload(name, it.blob, { contentType: it.blob.type || it.fileType || "application/octet-stream" });
          if (up.error) return fail(up.error);
          it.url = supabaseClient.storage.from(K.bucket).getPublicUrl(name).data.publicUrl;
          save(it);
        }
        if (it.kind === "image") extra = { image_path: it.url };
        else if (it.kind === "audio") extra = { audio_path: it.url };
        else extra = { file_path: it.url, file_name: it.fileName, file_size: it.fileSize, file_type: it.fileType || "application/octet-stream" };
      }
      var table, payload;
      if (c.type === "room") {
        table = "messages";
        payload = { name: p.name, username: p.username, text: text, phone: p.phone, age: p.age, city: p.city, gender: p.gender, room_id: c.roomId };
      } else {
        table = "private_messages";
        payload = { dm_key: c.dmKey, sender_username: p.username, sender_name: p.name, receiver_username: c.type === "dmBot" ? "bot-" + c.botId : c.username, text: text };
      }
      Object.assign(payload, extra);
      var withReply = it.replyId != null ? Object.assign({ reply_to_id: it.replyId }, payload) : payload;
      var r = await supabaseClient.from(table).insert(withReply);
      if (r.error && it.replyId != null && !isNet(r.error)) r = await supabaseClient.from(table).insert(payload);
      return r.error ? fail(r.error) : { ok: true };
    } catch (e) { return fail(e); }
  }
  function afterSend(it) {
    try {
      var c = it.conv, cur = currentConv, open = matches(cur, c);
      if (c.type === "room") {
        bumpConversationInHomeLists("room", c.roomId);
        if (it.kind === "text" && open && cur.room.ai_bot_id && !it.skipAi && typeof maybeTriggerRoomBot === "function") maybeTriggerRoomBot(cur.room);
      } else if (c.type === "dmUser") bumpConversationInHomeLists("dmUser", c.username);
      else {
        bumpConversationInHomeLists("dmBot", c.botId);
        if (it.kind === "text" && open && typeof maybeTriggerDmBot === "function") maybeTriggerDmBot(cur.bot, c.dmKey);
      }
      if (typeof runDanyalMaintenance === "function") runDanyalMaintenance({ action: "message_sent", table: c.type === "room" ? "messages" : "private_messages" });
    } catch (e) { console.warn("outbox afterSend", e); }
  }
  function scheduleRetry() { clearTimeout(timer); timer = setTimeout(flush, retryMs); retryMs = Math.min(retryMs * 2, 20000); }

  async function flush() {
    if (busy || !myProfile) return;
    busy = true;
    try {
      var list = queue.filter(function (i) { return i.user === myProfile.username && !i.failed; }).sort(function (a, b) { return a.ts - b.ts; });
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        state[it.id] = "sending"; renderPending(it);
        var r = await deliver(it);
        if (r.ok) {
          retryMs = 2000; state[it.id] = "sent"; renderPending(it);
          (function (x) { setTimeout(function () { var el = chatArea.querySelector('[data-pending="' + x.id + '"]'); el && el.remove(); }, 2500); })(it);
          drop(it); afterSend(it);
        } else if (r.net) {
          state[it.id] = "wait"; renderPending(it); scheduleRetry(); break;
        } else if (/BANNED|SLOW_MODE/.test(r.msg || "")) {
          var n = (r.msg.match(/SLOW_MODE:(\d+)/) || [])[1];
          toast(n ? "حالت آهسته روشن است؛ هر " + n + " ثانیه یک پیام می‌توانی بفرستی." : "شما از این گروه مسدود شده‌اید.", true);
          var gone = chatArea.querySelector('[data-pending="' + it.id + '"]'); gone && gone.remove();
          if (it.kind === "text" && !msgInput.value) { msgInput.value = it.text; autosizeMsgInput(); syncComposer(); }
          drop(it);
        } else {
          it.tries = (it.tries || 0) + 1;
          if (it.tries >= 3) { it.failed = true; state[it.id] = "failed"; } else { state[it.id] = "wait"; scheduleRetry(); }
          save(it); renderPending(it);
        }
      }
    } finally { busy = false; updateBar(); }
  }

  /* ---------- اضافه‌کردن به صف ---------- */
  function enqueue(o) {
    if (!canQueue()) return false;
    var it = Object.assign({ id: "o" + Date.now() + Math.random().toString(36).slice(2, 7), user: myProfile.username, conv: describe(currentConv), ts: Date.now(), tries: 0, text: "" }, o);
    queue.push(it); state[it.id] = "wait"; save(it);
    renderPending(it); updateBar();
    flush();
    return true;
  }
  function mySend() {
    var text = msgInput.value.trim();
    if (!text) return Promise.resolve();
    var reply = typeof replyTarget !== "undefined" && replyTarget ? replyTarget.id : null;
    if (!enqueue({ kind: "text", text: text, replyId: reply, skipAi: !!window.__ayvinSkipAi })) return Promise.resolve();
    msgInput.value = ""; autosizeMsgInput(); syncComposer();
    try { cancelReply(); } catch (e) {}
    return Promise.resolve();
  }
  function enqueueMedia(kind, blob, extra) {
    return enqueue(Object.assign({ kind: kind, blob: blob, fileName: blob.name || "", fileType: blob.type || "", fileSize: blob.size }, extra || {}));
  }

  /* ---------- اتصال به دکمه‌ها (قبل از شنونده‌های قدیمی) ---------- */
  var prevSend = window.sendMessage;
  window.sendMessage = function () { return canQueue() ? mySend() : prevSend.apply(this, arguments); };
  footer.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#sendBtn");
    if (!b || b.disabled || !canQueue()) return;
    e.stopImmediatePropagation(); e.stopPropagation();
    mySend();
  }, true);
  footer.addEventListener("keydown", function (e) {
    if (e.target !== msgInput || e.key !== "Enter" || e.shiftKey || e.isComposing || !canQueue()) return;
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    mySend();
  }, true);

  function syncComposer() { footer.classList.toggle("has-text", !!msgInput.value.trim()); }
  msgInput.addEventListener("input", syncComposer);
  setInterval(syncComposer, 400);

  /* ---------- رسانه: وقتی آفلاینی توی صف می‌ره، وقتی آنلاینی مثل قبل ---------- */
  function wrap(fn, kind, check) {
    var orig = window[fn];
    if (typeof orig !== "function") return;
    window[fn] = function (f) {
      if (navigator.onLine === false && f && canQueue()) {
        var err = check ? check(f) : null;
        if (err) { toast(err, true); return Promise.resolve(); }
        enqueueMedia(kind, f);
        return Promise.resolve();
      }
      return orig.apply(this, arguments);
    };
  }
  wrap("handleImageFile", "image", function (f) { return /^image\//.test(f.type) ? null : "فایل انتخاب‌شده عکس نیست."; });
  wrap("handleVideoFile", "video", function (f) { return !/^video\//.test(f.type) ? "فایل انتخاب‌شده ویدیو نیست." : f.size > 40 * 1048576 ? "حجم ویدیو نباید بیشتر از ۴۰ مگابایت باشد." : null; });
  wrap("handleDocFile", "file", function (f) { var e = (f.name.split(".").pop() || "").toLowerCase(); return ["pdf", "doc", "docx", "txt", "zip"].indexOf(e) < 0 ? "فقط فایل‌های PDF, DOC, DOCX, TXT و ZIP مجاز هستند." : f.size > 15 * 1048576 ? "حجم فایل نباید بیشتر از ۱۵ مگابایت باشد." : null; });
  wrap("uploadVoiceMessage", "audio");

  /* ---------- موسیقی و موقعیت مکانی ---------- */
  var musicInput = document.createElement("input");
  musicInput.type = "file"; musicInput.accept = "audio/*,.mp3,.m4a,.ogg,.wav,.flac,.aac"; musicInput.style.display = "none";
  document.body.appendChild(musicInput);
  document.getElementById("attachMusicOption").addEventListener("click", function () { toggleAttachMenu(false); musicInput.click(); });
  musicInput.addEventListener("change", function () {
    var f = musicInput.files[0]; musicInput.value = "";
    if (!f) return;
    if (f.size > 25 * 1048576) { toast("حجم آهنگ نباید بیشتر از ۲۵ مگابایت باشد.", true); return; }
    if (!enqueueMedia("audio", f, { text: "🎵 " + f.name.replace(/\.[^.]+$/, "") })) toast("اول یه گفت‌وگو باز کن.", true);
  });
  document.getElementById("attachLocationOption").addEventListener("click", function () {
    toggleAttachMenu(false);
    if (!canQueue()) { toast("اول یه گفت‌وگو باز کن.", true); return; }
    if (!navigator.geolocation) { toast("مرورگر موقعیت مکانی را پشتیبانی نمی‌کند.", true); return; }
    toast("در حال گرفتن موقعیت…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      enqueue({ kind: "text", text: "📍 موقعیت مکانی من\nhttps://www.google.com/maps?q=" + pos.coords.latitude.toFixed(6) + "," + pos.coords.longitude.toFixed(6) });
    }, function () { toast("اجازه‌ی دسترسی به موقعیت داده نشد.", true); }, { enableHighAccuracy: true, timeout: 12000 });
  });

  /* ---------- بعد از باز‌شدن هر چت، پیام‌های در صفِ همون چت دوباره نشون داده بشن ---------- */
  var prevSelect = window.selectConversation;
  if (typeof prevSelect === "function") {
    window.selectConversation = function () {
      var p = prevSelect.apply(this, arguments);
      return Promise.resolve(p).then(function (v) { setTimeout(renderAllPending, 60); return v; });
    };
  }

  /* ---------- شروع و زمان‌بندی ---------- */
  window.addEventListener("online", function () { retryMs = 2000; updateBar(); renderAllPending(); flush(); });
  window.addEventListener("offline", function () { updateBar(); renderAllPending(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") flush(); });
  setInterval(function () { updateBar(); if (queue.length && navigator.onLine !== false) flush(); }, 8000);
  load().then(function (items) {
    items.forEach(function (it) { if (!queue.some(function (q) { return q.id === it.id; })) { queue.push(it); if (it.failed) state[it.id] = "failed"; } });
    updateBar(); renderAllPending(); setTimeout(flush, 1500);
  });
  window.ayvinOutbox = { flush: flush, size: function () { return queue.length; } };
})();
