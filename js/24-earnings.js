/* آیوین — ۲۴: کسب درآمد (تنظیمات > کسب درآمد) + پیام بعد از ثبت‌نام */
(function () {
  "use strict";
  var MIN = 500000, INTRO_KEY = "ayv_earn_intro_pending";
  function $(id) { return document.getElementById(id); }
  function fa(n) { return Number(n || 0).toLocaleString("fa-IR"); }
  function toast(m, e) { try { showToast(m, e ? { error: true } : undefined); } catch (x) {} }
  function modal(html) {
    var old = $("earnModal"); if (old) old.remove();
    var m = document.createElement("div");
    m.id = "earnModal"; m.className = "modal-overlay open";
    m.innerHTML = '<div class="modal-card earn-card">' + html + "</div>";
    m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    return m;
  }
  function luhn(s) { var sum = 0, alt = false; for (var i = s.length - 1; i >= 0; i--) { var d = +s[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; } return sum % 10 === 0; }

  async function openEarnings() {
    if (!myProfile) { toast("اول وارد حسابت شو.", true); return; }
    var m = modal('<h2>💰 کسب درآمد</h2><div class="earn-sub">در حال بارگذاری...</div>');
    var r;
    try { r = await supabaseClient.rpc("get_earnings", { p_username: myProfile.username }); } catch (e) { r = { error: e }; }
    if (r.error || !r.data) {
      m.querySelector(".earn-card").innerHTML = '<h2>💰 کسب درآمد</h2><div class="earn-note">بارگذاری ناموفق بود. اگه فایل supabase-earnings.sql رو هنوز اجرا نکردی، اول اجراش کن.</div><button class="modal-close" id="earnClose">بستن</button>';
      $("earnClose").onclick = function () { m.remove(); };
      return;
    }
    var d = r.data, bal = Math.max(0, Number(d.balance)), can = bal >= MIN, pct = Math.min(100, Math.round(bal / MIN * 100));
    m.querySelector(".earn-card").innerHTML =
      '<h2 style="text-align:center">💰 کسب درآمد</h2>' +
      '<div class="earn-sub">موجودی قابل برداشت</div><div class="earn-balance">' + fa(bal) + ' تومان</div>' +
      '<div class="earn-row"><span>👁 ' + fa(d.views) + ' ویو</span><span></span></div>' +
      '<div class="earn-row"><span>❤️ ' + fa(d.likes) + ' لایک</span><span></span></div>' +
      '<div class="earn-row"><span>👥 ' + fa(d.follows) + ' فالوور</span><span></span></div>' +
      (Number(d.penalties) ? '<div class="earn-row"><span>⚠️ کسر شده</span><span>' + fa(d.penalties) + ' تومان</span></div>' : "") +
      (Number(d.withdrawn) ? '<div class="earn-row"><span>برداشت‌شده / در انتظار</span><span>' + fa(d.withdrawn) + ' تومان</span></div>' : "") +
      '<div class="earn-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="earn-note">' + (can ? "✅ موجودیت به حداقل برداشت رسیده؛ گزینه‌ی برداشت فعاله." : "وقتی درآمدت به " + fa(MIN) + " تومان برسه، گزینه‌ی برداشت برات فعال می‌شه.") + "<br>درآمد از پست‌هایی که توی «صفحه‌ی من» می‌ذاری حساب می‌شه؛ ویو و لایک هر نفر روی هر پست فقط یک‌بار.</div>" +
      '<button class="earn-btn" id="earnWithdraw"' + (can ? "" : " disabled") + ">برداشت درآمد</button>" +
      '<button class="modal-close" id="earnClose">بستن</button>';
    $("earnClose").onclick = function () { m.remove(); };
    $("earnWithdraw").onclick = function () { cardStep(m, bal); };
  }

  function cardStep(m, bal) {
    m.querySelector(".earn-card").innerHTML =
      '<h2 style="text-align:center">💳 شماره کارت</h2>' +
      '<div class="earn-note">مبلغ ' + fa(bal) + ' تومان به این کارت واریز می‌شه. شماره‌ی ۱۶ رقمی کارتِ بانکی‌ت (به اسم خودت) رو وارد کن.</div>' +
      '<input id="earnCard" inputmode="numeric" maxlength="19" dir="ltr" placeholder="6037 9900 0000 0000" style="text-align:center;letter-spacing:1px">' +
      '<div class="earn-err" id="earnErr"></div>' +
      '<button class="earn-btn" id="earnSend">ثبت و درخواست واریز</button>' +
      '<button class="modal-close" id="earnBack">برگشت</button>';
    var inp = $("earnCard");
    inp.addEventListener("input", function () { var v = inp.value.replace(/\D/g, "").slice(0, 16); inp.value = v.replace(/(.{4})/g, "$1 ").trim(); });
    $("earnBack").onclick = openEarnings;
    $("earnSend").onclick = async function () {
      var card = inp.value.replace(/\D/g, ""), err = $("earnErr");
      if (card.length !== 16 || !luhn(card)) { err.textContent = "شماره کارت معتبر نیست."; return; }
      var b = $("earnSend"); b.disabled = true; b.textContent = "در حال ثبت...";
      var r; try { r = await supabaseClient.rpc("request_payout", { p_username: myProfile.username, p_card: card }); } catch (e) { r = { error: e }; }
      if (r.error || !r.data || !r.data.ok) {
        b.disabled = false; b.textContent = "ثبت و درخواست واریز";
        err.textContent = r.data && r.data.error === "low_balance" ? "موجودی به حداقل برداشت نرسیده." : "ثبت ناموفق بود؛ دوباره امتحان کن.";
        return;
      }
      m.querySelector(".earn-card").innerHTML = '<div class="earn-intro"><div class="ei-emoji">✅</div><h2>درخواست ثبت شد</h2><p>مبلغ ' + fa(r.data.amount) + ' تومان به‌زودی به کارتت واریز می‌شه.</p></div><button class="modal-close" id="earnClose">باشه</button>';
      $("earnClose").onclick = function () { m.remove(); };
    };
  }

  /* ---------- آیتم تنظیمات ---------- */
  function addSettingsItem() {
    if (document.querySelector('.settings-item[data-setting="earn"]')) return;
    var ref = document.querySelector('.settings-item[data-setting="mypage"]');
    if (!ref) return;
    var el = document.createElement("div");
    el.className = "settings-item"; el.dataset.setting = "earn";
    el.innerHTML = '<span class="si-icon">💰</span><span class="si-label">کسب درآمد</span><span class="si-tag">ویو، لایک، فالو</span><span class="si-chevron">‹</span>';
    el.addEventListener("click", openEarnings);
    ref.parentNode.insertBefore(el, ref.nextSibling);
  }
  addSettingsItem();

  /* ---------- پیام بعد از ثبت‌نام ---------- */
  function showIntro() {
    var m = modal('<div class="earn-intro"><div class="ei-emoji">💰</div><h2>پست بذار، کسب درآمد کن!</h2>' +
      "<p>توی «صفحه‌ی من» پست بذار و ویو و لایک و فالوور بگیر. با گذاشتن پست حتی بیشتر از روبیکا درآمد کسب کن 🚀</p>" +
      '<p class="earn-note" style="margin-top:12px">برای دیدن درآمدت به <b>تنظیمات › کسب درآمد</b> برو. وقتی درآمدت به ' + fa(MIN) + " تومان برسه، می‌تونی با وارد کردن شماره کارتت برداشتش کنی.</p></div>" +
      '<button class="earn-btn" id="earnIntroGo">دیدن کسب درآمد</button><button class="modal-close" id="earnIntroOk">باشه</button>');
    $("earnIntroOk").onclick = function () { m.remove(); };
    $("earnIntroGo").onclick = function () { m.remove(); openEarnings(); };
  }
  var prevConfirm = window.confirmPasswordAndContinue;
  if (typeof prevConfirm === "function") {
    window.confirmPasswordAndContinue = async function () {
      var reg = typeof pendingAuthMode !== "undefined" && pendingAuthMode === "register";
      var r = await prevConfirm.apply(this, arguments);
      try { if (reg && myProfile) localStorage.setItem(INTRO_KEY, myProfile.username); } catch (e) {}
      return r;
    };
  }
  setInterval(function () {
    addSettingsItem();
    try {
      var u = localStorage.getItem(INTRO_KEY);
      if (!u || !myProfile || String(myProfile.username) !== u || $("welcomeOverlay") || $("earnModal")) return;
      var home = $("roomsScreen"), chat = $("chatScreen");
      if ((home && home.style.display && home.style.display !== "none") || (chat && chat.style.display && chat.style.display !== "none")) {
        localStorage.removeItem(INTRO_KEY); showIntro();
      }
    } catch (e) {}
  }, 1200);

  /* ---------- پیام کسر از درآمد (دلیل و مبلغ رو خودِ مدیر تعیین می‌کنه) ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function showPenalty(list) {
    var p = list.shift(); if (!p) return;
    var ov = document.createElement("div");
    ov.className = "modal-overlay open"; ov.id = "penaltyModal";
    ov.innerHTML = '<div class="modal-card earn-card"><div class="earn-intro"><div class="ei-emoji">⚠️</div><h2>کسر از درآمد</h2><p>' + esc(p.reason) + '</p><p><b>' + fa(p.amount) + ' تومان</b> از درآمد شما کم شد.</p></div><button class="earn-btn" id="penOk">متوجه شدم</button></div>';
    document.body.appendChild(ov);
    $("penOk").onclick = async function () {
      try { await supabaseClient.rpc("ack_penalty", { p_username: myProfile.username, p_id: p.id }); } catch (e) {}
      ov.remove(); showPenalty(list);
    };
  }
  var penChecked = {};
  async function checkPenalties() {
    var r; try { r = await supabaseClient.rpc("get_pending_penalties", { p_username: myProfile.username }); } catch (e) { return; }
    if (r && !r.error && r.data && r.data.length && !$("penaltyModal")) showPenalty(r.data.slice());
  }
  setInterval(function () {
    if (!myProfile || $("welcomeOverlay") || $("penaltyModal")) return;
    var home = $("roomsScreen"), chat = $("chatScreen");
    var on = (home && home.style.display && home.style.display !== "none") || (chat && chat.style.display && chat.style.display !== "none");
    var k = myProfile.username, now = Date.now();
    if (on && (!penChecked[k] || now - penChecked[k] > 300000)) { penChecked[k] = now; checkPenalties(); }
  }, 2000);
  window.ayvinOpenEarnings = openEarnings;
})();
