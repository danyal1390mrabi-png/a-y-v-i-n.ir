/* ============================================================
   آیوین — ۲۱: ترک گروه + حذف گروه
   • اعضا و ادمین‌ها: «🚪 ترک گروه» ← عضویتشون پاک می‌شه و از گروه بیرون میان
   • مالک گروه: «🗑️ حذف گروه» ← گروه با پیام‌ها، اعضا، لینک‌های دعوت و بن‌ها حذف می‌شه
   (ترک و حذف کانال از قبل داخل «تنظیمات کانال» هست.)
   دسترسی حذف در دیتابیس: supabase-leave-delete.sql
   ============================================================ */
(function () {
  "use strict";
  var modal = document.getElementById("groupInfoModal");
  var closeBtn = document.getElementById("groupInfoCloseBtn");
  if (!modal || !closeBtn) return;

  function toast(msg, err, ms) { if (typeof showToast === "function") showToast(msg, { error: !!err, duration: ms || 3200 }); }
  function curRoom() {
    try { return (currentConv && currentConv.type === "room" && currentConv.room) ? currentConv.room : null; } catch (e) { return null; }
  }
  function roomIdNow() {
    var r = curRoom();
    return r ? r.id : (modal.dataset.roomId || null);
  }
  function roomName() {
    var r = curRoom();
    return (r && r.name) || ((document.getElementById("groupInfoTitle") || {}).textContent || "گروه").replace(/^👥\s*/, "");
  }

  var box = document.createElement("div");
  box.id = "groupLeaveBox";
  box.style.display = "none";
  box.innerHTML =
    '<button type="button" class="modal-close" id="groupLeaveBtn" style="color:#ff8080;display:none;">🚪 ترک گروه</button>' +
    '<button type="button" class="modal-close" id="groupDeleteBtn" style="color:#ff8080;display:none;">🗑️ حذف گروه</button>';
  closeBtn.parentNode.insertBefore(box, closeBtn);
  var leaveBtn = box.querySelector("#groupLeaveBtn"), deleteBtn = box.querySelector("#groupDeleteBtn");

  async function myRole(roomId) {
    try {
      if (!myProfile) return null;
      var r = await supabaseClient.from("room_members").select("role").eq("room_id", roomId).eq("username", myProfile.username).maybeSingle();
      if (r.error || !r.data) return null;
      return r.data.role || "member";
    } catch (e) { return null; }
  }

  async function refresh() {
    if (!modal.classList.contains("open")) return;
    var id = roomIdNow();
    if (!id) return;
    var role = await myRole(id);
    box.style.display = role ? "" : "none";
    leaveBtn.style.display = (role && role !== "owner") ? "" : "none";
    deleteBtn.style.display = (role === "owner") ? "" : "none";
  }

  new MutationObserver(function () {
    if (modal.classList.contains("open")) { setTimeout(refresh, 250); setTimeout(refresh, 1300); }
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });

  function afterGone(id) {
    try { myRoomIds.delete(String(id)); } catch (e) {}
    modal.classList.remove("open");
    box.style.display = "none";
    try { if (typeof window.goHome === "function") window.goHome(); } catch (e) {}
    try { if (typeof loadMyRoomMemberships === "function") loadMyRoomMemberships(); } catch (e) {}
  }

  leaveBtn.addEventListener("click", async function () {
    var id = roomIdNow();
    if (!id || !myProfile) return;
    if (!(await showAppConfirm("از گروه «" + roomName() + "» خارج شوی؟", { danger: true, confirmText: "ترک گروه" }))) return;
    leaveBtn.disabled = true;
    try {
      var r = await supabaseClient.from("room_members").delete().eq("room_id", id).eq("username", myProfile.username).select();
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw new Error("no row deleted (RLS?)");
      toast("از گروه خارج شدی 👋");
      afterGone(id);
    } catch (e) {
      console.warn("leave group:", e);
      toast("خروج ناموفق بود؛ فایل supabase-leave-delete.sql رو در Supabase اجرا کن.", true, 4500);
    }
    leaveBtn.disabled = false;
  });

  deleteBtn.addEventListener("click", async function () {
    var id = roomIdNow();
    if (!id || !myProfile) return;
    if ((await myRole(id)) !== "owner") { toast("فقط مالک گروه می‌تونه گروه رو حذف کنه.", true); return; }
    if (!(await showAppConfirm("گروه «" + roomName() + "» با همه‌ی پیام‌ها و اعضاش برای همیشه حذف بشه؟", { danger: true, confirmText: "حذف گروه" }))) return;
    deleteBtn.disabled = true;
    if (window.ayvinBusy) window.ayvinBusy(true);
    try {
      /* اول فایل‌های همه‌ی پیام‌ها و عکس گروه از هاست پاک می‌شه */
      var failedFiles = 0;
      try {
        if (window.ayvinRemoveRoomMedia) failedFiles += await window.ayvinRemoveRoomMedia(id);
        var rr = curRoom();
        var av = rr && rr.avatar_url;
        if (!av) { var q = await supabaseClient.from("rooms").select("avatar_url").eq("id", id).maybeSingle(); av = q.data && q.data.avatar_url; }
        if (window.ayvinRemoveFiles) failedFiles += await window.ayvinRemoveFiles([av]);
        if (window.ayvinRemoveAvatarsByPrefix) await window.ayvinRemoveAvatarsByPrefix("room_" + id + "_");
      } catch (e) { console.warn("room media cleanup:", e); }
      var kids = [["messages", id], ["room_invites", id], ["room_bans", String(id)], ["room_members", id]];
      for (var i = 0; i < kids.length; i++) {
        try { await supabaseClient.from(kids[i][0]).delete().eq("room_id", kids[i][1]); } catch (e) {}
      }
      var r = await supabaseClient.from("rooms").delete().eq("id", id).select();
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw new Error("no row deleted (RLS?)");
      toast("گروه حذف شد 🗑️" + (failedFiles ? " (بعضی فایل‌ها از هاست پاک نشد)" : ""));
      afterGone(id);
    } catch (e) {
      console.warn("delete group:", e);
      toast("حذف گروه ناموفق بود؛ فایل supabase-leave-delete.sql رو در Supabase اجرا کن.", true, 4500);
    }
    if (window.ayvinBusy) window.ayvinBusy(false);
    deleteBtn.disabled = false;
  });
})();
