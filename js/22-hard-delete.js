/* ============================================================
   آیوین — ۲۲: حذف از ریشه
   هر چیزی که کاربر حذف می‌کنه، علاوه بر ردیف دیتابیس، فایل‌هاش هم از هاست (Supabase Storage) پاک می‌شه:
   • پیام (گروه و خصوصی): ردیف پیام + عکس/ویس/ویدیو/فایلش
   • پست صفحه: عکس/ویدیو + لایک‌ها، کامنت‌ها، بازدیدها و شیرهاش
   • کانال: ردیف‌های کانال + عکسش
   • گروه (در 21-group-leave-delete.js): پیام‌ها و همه‌ی فایل‌هاشون + عکس گروه
   دسترسی حذف: supabase-leave-delete.sql
   ============================================================ */
(function () {
  "use strict";

  function toast(msg, err, ms) { if (typeof showToast === "function") showToast(msg, { error: !!err, duration: ms || 3500 }); }

  function parseUrl(url) {
    if (!url) return null;
    var m = String(url).match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(?:\?.*)?$/);
    if (!m) return null;
    var p = m[2];
    try { p = decodeURIComponent(p); } catch (e) {}
    return { bucket: m[1], path: p };
  }

  /* حذف فایل‌ها از Storage؛ تعداد فایل‌هایی که پاک نشدن برمی‌گرده */
  async function removeFiles(urls) {
    var byBucket = {}, failed = 0;
    (urls || []).forEach(function (u) {
      var i = parseUrl(u);
      if (!i) return;
      (byBucket[i.bucket] = byBucket[i.bucket] || []).push(i.path);
    });
    var buckets = Object.keys(byBucket);
    for (var b = 0; b < buckets.length; b++) {
      var paths = byBucket[buckets[b]];
      for (var k = 0; k < paths.length; k += 100) {
        var chunk = paths.slice(k, k + 100);
        try {
          var r = await supabaseClient.storage.from(buckets[b]).remove(chunk);
          if (r.error) failed += chunk.length;
          else if (Array.isArray(r.data) && r.data.length < chunk.length) failed += chunk.length - r.data.length;
        } catch (e) { failed += chunk.length; }
      }
    }
    return failed;
  }
  window.ayvinRemoveFiles = removeFiles;

  /* عکس‌های قدیمیِ آواتار یک گروه/کانال (avatars/<prefix>_<id>_*.jpg) */
  async function removeAvatarsByPrefix(prefix) {
    try {
      var l = await supabaseClient.storage.from("images").list("avatars", { limit: 200, search: prefix });
      if (l.error || !l.data || !l.data.length) return 0;
      var paths = l.data.filter(function (f) { return f.name && f.name.indexOf(prefix) === 0; }).map(function (f) { return "avatars/" + f.name; });
      if (!paths.length) return 0;
      var r = await supabaseClient.storage.from("images").remove(paths);
      return r.error ? paths.length : 0;
    } catch (e) { return 0; }
  }
  window.ayvinRemoveAvatarsByPrefix = removeAvatarsByPrefix;

  /* همه‌ی فایل‌های پیام‌های یک گروه (صفحه‌به‌صفحه) */
  window.ayvinRemoveRoomMedia = async function (roomId) {
    var failed = 0, from = 0, step = 500;
    for (var guard = 0; guard < 200; guard++) {
      var r = await supabaseClient.from("messages").select("image_path,audio_path,video_path,file_path").eq("room_id", roomId).range(from, from + step - 1);
      if (r.error || !r.data || !r.data.length) break;
      var urls = [];
      r.data.forEach(function (m) { [m.image_path, m.audio_path, m.video_path, m.file_path].forEach(function (u) { if (u) urls.push(u); }); });
      failed += await removeFiles(urls);
      if (r.data.length < step) break;
      from += step;
    }
    return failed;
  };

  /* ---------- حذف پیام: ردیف + فایل‌ها ---------- */
  window.deleteMessage = async function (msg) {
    if (!(await showAppConfirm("این پیام برای همیشه حذف شود؟", { confirmText: "حذف", danger: true }))) return;
    var info = currentTableInfo();
    if (!info) return;
    var urls = [msg.image_path, msg.audio_path, msg.video_path, msg.file_path].filter(Boolean);

    /* ۱) اول علامت حذف می‌خوره تا بقیه‌ی کاربرهای آنلاین همون لحظه ببینن */
    var s = await supabaseClient.from(info.table).update({
      deleted: true, text: "", reactions: {}, image_path: null, audio_path: null, video_path: null,
      file_path: null, file_name: null, file_size: null, file_type: null
    }).eq("id", msg.id);
    if (s.error) { toast("حذف پیام ناموفق بود.", true); return; }

    /* ۲) فایل‌ها از هاست پاک می‌شن */
    var failed = await removeFiles(urls);

    /* ۳) خودِ ردیف از دیتابیس پاک می‌شه */
    var gone = false;
    try {
      var d = await supabaseClient.from(info.table).delete().eq("id", msg.id).select("id");
      if (!d.error) gone = true;
      if (!gone || !(d.data && d.data.length)) {
        var chk = await supabaseClient.from(info.table).select("id").eq("id", msg.id).maybeSingle();
        gone = !chk.error && !chk.data;
      }
    } catch (e) { gone = false; }

    if (gone) {
      try {
        var row = chatArea.querySelector('[data-id="' + msg.id + '"]');
        if (row) row.remove();
        delete messageCache[msg.id];
        if (typeof refreshPinnedBanner === "function") refreshPinnedBanner();
      } catch (e) {}
    } else {
      msg.deleted = true; msg.text = ""; msg.reactions = {};
      msg.image_path = msg.audio_path = msg.video_path = msg.file_path = null;
      try { renderMessage(msg); } catch (e) {}
      toast("متن پاک شد ولی ردیف پیام کامل حذف نشد؛ فایل supabase-leave-delete.sql رو اجرا کن.", true, 5000);
    }
    if (failed) toast("بعضی فایل‌های پیام از هاست پاک نشد؛ فایل supabase-leave-delete.sql رو اجرا کن.", true, 5000);
  };

  /* ---------- حذف پست صفحه: فایل‌ها + لایک/کامنت/بازدید/شیر ---------- */
  window.ayvinPurgePost = async function (post, key) {
    var failed = await removeFiles([post && post.image, post && post.video]);
    var tabs = ["post_likes", "post_comments", "post_views", "post_shares"];
    for (var i = 0; i < tabs.length; i++) {
      try { await supabaseClient.from(tabs[i]).delete().eq("post_id", key); } catch (e) {}
    }
    return failed;
  };

  /* ---------- حذف کانال: عکس + ردیف‌ها (جایگزین دکمه‌ی قبلی) ---------- */
  document.addEventListener("click", async function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("#csDelete") : null;
    if (!btn) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    var c = null;
    try { c = currentConv && currentConv.type === "channel" ? currentConv.channel : null; } catch (er) {}
    if (!c) return;
    if (!(await showAppConfirm("کانال «" + c.name + "» و همه‌ی پست‌هایش برای همیشه حذف شود؟", { danger: true, confirmText: "حذف کانال" }))) return;
    btn.disabled = true;
    if (window.ayvinBusy) window.ayvinBusy(true);
    try {
      var fresh = await supabaseClient.from("channels").select("avatar_url").eq("id", c.id).maybeSingle();
      var avatar = (fresh.data && fresh.data.avatar_url) || c.avatar_url;
      var tabs = ["channel_posts", "channel_invites", "channel_bans", "channel_members"];
      for (var i = 0; i < tabs.length; i++) {
        try { await supabaseClient.from(tabs[i]).delete().eq("channel_id", c.id); } catch (er) {}
      }
      var r = await supabaseClient.from("channels").delete().eq("id", c.id).select("id");
      if (r.error || !r.data || !r.data.length) throw (r.error || new Error("no row deleted (RLS?)"));
      var failed = await removeFiles([avatar]);
      try { var st = window.danyalChannelState; if (st) { st.ids.delete(String(c.id)); st.roles.delete(String(c.id)); } } catch (er) {}
      var m = document.getElementById("channelSettingsModal");
      if (m) m.classList.remove("open");
      toast("کانال حذف شد" + (failed ? " (عکسش از هاست پاک نشد)" : ""));
      if (typeof window.goHome === "function") window.goHome();
    } catch (er) {
      console.warn("delete channel:", er);
      toast("حذف کانال ناموفق بود؛ فایل supabase-leave-delete.sql رو در Supabase اجرا کن.", true, 4500);
    }
    if (window.ayvinBusy) window.ayvinBusy(false);
    btn.disabled = false;
  }, true);
})();
