/* ============================================================
   آیوین — ۱۸: قابلیت‌های نسخه‌ی ۲
   ۱) پروفایل: بزرگ‌کردن عکس، بیوگرافی، ویرایش مشخصات، تغییر یوزرنیم، تغییر شماره با کد
   ۲) فراموشی اکانت (ورود با کد پیامکی) و پاک کردن حساب
   ۳) مشاهده‌ی گروه و کانال بدون عضویت (برای ارسال باید عضو شد)
   ۴) کانال‌های عضو در لیست گفتگوها
   ۵) بیوگرافی گروه/کانال/کاربر در هدر و اطلاعات
   ۶) ارسال با/بدون جواب هوش مصنوعی + تغییر مدل هوش مصنوعی گروه از تنظیمات گروه
   ۷) درباره‌ی آیوین (کامل‌تر)
   ============================================================ */
(function () {
  "use strict";

  /* ---------- تنظیمات قابل تغییر ---------- */
  // چه نقش‌هایی بتوانند مدل هوش مصنوعی گروه را عوض کنند (برای «همه‌ی اعضا» بنویس ["owner","admin","member"])
  var AI_MODEL_ROLES = ["owner", "admin"];
  var MIN_AGE = 5, MAX_AGE = 100;
  var MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  var RELS = [["سینگل", "💚 سینگل"], ["رل دارم", "💞 رل دارم"], ["اکس دارم", "💔 اکس دارم"], ["متاهل", "💍 ازدواج کرده‌ام"]];

  /* ---------- ابزارهای کوچک ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return typeof escapeHtml === "function" ? escapeHtml(s) :
      String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function toFa(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); }
  function toast(msg, err, ms) { if (typeof showToast === "function") showToast(msg, { error: !!err, duration: ms || 2600 }); }
  function modalOf(id, title) {
    var m = ensureSimpleModal(id, title);
    var card = m.querySelector(".modal-card");
    if (card) card.classList.add("ayv-modal");
    return m;
  }
  function jNow() {
    try {
      var parts = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
      var o = {};
      parts.forEach(function (p) { if (p.type === "year" || p.type === "month" || p.type === "day") o[p.type] = parseInt(p.value, 10); });
      if (o.year && o.month && o.day) return { y: o.year, m: o.month, d: o.day };
    } catch (e) {}
    return { y: new Date().getFullYear() - 621, m: 1, d: 1 };
  }
  function calcAge(y, m, d) {
    var n = jNow(), a = n.y - y;
    if (n.m < m || (n.m === m && n.d < d)) a--;
    return a;
  }
  function maxDayOf(m) { return m <= 6 ? 31 : 30; }

  function resizeImage(file, max, quality) {
    return new Promise(function (resolve) {
      try {
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var s = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * s));
          c.height = Math.max(1, Math.round(img.height * s));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (b) { URL.revokeObjectURL(url); resolve(b || file); }, "image/jpeg", quality);
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      } catch (e) { resolve(file); }
    });
  }
  async function uploadAvatar(file, prefix) {
    var blob = await resizeImage(file, 640, 0.85);
    var path = "avatars/" + prefix + "_" + Date.now() + ".jpg";
    var r = await supabaseClient.storage.from("images").upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
    if (r.error) throw r.error;
    var u = supabaseClient.storage.from("images").getPublicUrl(path);
    return u && u.data && u.data.publicUrl;
  }
  async function postJson(url, body) {
    var res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var data = await res.json().catch(function () { return {}; });
    return { ok: !!(res.ok && data && data.ok), error: data && data.error, data: data };
  }
  function broadcastMyProfile() {
    try {
      profileBroadcastChannel && profileBroadcastChannel.send({ type: "broadcast", event: "profile_updated", payload: { username: myProfile.username, profile: Object.assign({}, myProfile) } });
    } catch (e) {}
    try { if (presenceChannel && typeof privHideOnline === "function" && !privHideOnline()) presenceChannel.track(publicProfile(myProfile)); } catch (e) {}
  }
  function openLightbox(url) {
    var img = $("lightboxImg"), ov = $("lightboxOverlay");
    if (!img || !ov || !url) return;
    img.src = url;
    ov.classList.add("open");
  }

  /* ---------- بیوگرافی ---------- */
  var bioCache = {};
  async function fetchBio(username) {
    if (!username || !supabaseClient) return "";
    try {
      var r = await supabaseClient.from("users").select("bio").eq("username", username).maybeSingle();
      if (r.error) return "";
      var b = (r.data && r.data.bio) || "";
      bioCache[String(username).toLowerCase()] = b;
      return b;
    } catch (e) { return ""; }
  }
  window.ayvinFetchBio = fetchBio;

  /* ============================================================
     ۱) پروفایل
     ============================================================ */
  var bioToken = 0;
  function decorateProfile(p) {
    if (!p || !p.name) return;
    var own = !!(myProfile && p.username && sameUser(p.username, myProfile.username));
    var bioEl = $("modalBio"), editBtn = $("modalEditBtn"), av = $("modalAvatar");
    if (editBtn) editBtn.style.display = own ? "block" : "none";
    if (bioEl) { bioEl.style.display = "none"; bioEl.textContent = ""; }
    if (av) {
      var shown = typeof applyPrivacy === "function" ? applyPrivacy(p) : p;
      var url = shown && shown.avatar_url;
      if (url) { av.classList.add("has-photo"); av.dataset.zoom = url; }
      else { av.classList.remove("has-photo"); delete av.dataset.zoom; }
    }
    if (p.username && bioEl) {
      var tok = ++bioToken;
      fetchBio(p.username).then(function (b) {
        if (tok !== bioToken || !b) return;
        bioEl.textContent = b;
        bioEl.style.display = "block";
      });
    }
  }
  var _showProfile = window.showProfile;
  if (typeof _showProfile === "function") {
    window.showProfile = function (p) {
      var res = _showProfile.apply(this, arguments);
      try { decorateProfile(p); } catch (e) { console.warn(e); }
      return res;
    };
  }

  /* ---------- ویرایش مشخصات ---------- */
  function fillSel(sel, first, items) {
    sel.innerHTML = "";
    var o = document.createElement("option"); o.value = ""; o.textContent = first; sel.appendChild(o);
    items.forEach(function (it) { var op = document.createElement("option"); op.value = it[0]; op.textContent = it[1]; sel.appendChild(op); });
  }

  async function openEditProfile() {
    if (!myProfile) { toast("اول وارد حسابت شو."); return; }
    var m = modalOf("ayvEditModal", "✏️ ویرایش مشخصات");
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      '<div class="field-label">اسم</div><input id="ep_name" maxlength="20" autocomplete="off">' +
      '<div class="field-label">یوزرنیم (فقط انگلیسی)</div><input id="ep_user" maxlength="20" dir="ltr" autocomplete="off" autocapitalize="off">' +
      '<div id="ep_passWrap" style="display:none;"><div class="field-label">🔑 رمز عبور فعلی (برای تغییر یوزرنیم لازمه)</div><input id="ep_pass" type="password" maxlength="60" autocomplete="off"></div>' +
      '<div class="field-label">✍️ بیوگرافی</div><textarea id="ep_bio" class="ayv-textarea" rows="2" maxlength="150" placeholder="چند کلمه درباره‌ی خودت..."></textarea>' +
      '<div class="field-label">📅 تاریخ تولد (شمسی) — سنت از روی همین حساب می‌شه</div>' +
      '<div class="ayv-edit-row"><select id="ep_d"></select><select id="ep_m"></select><select id="ep_y"></select></div>' +
      '<div class="field-label">💞 وضعیت رابطه</div><select id="ep_rel"></select>' +
      '<div class="field-label">📍 شهر</div><input id="ep_city" maxlength="30" autocomplete="off">' +
      '<div class="field-label">📞 شماره موبایل</div>' +
      '<div class="ayv-phone-row"><div class="ayv-phone-val" id="ep_phone">—</div><button type="button" class="modal-close" id="ep_phoneBtn">تغییر شماره</button></div>' +
      '<div class="login-error" id="ep_err"></div>' +
      '<button type="button" class="call-send-btn" id="ep_save">ذخیره تغییرات</button>';

    var dEl = body.querySelector("#ep_d"), mEl = body.querySelector("#ep_m"), yEl = body.querySelector("#ep_y"), relEl = body.querySelector("#ep_rel");
    var days = []; for (var i = 1; i <= 31; i++) days.push([i, toFa(i)]);
    fillSel(dEl, "روز", days);
    fillSel(mEl, "ماه", MONTHS.map(function (n, idx) { return [idx + 1, n]; }));
    var cy = jNow().y, years = []; for (i = cy - MIN_AGE; i >= cy - MAX_AGE; i--) years.push([i, toFa(i)]);
    fillSel(yEl, "سال", years);
    fillSel(relEl, "انتخاب کن...", RELS);

    var cur = Object.assign({}, myProfile);
    try {
      var r = await supabaseClient.from("users").select("name,city,age,phone,bio,birth_day,birth_month,birth_year,relationship").eq("username", myProfile.username).maybeSingle();
      if (!r.error && r.data) cur = Object.assign(cur, r.data);
      else {
        var r2 = await supabaseClient.from("users").select("name,city,age,phone").eq("username", myProfile.username).maybeSingle();
        if (!r2.error && r2.data) cur = Object.assign(cur, r2.data);
      }
    } catch (e) {}

    body.querySelector("#ep_name").value = cur.name || "";
    body.querySelector("#ep_user").value = myProfile.username || "";
    body.querySelector("#ep_bio").value = cur.bio || "";
    body.querySelector("#ep_city").value = cur.city || "";
    body.querySelector("#ep_phone").textContent = cur.phone || "—";
    if (cur.birth_day) dEl.value = cur.birth_day;
    if (cur.birth_month) mEl.value = cur.birth_month;
    if (cur.birth_year) yEl.value = cur.birth_year;
    if (cur.relationship) relEl.value = cur.relationship;

    var userEl = body.querySelector("#ep_user"), passWrap = body.querySelector("#ep_passWrap"), err = body.querySelector("#ep_err");
    userEl.addEventListener("input", function () {
      passWrap.style.display = userEl.value.trim() !== myProfile.username ? "block" : "none";
    });
    body.querySelector("#ep_phoneBtn").onclick = function () {
      openPhoneChange(function (newPhone) { body.querySelector("#ep_phone").textContent = newPhone; });
    };

    var save = body.querySelector("#ep_save");
    save.onclick = async function () {
      err.textContent = "";
      var name = body.querySelector("#ep_name").value.trim();
      var newUser = userEl.value.trim();
      var bio = body.querySelector("#ep_bio").value.trim();
      var city = body.querySelector("#ep_city").value.trim();
      var rel = relEl.value;
      var d = parseInt(dEl.value, 10), mo = parseInt(mEl.value, 10), y = parseInt(yEl.value, 10);
      if (!name) { err.textContent = "اسم رو وارد کن."; return; }
      if (!city) { err.textContent = "شهر رو وارد کن."; return; }
      var anyBirth = d || mo || y;
      if (anyBirth && !(d && mo && y)) { err.textContent = "روز، ماه و سال تولد رو کامل انتخاب کن."; return; }
      var age = null;
      if (d && mo && y) {
        if (d > maxDayOf(mo)) { err.textContent = "این ماه " + toFa(maxDayOf(mo)) + " روز بیشتر نداره."; return; }
        age = calcAge(y, mo, d);
        if (age < MIN_AGE || age > MAX_AGE) { err.textContent = "تاریخ تولد معتبر نیست."; return; }
      }
      var renaming = newUser !== myProfile.username;
      if (renaming) {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(newUser)) { err.textContent = "یوزرنیم باید ۳ تا ۲۰ کاراکتر و فقط انگلیسی (حروف، عدد، _) باشه."; return; }
        if (newUser.toLowerCase().indexOf("bot-") === 0) { err.textContent = "این یوزرنیم مجاز نیست (بات‌ها این پیشوند رو دارن)."; return; }
        if (!body.querySelector("#ep_pass").value) { err.textContent = "برای تغییر یوزرنیم، رمز عبور فعلیت رو وارد کن."; return; }
      }
      save.disabled = true;
      var oldLabel = save.textContent;
      save.textContent = "در حال ذخیره...";
      try {
        var upd = { name: name, city: city };
        if (age != null) { upd.age = String(age); upd.birth_day = d; upd.birth_month = mo; upd.birth_year = y; }
        if (rel) upd.relationship = rel;
        var u1 = await supabaseClient.from("users").update(upd).eq("username", myProfile.username);
        if (u1.error) {
          var core = { name: name, city: city };
          if (age != null) core.age = String(age);
          var u2 = await supabaseClient.from("users").update(core).eq("username", myProfile.username);
          if (u2.error) { err.textContent = "ذخیره ناموفق بود؛ دوباره امتحان کن."; return; }
          delete upd.birth_day; delete upd.birth_month; delete upd.birth_year; delete upd.relationship;
          toast("تاریخ تولد و وضعیت رابطه ذخیره نشد؛ فایل supabase-new-columns.sql رو اجرا کن.", true, 5000);
        }
        var bioSaved = false;
        try {
          var ub = await supabaseClient.from("users").update({ bio: bio }).eq("username", myProfile.username);
          if (!ub.error) bioSaved = true;
          else toast("بیوگرافی ذخیره نشد؛ فایل supabase-features.sql رو اجرا کن.", true, 5000);
        } catch (e) {}
        Object.assign(myProfile, upd);
        if (bioSaved) { myProfile.bio = bio; bioCache[String(myProfile.username).toLowerCase()] = bio; }

        if (renaming) {
          var res = await supabaseClient.rpc("app_change_username", { p_old: myProfile.username, p_new: newUser, p_hash: await sha256Hex(body.querySelector("#ep_pass").value) });
          if (res.error) {
            err.textContent = /Could not find|does not exist|PGRST202/i.test(res.error.message || "") ? "تابع تغییر یوزرنیم ساخته نشده؛ فایل supabase-features.sql رو در Supabase اجرا کن." : "تغییر یوزرنیم ناموفق بود.";
            saveProfileLocally(myProfile);
            return;
          }
          var out = res.data || {};
          if (!out.ok) {
            err.textContent = out.error === "bad_password" ? "رمز عبور اشتباهه." :
              out.error === "username_taken" ? "این یوزرنیم قبلاً گرفته شده؛ یکی دیگه امتحان کن." :
              out.error === "invalid" ? "این یوزرنیم معتبر نیست." :
              "تغییر یوزرنیم ناموفق بود" + (out.detail ? " (" + out.detail + ")" : ".");
            saveProfileLocally(myProfile);
            return;
          }
          myProfile.username = out.username || newUser;
          saveProfileLocally(myProfile);
          m.classList.remove("open");
          toast("یوزرنیم عوض شد ✅ برنامه دوباره بارگذاری می‌شه...");
          setTimeout(function () { location.reload(); }, 900);
          return;
        }

        saveProfileLocally(myProfile);
        broadcastMyProfile();
        try { refreshSettingsPane(); } catch (e) {}
        try { updateConvHeader(); } catch (e) {}
        m.classList.remove("open");
        toast("مشخصاتت ذخیره شد ✅");
        showProfile(myProfile);
      } catch (e) {
        console.warn(e);
        err.textContent = "ذخیره ناموفق بود؛ دوباره امتحان کن.";
      } finally {
        save.disabled = false;
        save.textContent = oldLabel;
      }
    };
    m.classList.add("open");
  }
  window.ayvinOpenEditProfile = openEditProfile;

  /* ---------- تغییر شماره با کد تایید ---------- */
  function openPhoneChange(onDone) {
    if (!myProfile) return;
    var m = modalOf("ayvPhoneModal", "📞 تغییر شماره موبایل");
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      '<div id="pc_s1"><div class="field-label">شماره‌ی جدید رو وارد کن؛ یه کد تایید براش پیامک می‌شه.</div>' +
      '<input id="pc_phone" type="tel" maxlength="11" placeholder="مثل 09121234567" dir="ltr" autocomplete="off">' +
      '<button type="button" class="call-send-btn" id="pc_send">ارسال کد تایید</button></div>' +
      '<div id="pc_s2" style="display:none;"><div class="field-label" id="pc_info"></div>' +
      '<input id="pc_code" type="tel" maxlength="5" placeholder="کد ۵ رقمی" dir="ltr" autocomplete="off">' +
      '<button type="button" class="call-send-btn" id="pc_verify">تایید و ثبت شماره</button>' +
      '<div class="switch-link" id="pc_back">شماره اشتباهه؟ برگرد</div></div>' +
      '<div class="login-error" id="pc_err"></div>';
    var s1 = body.querySelector("#pc_s1"), s2 = body.querySelector("#pc_s2"), err = body.querySelector("#pc_err");
    var pending = null;
    body.querySelector("#pc_send").onclick = async function () {
      var btn = this, phone = body.querySelector("#pc_phone").value.trim();
      err.textContent = "";
      if (!/^09\d{9}$/.test(phone)) { err.textContent = "شماره باید ۱۱ رقم و با 09 شروع بشه."; return; }
      if (phone === myProfile.phone) { err.textContent = "این همون شماره‌ی فعلیته."; return; }
      btn.disabled = true;
      var old = btn.textContent; btn.textContent = "در حال ارسال...";
      try {
        var dup = await supabaseClient.from("users").select("username").eq("phone", phone).limit(5);
        if (!dup.error && (dup.data || []).some(function (x) { return !sameUser(x.username, myProfile.username); })) {
          err.textContent = "این شماره قبلاً برای یه حساب دیگه ثبت شده."; return;
        }
        var res = await postJson(SMS_SEND_OTP_URL, { username: myProfile.username, phone: phone });
        if (!res.ok) { err.textContent = res.error || "ارسال کد ناموفق بود؛ دوباره امتحان کن."; return; }
        pending = phone;
        body.querySelector("#pc_info").textContent = "کد تایید به " + phone + " پیامک شد.";
        s1.style.display = "none"; s2.style.display = "block";
        body.querySelector("#pc_code").focus();
      } catch (e) { err.textContent = "اتصال برقرار نشد؛ دوباره امتحان کن."; }
      finally { btn.disabled = false; btn.textContent = old; }
    };
    body.querySelector("#pc_back").onclick = function () { s2.style.display = "none"; s1.style.display = "block"; err.textContent = ""; };
    body.querySelector("#pc_verify").onclick = async function () {
      var btn = this, code = body.querySelector("#pc_code").value.trim();
      err.textContent = "";
      if (!/^\d{5}$/.test(code)) { err.textContent = "کد ۵ رقمیه."; return; }
      btn.disabled = true;
      var old = btn.textContent; btn.textContent = "در حال بررسی...";
      try {
        var res = await postJson(SMS_VERIFY_OTP_URL, { username: myProfile.username, code: code });
        if (!res.ok) { err.textContent = res.error || "کد اشتباهه یا منقضی شده."; return; }
        var up = await supabaseClient.from("users").update({ phone: pending }).eq("username", myProfile.username);
        if (up.error) { err.textContent = "شماره تایید شد ولی ذخیره‌اش ناموفق بود؛ دوباره امتحان کن."; return; }
        myProfile.phone = pending;
        myProfile.sms_verified = true;
        saveProfileLocally(myProfile);
        broadcastMyProfile();
        m.classList.remove("open");
        toast("شماره‌ات عوض شد ✅");
        if (typeof onDone === "function") onDone(pending);
      } catch (e) { err.textContent = "اتصال برقرار نشد؛ دوباره امتحان کن."; }
      finally { btn.disabled = false; btn.textContent = old; }
    };
    m.classList.add("open");
  }

  /* ============================================================
     ۲) فراموشی اکانت و پاک کردن حساب
     ============================================================ */
  function maskPhone(p) { p = String(p || ""); return p.length >= 8 ? p.slice(0, 4) + "***" + p.slice(-3) : p; }
  function hideAuthScreens() {
    ["loginScreen", "otpScreen", "usernameLoginScreen", "welcomeBackScreen"].forEach(function (id) { var el = $(id); if (el) el.style.display = "none"; });
  }

  async function lookupAccounts(q) {
    q = String(q || "").trim().replace(/^@/, "");
    if (!q) return [];
    var colsFull = "username,name,phone,sms_phone,sms_verified,avatar_url", colsBase = "username,name,phone,avatar_url";
    async function run(build) {
      var r = await build(colsFull);
      if (r.error) r = await build(colsBase);
      return (r && r.data) || [];
    }
    var found = [];
    if (/^09\d{9}$/.test(q)) {
      var a = await run(function (c) { return supabaseClient.from("users").select(c).eq("phone", q).limit(10); });
      var b = await run(function (c) { return c.indexOf("sms_phone") >= 0 ? supabaseClient.from("users").select(c).eq("sms_phone", q).limit(10) : Promise.resolve({ data: [] }); });
      found = a.concat(b);
    } else if (/^[A-Za-z0-9_]+$/.test(q)) {
      found = await run(function (c) { return supabaseClient.from("users").select(c).ilike("username", q.replace(/([_%])/g, "\\$1")).limit(5); });
    }
    var seen = {}, out = [];
    found.forEach(function (u) { var k = String(u.username).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(u); } });
    return out;
  }

  function openForgot(prefill) {
    var m = modalOf("ayvForgotModal", "😶‍🌫️ فراموشی اکانت");
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      '<div id="fg_s1"><div class="field-label">یوزرنیم یا شماره‌ی موبایل حسابت رو وارد کن؛ یه کد تایید برای شماره‌ی همون حساب پیامک می‌شه.</div>' +
      '<input id="fg_q" maxlength="30" placeholder="یوزرنیم یا شماره (مثل 09121234567)" dir="ltr" autocomplete="off" autocapitalize="off">' +
      '<button type="button" class="call-send-btn" id="fg_next">ادامه</button></div>' +
      '<div id="fg_pick" style="display:none;"></div>' +
      '<div id="fg_s2" style="display:none;"><div class="field-label" id="fg_info"></div>' +
      '<input id="fg_code" type="tel" maxlength="5" placeholder="کد ۵ رقمی" dir="ltr" autocomplete="off">' +
      '<button type="button" class="call-send-btn" id="fg_verify">تایید و ورود به حساب</button>' +
      '<div class="switch-link" id="fg_resend">ارسال دوباره‌ی کد</div>' +
      '<div class="switch-link" id="fg_back">برگرد</div></div>' +
      '<div class="login-error" id="fg_err"></div>';
    var s1 = body.querySelector("#fg_s1"), pick = body.querySelector("#fg_pick"), s2 = body.querySelector("#fg_s2"), err = body.querySelector("#fg_err");
    var acct = null, target = null;
    if (prefill) body.querySelector("#fg_q").value = prefill;

    async function sendCode() {
      err.textContent = "";
      var res = await postJson(SMS_SEND_OTP_URL, { username: acct.username, phone: target });
      if (!res.ok) { err.textContent = res.error || "ارسال کد ناموفق بود؛ دوباره امتحان کن."; return false; }
      body.querySelector("#fg_info").textContent = "کد تایید برای شماره‌ی " + maskPhone(target) + " پیامک شد.";
      s1.style.display = "none"; pick.style.display = "none"; s2.style.display = "block";
      body.querySelector("#fg_code").value = "";
      body.querySelector("#fg_code").focus();
      return true;
    }
    async function choose(a) {
      acct = a;
      target = (a.sms_verified && a.sms_phone) ? a.sms_phone : a.phone;
      if (!/^09\d{9}$/.test(String(target || ""))) { err.textContent = "برای این حساب شماره‌ی معتبری ثبت نشده."; return; }
      try { await sendCode(); } catch (e) { err.textContent = "اتصال برقرار نشد؛ دوباره امتحان کن."; }
    }
    body.querySelector("#fg_next").onclick = async function () {
      var btn = this, q = body.querySelector("#fg_q").value;
      err.textContent = "";
      if (!q.trim()) { err.textContent = "یوزرنیم یا شماره رو وارد کن."; return; }
      btn.disabled = true;
      var old = btn.textContent; btn.textContent = "در حال جستجو...";
      try {
        var list = await lookupAccounts(q);
        if (!list.length) { err.textContent = "حسابی با این مشخصات پیدا نشد."; return; }
        if (list.length === 1) { await choose(list[0]); return; }
        s1.style.display = "none"; pick.style.display = "block";
        pick.innerHTML = '<div class="field-label">چند حساب پیدا شد؛ حساب خودت رو انتخاب کن:</div>';
        list.forEach(function (a) {
          var row = document.createElement("div");
          row.className = "ayv-acct-pick";
          row.innerHTML = '<span class="avatar" style="' + userAvatarStyle(a) + '">' + userAvatarGlyph(a) + '</span><div style="flex:1;min-width:0;"><div style="font-size:13.5px;font-weight:700;">' + esc(a.name || a.username) + '</div><div style="font-size:11px;color:var(--muted);">@' + esc(a.username) + '</div></div>';
          row.onclick = function () { choose(a); };
          pick.appendChild(row);
        });
      } catch (e) { err.textContent = "اتصال برقرار نشد؛ دوباره امتحان کن."; }
      finally { btn.disabled = false; btn.textContent = old; }
    };
    body.querySelector("#fg_back").onclick = function () { s2.style.display = "none"; pick.style.display = "none"; s1.style.display = "block"; err.textContent = ""; };
    body.querySelector("#fg_resend").onclick = async function () { try { if (await sendCode()) toast("کد دوباره ارسال شد"); } catch (e) { err.textContent = "اتصال برقرار نشد."; } };
    body.querySelector("#fg_verify").onclick = async function () {
      var btn = this, code = body.querySelector("#fg_code").value.trim();
      err.textContent = "";
      if (!/^\d{5}$/.test(code)) { err.textContent = "کد ۵ رقمیه."; return; }
      btn.disabled = true;
      var old = btn.textContent; btn.textContent = "در حال بررسی...";
      try {
        var res = await postJson(SMS_VERIFY_OTP_URL, { username: acct.username, code: code });
        if (!res.ok) { err.textContent = res.error || "کد اشتباهه یا منقضی شده."; return; }
        var pr = await selectUsers(function (qq) { return qq.eq("username", acct.username).maybeSingle(); });
        if (!pr || !pr.data) { err.textContent = "ورود به حساب ناموفق بود؛ دوباره امتحان کن."; return; }
        myProfile = pr.data;
        saveProfileLocally(myProfile);
        try { pendingSignupProfile = null; pendingAuthMode = null; pendingExistingHash = null; } catch (e) {}
        hideAuthScreens();
        m.classList.remove("open");
        toast("خوش برگشتی " + (myProfile.name || "") + " 👋");
        proceedJoin();
      } catch (e) { err.textContent = "اتصال برقرار نشد؛ دوباره امتحان کن."; }
      finally { btn.disabled = false; btn.textContent = old; }
    };
    m.classList.add("open");
  }

  /* ---------- پاک کردن حساب ---------- */
  window.ayvinDeleteAccount = function () {
    if (!myProfile) { toast("اول وارد حسابت شو."); return; }
    var m = modalOf("ayvDeleteModal", "🗑️ پاک کردن حساب");
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      '<div class="ayv-danger-box">⚠️ با پاک کردن حساب، پروفایل، پیام‌ها، عضویت‌ها و همه‌ی اطلاعاتت <b>برای همیشه</b> حذف می‌شه و برگشتی نداره.</div>' +
      '<div class="field-label">برای تایید، رمز عبور حسابت رو وارد کن:</div>' +
      '<input id="da_pass" type="password" maxlength="60" autocomplete="off" placeholder="رمز عبور">' +
      '<div class="login-error" id="da_err"></div>' +
      '<button type="button" class="call-send-btn ayv-btn-danger" id="da_go">پاک کردن همیشگی حساب</button>';
    var err = body.querySelector("#da_err");
    body.querySelector("#da_go").onclick = async function () {
      var btn = this, pass = body.querySelector("#da_pass").value;
      err.textContent = "";
      if (!pass) { err.textContent = "رمز عبور رو وارد کن."; return; }
      if (!(await showAppConfirm("مطمئنی؟ حسابت برای همیشه پاک می‌شه.", { confirmText: "آره، پاک کن", danger: true }))) return;
      btn.disabled = true;
      var old = btn.textContent; btn.textContent = "در حال پاک کردن...";
      try {
        var res = await supabaseClient.rpc("app_delete_account", { p_username: myProfile.username, p_hash: await sha256Hex(pass) });
        if (res.error) {
          err.textContent = /Could not find|does not exist|PGRST202/i.test(res.error.message || "") ? "تابع پاک کردن حساب ساخته نشده؛ فایل supabase-features.sql رو در Supabase اجرا کن." : "پاک کردن حساب ناموفق بود.";
          return;
        }
        var out = res.data || {};
        if (!out.ok) {
          err.textContent = out.error === "bad_password" ? "رمز عبور اشتباهه." :
            out.error === "no_password" ? "این حساب رمز عبور نداره؛ اول با فرم ثبت‌نام وارد شو و رمز بساز." :
            "پاک کردن حساب ناموفق بود" + (out.detail ? " (" + out.detail + ")" : ".");
          return;
        }
        var uname = myProfile.username;
        try {
          localStorage.removeItem(SAVED_PROFILE_KEY);
          localStorage.removeItem("chatLastRead_" + uname);
        } catch (e) {}
        try { window.ayvinClearCache && window.ayvinClearCache(); } catch (e) {}
        m.classList.remove("open");
        toast("حسابت پاک شد. خداحافظ 👋");
        setTimeout(function () { location.reload(); }, 1000);
      } catch (e) { err.textContent = "اتصال برقرار نشد؛ دوباره امتحان کن."; }
      finally { btn.disabled = false; btn.textContent = old; }
    };
    m.classList.add("open");
  };

  /* ============================================================
     ۳) مشاهده‌ی گروه بدون عضویت + مدیریت انتخاب گفتگو
     ============================================================ */
  var previewRoomId = null;
  var roomWatch = null;

  function clearPreviewBar() {
    var bar = $("ayvPreviewBar");
    if (bar) bar.remove();
    var composer = document.querySelector("footer.composer");
    if (composer) composer.style.display = "";
  }
  function showPreviewBar(room) {
    var composer = document.querySelector("footer.composer");
    if (!composer || !composer.parentNode) return;
    composer.style.display = "none";
    var bar = document.createElement("div");
    bar.id = "ayvPreviewBar";
    bar.className = "ayv-preview-bar";
    bar.innerHTML = '<span>👀 داری گروه رو مشاهده می‌کنی؛ برای ارسال پیام باید عضو بشی</span><button type="button" class="ayv-join-btn">عضویت در گروه</button>';
    composer.parentNode.insertBefore(bar, composer.nextSibling);
    bar.querySelector("button").onclick = async function () {
      var btn = this;
      btn.disabled = true;
      var ok = await _join.call(window, room.id);
      btn.disabled = false;
      if (ok === false) { toast("عضویت انجام نشد؛ دوباره امتحان کن.", true); return; }
      myRoomIds.add(String(room.id));
      previewRoomId = null;
      clearPreviewBar();
      try { updateConvHeader(); } catch (e) {}
      toast("عضو گروه شدی ✅ حالا می‌تونی پیام بدی");
    };
  }

  var _join = window.joinRoomMembership;
  if (typeof _join === "function") {
    window.joinRoomMembership = function (id) {
      if (previewRoomId && String(id) === String(previewRoomId)) return Promise.resolve(true);
      return _join.apply(this, arguments);
    };
  }

  function watchRoom(conv) {
    try { if (roomWatch) { supabaseClient.removeChannel(roomWatch); roomWatch = null; } } catch (e) {}
    if (!conv || conv.type !== "room" || !supabaseClient) return;
    var id = conv.room.id;
    try {
      roomWatch = supabaseClient.channel("ayv-room-settings-" + id)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: "id=eq." + id }, function (p) {
          if (currentConv && currentConv.type === "room" && String(currentConv.room.id) === String(id) && p && p.new) {
            Object.assign(currentConv.room, p.new);
            try { updateConvHeader(); } catch (e) {}
          }
        }).subscribe();
    } catch (e) {}
  }

  var _select = window.selectConversation;
  if (typeof _select === "function") {
    window.selectConversation = function (conv) {
      clearPreviewBar();
      previewRoomId = null;
      var isPreview = false;
      if (conv && conv.type === "room" && conv.room && myProfile && !myRoomIds.has(String(conv.room.id))) {
        isPreview = true;
        previewRoomId = String(conv.room.id);
        myRoomIds.add(previewRoomId); // تا پرسش «عضو می‌شی؟» نیاید؛ بعد از بخش همزمان برمی‌داریم
      }
      var p = _select.apply(this, arguments);
      if (isPreview) {
        myRoomIds.delete(previewRoomId);
        showPreviewBar(conv.room);
      }
      try { watchRoom(conv); afterHeader(); } catch (e) { console.warn(e); }
      return Promise.resolve(p).then(function (v) { try { afterHeader(); } catch (e) {} return v; });
    };
  }

  var _logout = window.logout;
  if (typeof _logout === "function") {
    window.logout = async function () {
      var r = await _logout.apply(this, arguments);
      if (!myProfile) { try { window.ayvinClearCache && window.ayvinClearCache(); } catch (e) {} }
      return r;
    };
  }

  var _sendMessage = window.sendMessage;
  if (typeof _sendMessage === "function") {
    window.sendMessage = function () {
      if (previewRoomId && currentConv && currentConv.type === "room") {
        toast("برای ارسال پیام باید عضو گروه بشی.");
        return Promise.resolve();
      }
      return _sendMessage.apply(this, arguments);
    };
  }

  /* ============================================================
     ۴) هدر: بیوگرافی + دکمه‌های ارسال با/بدون هوش مصنوعی
     ============================================================ */
  function afterHeader() {
    var bioEl = $("convTitleBio"), composer = document.querySelector("footer.composer"), noAi = $("sendNoAiBtn"), send = $("sendBtn");
    var bio = "";
    if (currentConv) {
      if (currentConv.type === "room") bio = currentConv.room.bio || "";
      else if (currentConv.type === "channel") bio = currentConv.channel.description || "";
      else if (currentConv.type === "dmUser" && currentConv.user && currentConv.user.username) {
        var k = String(currentConv.user.username).toLowerCase();
        if (Object.prototype.hasOwnProperty.call(bioCache, k)) bio = bioCache[k];
        else fetchBio(currentConv.user.username).then(function (b) {
          if (currentConv && currentConv.type === "dmUser" && String(currentConv.user.username).toLowerCase() === k && $("convTitleBio")) $("convTitleBio").textContent = b || "";
        });
      }
    }
    if (bioEl) bioEl.textContent = bio;
    var aiRoom = !!(currentConv && currentConv.type === "room" && currentConv.room.ai_bot_id && typeof getBot === "function" && getBot(currentConv.room.ai_bot_id));
    if (noAi) noAi.style.display = aiRoom && !previewRoomId ? "flex" : "none";
    if (composer) composer.classList.toggle("ai-room", aiRoom);
    if (send) { send.title = aiRoom ? "ارسال با جواب هوش مصنوعی" : "ارسال"; send.setAttribute("aria-label", send.title); }
    if (aiRoom) {
      try {
        if (!localStorage.getItem("ayv_ai_hint")) {
          localStorage.setItem("ayv_ai_hint", "1");
          toast("🤖 = ارسال با جواب هوش مصنوعی  •  🚫 (دکمه‌ی خاکستری) = ارسال بدون جواب هوش مصنوعی", false, 7000);
        }
      } catch (e) {}
    }
  }

  var _uch = window.updateConvHeader;
  if (typeof _uch === "function") {
    window.updateConvHeader = function () {
      var r = _uch.apply(this, arguments);
      try { afterHeader(); } catch (e) {}
      return r;
    };
  }

  function wireSendNoAi() {
    var b = $("sendNoAiBtn");
    if (!b) return;
    b.addEventListener("click", async function () {
      window.__ayvinSkipAi = true;
      try { await window.sendMessage(); }
      finally { window.__ayvinSkipAi = false; }
    });
  }

  /* ---------- جعبه‌ی ویژگی‌ها در اطلاعات گروه: بیو + مدل هوش مصنوعی ---------- */
  async function buildGroupFeatureBox(room) {
    var box = $("groupFeatureBox");
    if (!box) return;
    var sub = $("groupInfoSub");
    if (sub) sub.textContent = room.bio || room.description || "گروه";
    box.innerHTML = "";
    var role = "member";
    try { role = await getMyRoleInRoom(room.id); } catch (e) {}
    if (!currentConv || currentConv.type !== "room" || currentConv.room !== room) return;
    var canBio = role === "owner" || role === "admin";
    var canAi = AI_MODEL_ROLES.indexOf(role) >= 0;

    var wrap = document.createElement("div");
    // بیوگرافی
    if (canBio) {
      wrap.innerHTML += '<div class="ai-select-label">✍️ بیوگرافی گروه</div>' +
        '<textarea id="gf_bio" class="ayv-textarea" rows="2" maxlength="150" placeholder="گروه درباره‌ی چیه؟"></textarea>' +
        '<button type="button" class="modal-close" id="gf_bioSave" style="margin-top:0;margin-bottom:12px;">ذخیره‌ی بیوگرافی</button>';
    } else if (room.bio) {
      wrap.innerHTML += '<div class="ai-select-label">✍️ بیوگرافی گروه</div><div class="pf-bio" style="margin-top:0;">' + esc(room.bio) + '</div>';
    }
    // مدل هوش مصنوعی
    var opts = '<option value="">— بدون هوش مصنوعی —</option>' + (typeof AI_BOTS !== "undefined" ? AI_BOTS : []).map(function (b) {
      return '<option value="' + esc(b.id) + '">' + esc(b.avatar) + " " + esc(b.name) + "</option>";
    }).join("");
    wrap.innerHTML += '<div class="ai-select-label">🤖 مدل هوش مصنوعی گروه</div><select id="gf_ai"' + (canAi ? "" : " disabled") + '>' + opts + '</select>' +
      (canAi ? "" : '<div style="font-size:11px;color:var(--muted);margin:-4px 0 8px;">فقط مالک و ادمین‌های گروه می‌تونن مدل رو عوض کنن.</div>');
    box.appendChild(wrap);

    var aiSel = box.querySelector("#gf_ai");
    aiSel.value = room.ai_bot_id || "";
    if (canAi) {
      aiSel.onchange = async function () {
        var v = aiSel.value || null;
        var r = await supabaseClient.from("rooms").update({ ai_bot_id: v }).eq("id", room.id);
        if (r.error) { toast("تغییر مدل ناموفق بود.", true); aiSel.value = room.ai_bot_id || ""; return; }
        room.ai_bot_id = v;
        try { updateConvHeader(); } catch (e) {}
        var bot = v && typeof getBot === "function" ? getBot(v) : null;
        toast(bot ? "مدل گروه شد: " + bot.avatar + " " + bot.name : "هوش مصنوعی گروه خاموش شد");
      };
    }
    if (canBio) {
      var bioIn = box.querySelector("#gf_bio");
      bioIn.value = room.bio || "";
      box.querySelector("#gf_bioSave").onclick = async function () {
        var val = bioIn.value.trim();
        var r = await supabaseClient.from("rooms").update({ bio: val }).eq("id", room.id);
        if (r.error) { toast("ذخیره نشد؛ فایل supabase-features.sql رو اجرا کن.", true, 4500); return; }
        room.bio = val;
        if (sub) sub.textContent = val || room.description || "گروه";
        try { updateConvHeader(); } catch (e) {}
        toast("بیوگرافی گروه ذخیره شد ✅");
      };
    }
  }

  /* ============================================================
     ۵) کانال‌های عضو در لیست گفتگوها
     ============================================================ */
  async function renderMyChannels() {
    var boxes = [$("homeAllChannels"), $("homeGroupsChannels")].filter(Boolean);
    if (!myProfile || !boxes.length || !supabaseClient) return;
    try {
      var m = await supabaseClient.from("channel_members").select("channel_id,role").eq("username", myProfile.username);
      if (m.error) return;
      var ids = (m.data || []).map(function (x) { return x.channel_id; });
      var st = window.danyalChannelState;
      if (st) {
        st.ids = new Set(ids.map(String));
        st.roles = new Map((m.data || []).map(function (x) { return [String(x.channel_id), x.role]; }));
      }
      var list = [];
      if (ids.length) {
        var c = await supabaseClient.from("channels").select("*").in("id", ids).order("created_at", { ascending: false });
        list = c.data || [];
      }
      boxes.forEach(function (box) {
        box.innerHTML = "";
        if (!list.length) {
          box.innerHTML = '<div class="no-rooms-msg">هنوز عضو کانالی نیستی؛ از «کانال‌های فعال» یکی رو انتخاب کن.</div>';
          return;
        }
        list.forEach(function (ch) {
          var row = document.createElement("div");
          row.className = "channel-card my-channel";
          row.dataset.channelId = ch.id;
          row.innerHTML = '<span class="avatar" style="' + entityAvatarStyle(ch) + '">' + entityAvatarGlyph(ch, "📢") + '</span>' +
            '<div class="channel-card-info"><div class="channel-card-name">' + esc(ch.name) + vBadge(ch) + '</div>' +
            '<div class="channel-card-sub">' + esc(ch.description ? String(ch.description).slice(0, 60) : "@" + ch.slug) + '</div></div>';
          row.onclick = function () {
            $("roomsScreen").style.display = "none";
            $("roomPasswordScreen").style.display = "none";
            $("chatScreen").style.display = "flex";
            selectConversation({ type: "channel", channel: ch });
          };
          box.appendChild(row);
        });
      });
    } catch (e) { console.warn("my channels:", e); }
  }
  window.ayvinRenderMyChannels = renderMyChannels;

  var _setHomeTab = window.setHomeTab;
  if (typeof _setHomeTab === "function") {
    window.setHomeTab = function (which) {
      var r = _setHomeTab.apply(this, arguments);
      if (which === "all" || which === "groups") renderMyChannels();
      return r;
    };
  }

  /* ============================================================
     ۶) ساخت گروه: عکس و بیوگرافی الزامی
     ============================================================ */
  var roomExtras = { modal: { file: null, btn: "newGroupAvatarBtn", fileEl: "newGroupAvatarFile", bio: "newGroupBioInput" },
                     home: { file: null, btn: "roomAvatarBtn", fileEl: "roomAvatarFile", bio: "roomBioInput" } };
  var PICK_LABEL = "🖼️ عکس گروه (الزامی)";
  function wirePicker(key) {
    var ex = roomExtras[key], b = $(ex.btn), f = $(ex.fileEl);
    if (!b || !f) return;
    b.addEventListener("click", function () { f.click(); });
    f.addEventListener("change", function () {
      var x = f.files && f.files[0];
      if (!x) return;
      if (!/^image\//.test(x.type)) { toast("فقط فایل تصویری انتخاب کن.", true); f.value = ""; return; }
      if (x.size > 8 * 1024 * 1024) { toast("حجم عکس باید حداکثر ۸ مگابایت باشه.", true); f.value = ""; return; }
      ex.file = x;
      b.classList.add("has-file");
      b.textContent = "✅ عکس انتخاب شد";
    });
  }
  function resetRoomExtras(key) {
    var ex = roomExtras[key];
    ex.file = null;
    var b = $(ex.btn), f = $(ex.fileEl), bio = $(ex.bio);
    if (b) { b.classList.remove("has-file"); b.textContent = PICK_LABEL; }
    if (f) f.value = "";
    if (bio) bio.value = "";
  }
  window.ayvinNewRoomError = function (which) {
    var ex = roomExtras[which], bio = $(ex.bio);
    if (!ex.file) return "یه عکس برای گروه انتخاب کن 📷";
    if (!bio || !bio.value.trim()) return "بیوگرافی گروه رو بنویس ✍️";
    return "";
  };
  window.ayvinAfterRoomCreated = async function (room, which) {
    var ex = roomExtras[which], bioEl = $(ex.bio);
    var bio = bioEl ? bioEl.value.trim() : "";
    var upd = {};
    try { if (ex.file) upd.avatar_url = await uploadAvatar(ex.file, "room_" + room.id); }
    catch (e) { console.warn("room avatar:", e); toast("آپلود عکس گروه ناموفق بود؛ بعداً از اطلاعات گروه عوضش کن.", true, 4500); }
    if (bio) upd.bio = bio;
    if (Object.keys(upd).length) {
      var r = await supabaseClient.from("rooms").update(upd).eq("id", room.id);
      if (r.error) {
        if (upd.avatar_url) {
          var r2 = await supabaseClient.from("rooms").update({ avatar_url: upd.avatar_url }).eq("id", room.id);
          if (!r2.error) room.avatar_url = upd.avatar_url;
        }
        if (bio) toast("بیوگرافی گروه ذخیره نشد؛ فایل supabase-features.sql رو اجرا کن.", true, 5000);
      } else Object.assign(room, upd);
    }
    resetRoomExtras(which);
  };

  /* ============================================================
     ۷) درباره‌ی آیوین
     ============================================================ */
  window.openAyvinAbout = function () {
    var m = ensureSimpleModal("ayvAboutModal", "");
    var title = m.querySelector(".sm-title");
    if (title) title.style.display = "none";
    var botCount = typeof AI_BOTS !== "undefined" ? AI_BOTS.length : 0;
    var botNames = typeof AI_BOTS !== "undefined" ? AI_BOTS.slice(0, 6).map(function (b) { return b.avatar + " " + b.name; }).join("  ") : "";
    var feats = [
      ["💬", "گفتگوی خصوصی و گروهی", "پیام، عکس، ویدیو، فایل، پیام صوتی، نظرسنجی، ریپلای، فوروارد، واکنش و پین"],
      ["🤖", "هوش مصنوعی توی گروه", (botCount ? toFa(botCount) + " دستیار هوشمند؛ " : "") + "مدل هر گروه از تنظیماتش عوض می‌شه و برای هر پیام انتخاب می‌کنی جواب بده یا نه"],
      ["📢", "کانال‌ها", "کانال عمومی و خصوصی با لینک دعوت، مالک، ادمین و سنجاق پست"],
      ["📞", "تماس درون‌برنامه‌ای", "تماس تصویری داخل خود آیوین؛ گوگل میت هم کنارشه"],
      ["👀", "مشاهده بدون عضویت", "پیام‌های هر گروه و کانال رو ببین؛ برای ارسال عضو شو"],
      ["🔒", "حریم خصوصی حرفه‌ای", "هر مشخصه رو از همه یا فقط از افراد انتخابی مخفی کن"],
      ["🪪", "پروفایل کامل", "عکس، بیو، پست‌های متنی، عکس و ویدیو، تغییر یوزرنیم و شماره با کد"],
      ["🆘", "فراموشی اکانت", "با یوزرنیم یا شماره، کد پیامکی بگیر و دوباره وارد شو"],
      ["✔️", "تیک آبی", "با آوردن ۵ کاربر فعال، تیک آبی بگیر"],
      ["🔔", "اعلان push و پیامکی", "از پیام‌های جدید جا نمون، حتی وقتی برنامه بسته‌ست"],
      ["🧠", "جستجوی هوشمند", "توی پیام‌ها بر اساس معنی بگرد، نه فقط کلمه"],
      ["🎮", "بازی‌های آنلاین", "وقتی حوصله‌ت سر رفت، یه بازی بزن"],
      ["📲", "نصب مثل برنامه", "روی گوشی نصبش کن؛ تیره و روشن، فارسی و English"],
      ["⚡", "سریع و سبک", "بدون ثبت‌نام پیچیده؛ با یه رمز عبور وارد می‌شی"]
    ];
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      '<div class="ab-hero"><div class="ab-logo">💬</div><div class="ab-name">آیوین</div>' +
      '<div class="ab-tag">پیام‌رسان آزاد، سریع و هوشمند برای فارسی‌زبان‌ها<br>گروه، کانال، تماس و هوش مصنوعی؛ همه در یک برنامه</div></div>' +
      '<button type="button" class="ab-wow" id="abWow">😍 وای چقدر آیوین خفنه!</button>' +
      (botNames ? '<div class="ab-tag" style="text-align:center;margin-top:10px;">دستیارهای هوشمند: ' + esc(botNames) + (botCount > 6 ? " و ..." : "") + '</div>' : "") +
      '<div class="ab-grid">' + feats.map(function (f) {
        return '<div class="ab-item"><div class="ab-ic">' + f[0] + '</div><div class="ab-t">' + f[1] + '</div><div class="ab-d">' + f[2] + '</div></div>';
      }).join("") + '</div>' +
      '<div class="ab-foot">ساخته‌شده با ❤️ برای شما — نسخه ۲.۰</div>';
    var lines = ["وای چقدر آیوین خفنه! 😍🔥", "آیوین یعنی سرعت + هوش مصنوعی + آزادی 🚀", "همه‌چیز یه‌جا؛ گروه، کانال، تماس و هوش مصنوعی ✨", "به دوستات بگو، تیک آبی منتظرته ✔️💙", "آیوین؛ پیام‌رسانِ خودمون 😎"];
    var li = 0;
    body.querySelector("#abWow").onclick = function () {
      var emo = ["🔥", "😍", "🚀", "💙", "✨", "🎉", "😎", "⚡", "💬", "🤩"];
      for (var i = 0; i < 22; i++) {
        (function (i) {
          setTimeout(function () {
            var s = document.createElement("span");
            s.className = "ab-pop";
            s.textContent = emo[Math.floor(Math.random() * emo.length)];
            s.style.left = (4 + Math.random() * 88) + "vw";
            s.style.bottom = (6 + Math.random() * 14) + "vh";
            document.body.appendChild(s);
            setTimeout(function () { s.remove(); }, 1700);
          }, i * 60);
        })(i);
      }
      toast(lines[li++ % lines.length], false, 2800);
    };
    m.classList.add("open");
  };

  /* ============================================================
     راه‌اندازی
     ============================================================ */
  function openConvInfo() {
    if (!currentConv) return;
    if (currentConv.type === "dmUser" && currentConv.user) showProfile(currentConv.user);
    else if (currentConv.type === "room" || currentConv.type === "channel") { var g = $("groupInfoBtn"); if (g) g.click(); }
  }

  function boot() {
    // پروفایل
    var editBtn = $("modalEditBtn");
    if (editBtn) editBtn.addEventListener("click", function () { $("profileModal").classList.remove("open"); openEditProfile(); });
    var av = $("modalAvatar");
    if (av) av.addEventListener("click", function () { if (av.dataset.zoom) openLightbox(av.dataset.zoom); });

    // فراموشی اکانت
    var f1 = $("forgotAccountLink"), f2 = $("forgotAccountLink2");
    if (f1) f1.addEventListener("click", function () { var i = $("usernameLoginInput"); openForgot(i ? i.value.trim() : ""); });
    if (f2) f2.addEventListener("click", function () { openForgot(typeof pendingSignupProfile !== "undefined" && pendingSignupProfile ? pendingSignupProfile.username : ""); });
    var _sps = window.showPasswordScreen;
    if (typeof _sps === "function") {
      window.showPasswordScreen = function () {
        var r = _sps.apply(this, arguments);
        var l = $("forgotAccountLink2");
        if (l) l.style.display = (typeof pendingAuthMode !== "undefined" && pendingAuthMode === "login") ? "block" : "none";
        return r;
      };
    }

    // هدر و لیست‌ها
    var ca = $("convAvatar"), cb = document.querySelector(".conv-title-block");
    if (ca) ca.addEventListener("click", openConvInfo);
    if (cb) cb.addEventListener("click", openConvInfo);
    ["homeContactsList", "homeAllUsers", "homeUsersPane"].forEach(function (id) {
      var c = $(id);
      if (!c) return;
      c.addEventListener("click", async function (e) {
        var a = e.target.closest && e.target.closest(".avatar");
        if (!a) return;
        var row = a.closest(".switcher-item");
        if (!row || !row.dataset.username) return;
        e.stopPropagation(); e.preventDefault();
        try {
          var r = await selectUsers(function (q) { return q.eq("username", row.dataset.username).maybeSingle(); });
          if (r && r.data) showProfile(r.data);
        } catch (err) {}
      }, true);
    });

    // ارسال بدون هوش مصنوعی
    wireSendNoAi();

    // ساخت گروه
    wirePicker("modal"); wirePicker("home");
    var ng = $("newGroupTopbarBtn");
    if (ng) ng.addEventListener("click", function () { resetRoomExtras("modal"); });

    // اطلاعات گروه
    var gi = $("groupInfoBtn");
    if (gi) gi.addEventListener("click", function () {
      if (currentConv && currentConv.type === "room") buildGroupFeatureBox(currentConv.room);
    });
  }
  boot();
})();
