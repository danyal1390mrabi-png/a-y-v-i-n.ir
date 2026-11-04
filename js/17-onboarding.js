/* ============================================================
   آیوین — ۱۷: ورود (پاپ‌آپ خوش‌آمد)، ثبت‌نام کامل، تایید شماره،
   مشخصات و پست‌های پروفایل، و صدای اعلان
   ============================================================ */
(function () {
  "use strict";

  /* ---------- تنظیمات قابل تغییر ---------- */
  var WELCOME_WAIT_SECONDS = 15;          // مدت انتظار پاپ‌آپ خوش‌آمد
  var PHONE_GATE_FOR_EXISTING_USERS = true; // اگر false باشد فقط ثبت‌نام‌های جدید شماره را تایید می‌کنند
  var MAX_POSTS = 10;
  window.AYVIN_MAX_POSTS = MAX_POSTS;
  var MIN_AGE = 5, MAX_AGE = 100;
  var WELCOME_HIDE_KEY = "ayvin_welcome_hide";
  var WELCOME_SEEN_KEY = "ayvin_welcome_seen";

  var MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  var REL_ICON = { "سینگل": "💚", "رل دارم": "💞", "اکس دارم": "💔", "متاهل": "💍" };

  function $(id) { return document.getElementById(id); }
  function toFa(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); }
  function esc(s) { return typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s); }

  /* ---------- تاریخ شمسی و سن ---------- */
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
    var n = jNow();
    var a = n.y - y;
    if (n.m < m || (n.m === m && n.d < d)) a--;
    return a;
  }
  function maxDayOf(m) { return m <= 6 ? 31 : 30; }

  /* ============================================================
     ۱) پاپ‌آپ خوش‌آمد
     ============================================================ */
  function shouldShowWelcome() {
    try {
      if (localStorage.getItem(WELCOME_HIDE_KEY) === "1") return false;
      if (sessionStorage.getItem(WELCOME_SEEN_KEY) === "1") return false;
    } catch (e) {}
    return true;
  }

  function showWelcome() {
    if (!shouldShowWelcome() || $("welcomeOverlay")) return;
    var ov = document.createElement("div");
    ov.id = "welcomeOverlay";
    ov.className = "welcome-overlay";
    ov.innerHTML =
      '<div class="welcome-card">' +
        '<div class="welcome-page" id="welcomePage1">' +
          '<div class="welcome-emoji">🎉</div>' +
          '<h2>به آیوین خوش اومدی!</h2>' +
          '<p>این برنامه تازه ساخته شده است.<br>با آوردن <b>۵ کاربر فعال</b>، شما <b>تیک آبی</b> <span class="welcome-tick">✔</span> می‌گیرید!</p>' +
          '<button type="button" class="welcome-btn" id="welcomeNextBtn" disabled></button>' +
        '</div>' +
        '<div class="welcome-page" id="welcomePage2" style="display:none;">' +
          '<div class="welcome-emoji">🕊️</div>' +
          '<h2>قانون آیوین</h2>' +
          '<p>این برنامه قانون نداره و <b>آزاده</b>!<br>تنها قانون این برنامه <b>فحاشی نکردن</b> به دیگرانه؛<br>لطفاً به هیچ کاربری فحاشی نکنید.</p>' +
          '<button type="button" class="welcome-btn" id="welcomeFinishBtn">پایان</button>' +
          '<button type="button" class="welcome-btn welcome-btn-ghost" id="welcomeNeverBtn">دیگر نشان داده نشود</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var next = $("welcomeNextBtn"), left = WELCOME_WAIT_SECONDS;
    function paint() {
      next.textContent = left > 0 ? "بعدی (" + toFa(left) + ")" : "بعدی";
      next.disabled = left > 0;
    }
    paint();
    var timer = setInterval(function () {
      left--;
      paint();
      if (left <= 0) clearInterval(timer);
    }, 1000);

    function close(forever) {
      clearInterval(timer);
      try {
        sessionStorage.setItem(WELCOME_SEEN_KEY, "1");
        if (forever) localStorage.setItem(WELCOME_HIDE_KEY, "1");
      } catch (e) {}
      ov.remove();
    }
    next.addEventListener("click", function () {
      if (next.disabled) return;
      $("welcomePage1").style.display = "none";
      $("welcomePage2").style.display = "block";
    });
    $("welcomeFinishBtn").addEventListener("click", function () { close(false); });
    $("welcomeNeverBtn").addEventListener("click", function () { close(true); });
  }

  /* ============================================================
     ۲) فرم ثبت‌نام: عکس، تاریخ تولد، وضعیت رابطه
     ============================================================ */
  var signupFile = null;
  var signupPreviewUrl = null;

  function fillBirthSelects() {
    var dEl = $("birthDay"), mEl = $("birthMonth"), yEl = $("birthYear");
    if (!dEl || !mEl || !yEl || dEl.options.length) return;
    var i, o;
    o = document.createElement("option"); o.value = ""; o.textContent = "روز"; dEl.appendChild(o);
    for (i = 1; i <= 31; i++) { o = document.createElement("option"); o.value = i; o.textContent = toFa(i); dEl.appendChild(o); }
    o = document.createElement("option"); o.value = ""; o.textContent = "ماه"; mEl.appendChild(o);
    MONTHS.forEach(function (name, idx) { var op = document.createElement("option"); op.value = idx + 1; op.textContent = name; mEl.appendChild(op); });
    o = document.createElement("option"); o.value = ""; o.textContent = "سال"; yEl.appendChild(o);
    var cy = jNow().y;
    for (i = cy - MIN_AGE; i >= cy - MAX_AGE; i--) { o = document.createElement("option"); o.value = i; o.textContent = toFa(i); yEl.appendChild(o); }
  }

  function readBirth() {
    var d = parseInt($("birthDay").value, 10), m = parseInt($("birthMonth").value, 10), y = parseInt($("birthYear").value, 10);
    if (!d || !m || !y) return null;
    return { d: d, m: m, y: y };
  }

  window.ayvinComputeSignupAge = function () {
    var b = readBirth();
    if (!b) return "";
    var a = calcAge(b.y, b.m, b.d);
    return a >= 1 && a <= 120 ? String(a) : "";
  };

  window.ayvinValidateSignupExtras = function () {
    if (!signupFile) return "یه عکس پروفایل انتخاب کن 📷";
    var b = readBirth();
    if (!b) return "روز، ماه و سال تولدت رو کامل انتخاب کن.";
    if (b.d > maxDayOf(b.m)) return "این ماه " + toFa(maxDayOf(b.m)) + " روز بیشتر نداره.";
    var a = calcAge(b.y, b.m, b.d);
    if (a < MIN_AGE || a > MAX_AGE) return "تاریخ تولد معتبر نیست.";
    if (!$("relationshipSelect").value) return "وضعیت رابطه‌ات رو انتخاب کن.";
    if (!($("bioInput") && $("bioInput").value.trim())) return "بیوگرافیت رو بنویس ✍️";
    return "";
  };

  window.ayvinResetSignupExtras = function () {
    signupFile = null;
    if (signupPreviewUrl) { try { URL.revokeObjectURL(signupPreviewUrl); } catch (e) {} signupPreviewUrl = null; }
    var btn = $("signupAvatarBtn");
    if (btn) { btn.style.backgroundImage = ""; btn.classList.remove("has-img"); }
    var hint = $("signupAvatarHint");
    if (hint) hint.style.display = "";
    ["birthDay", "birthMonth", "birthYear", "relationshipSelect", "bioInput"].forEach(function (id) { var el = $(id); if (el) el.value = ""; });
    var f = $("signupAvatarFile");
    if (f) f.value = "";
  };

  function initSignupForm() {
    fillBirthSelects();
    var btn = $("signupAvatarBtn"), file = $("signupAvatarFile");
    if (!btn || !file) return;
    btn.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      var err = $("loginError");
      if (!f) return;
      if (!/^image\//.test(f.type)) { if (err) err.textContent = "فقط فایل تصویری انتخاب کن."; file.value = ""; return; }
      if (f.size > 8 * 1024 * 1024) { if (err) err.textContent = "حجم عکس باید حداکثر ۸ مگابایت باشه."; file.value = ""; return; }
      if (err) err.textContent = "";
      signupFile = f;
      if (signupPreviewUrl) { try { URL.revokeObjectURL(signupPreviewUrl); } catch (e) {} }
      signupPreviewUrl = URL.createObjectURL(f);
      btn.style.backgroundImage = "url('" + signupPreviewUrl + "')";
      btn.classList.add("has-img");
      $("signupAvatarHint").style.display = "none";
    });
  }

  /* ---------- آپلود عکس (کوچک‌سازی قبل از آپلود) ---------- */
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

  async function uploadImage(blob, folder) {
    var uname = String(myProfile.username).replace(/[^a-zA-Z0-9_-]/g, "_");
    var path = folder + "/" + uname + "_" + Date.now() + ".jpg";
    var r = await supabaseClient.storage.from("images").upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
    if (r.error) throw r.error;
    var u = supabaseClient.storage.from("images").getPublicUrl(path);
    return u && u.data && u.data.publicUrl;
  }

  /* بعد از موفقیت app_register صدا زده می‌شود (از 07-auth.js) */
  window.ayvinApplySignupExtras = async function () {
    window.__ayvinJustRegistered = true;
    if (!myProfile || !myProfile.username) return;
    var b = readBirth();
    var extra = {};
    if (b) { extra.birth_day = b.d; extra.birth_month = b.m; extra.birth_year = b.y; }
    var rel = $("relationshipSelect") && $("relationshipSelect").value;
    if (rel) extra.relationship = rel;

    var avatar_url = null;
    if (signupFile) {
      try {
        avatar_url = await uploadImage(await resizeImage(signupFile, 640, 0.85), "avatars");
      } catch (e) {
        console.warn("signup avatar upload:", e);
        if (typeof showToast === "function") showToast("آپلود عکس ناموفق بود؛ بعداً از پروفایل عوضش کن.", { error: true });
      }
    }
    var full = Object.assign({}, extra);
    if (avatar_url) full.avatar_url = avatar_url;
    if (!Object.keys(full).length) return;

    var res = await supabaseClient.from("users").update(full).eq("username", myProfile.username);
    if (res.error) {
      console.warn("signup extras update:", res.error);
      // شاید ستون‌های جدید هنوز ساخته نشده‌اند؛ حداقل عکس را ذخیره کن
      if (avatar_url) {
        var r2 = await supabaseClient.from("users").update({ avatar_url: avatar_url }).eq("username", myProfile.username);
        if (!r2.error) myProfile.avatar_url = avatar_url;
      }
      if (typeof showToast === "function") showToast("برای ذخیره تاریخ تولد و وضعیت رابطه، فایل SQL رو در Supabase اجرا کن.", { error: true, duration: 5000 });
      return;
    }
    Object.assign(myProfile, full);
    var bioVal = $("bioInput") && $("bioInput").value.trim();
    if (bioVal) {
      try {
        var rb = await supabaseClient.from("users").update({ bio: bioVal }).eq("username", myProfile.username);
        if (!rb.error) myProfile.bio = bioVal;
      } catch (e) { console.warn("signup bio:", e); }
    }
  };

  /* ============================================================
     ۳) تایید شماره موبایل (همان اول، موقع ثبت‌نام)
     ============================================================ */
  function hideAuthScreens() {
    ["loginScreen", "otpScreen", "usernameLoginScreen", "welcomeBackScreen"].forEach(function (id) {
      var el = $(id); if (el) el.style.display = "none";
    });
  }

  function runPhoneVerify(row) {
    return new Promise(function (resolve) {
      hideAuthScreens();
      var scr = $("phoneVerifyScreen");
      var phoneEl = $("pvPhone"), codeEl = $("pvCode"), phoneStep = $("pvPhoneStep"), codeStep = $("pvCodeStep");
      var errEl = $("pvError"), infoEl = $("pvInfo"), sendBtn = $("pvSendBtn"), verifyBtn = $("pvVerifyBtn");
      var pending = null;

      phoneEl.value = (row && row.sms_phone) || (myProfile && myProfile.phone) || "";
      codeEl.value = "";
      errEl.textContent = "";
      infoEl.textContent = "برای امنیت حسابت و گرفتن پیامک پیام‌های جدید، شماره‌ات رو تایید کن.";
      phoneStep.style.display = "block";
      codeStep.style.display = "none";
      scr.style.display = "flex";

      sendBtn.onclick = async function () {
        var phone = phoneEl.value.trim();
        errEl.textContent = "";
        if (!/^09\d{9}$/.test(phone)) { errEl.textContent = "شماره باید ۱۱ رقم و با 09 شروع بشه."; return; }
        sendBtn.disabled = true;
        var old = sendBtn.textContent;
        sendBtn.textContent = "در حال ارسال...";
        try {
          var res = await fetch(SMS_SEND_OTP_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: myProfile.username, phone: phone }) });
          var result = await res.json().catch(function () { return {}; });
          if (!res.ok || !result.ok) { errEl.textContent = result.error || "ارسال کد ناموفق بود؛ دوباره امتحان کن."; return; }
          pending = phone;
          infoEl.textContent = "کد تایید به " + phone + " پیامک شد.";
          phoneStep.style.display = "none";
          codeStep.style.display = "block";
          codeEl.focus();
        } catch (e) {
          errEl.textContent = "اتصال برقرار نشد؛ دوباره امتحان کن.";
        } finally {
          sendBtn.disabled = false;
          sendBtn.textContent = old;
        }
      };

      verifyBtn.onclick = async function () {
        var code = codeEl.value.trim();
        errEl.textContent = "";
        if (!/^\d{5}$/.test(code)) { errEl.textContent = "کد ۵ رقمیه."; return; }
        verifyBtn.disabled = true;
        var old = verifyBtn.textContent;
        verifyBtn.textContent = "در حال بررسی...";
        try {
          var res = await fetch(SMS_VERIFY_OTP_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: myProfile.username, code: code }) });
          var result = await res.json().catch(function () { return {}; });
          if (!res.ok || !result.ok) { errEl.textContent = result.error || "کد اشتباهه یا منقضی شده."; return; }
          myProfile.sms_verified = true;
          scr.style.display = "none";
          if (typeof showToast === "function") showToast("شماره‌ات تایید شد ✅");
          resolve(true);
        } catch (e) {
          errEl.textContent = "اتصال برقرار نشد؛ دوباره امتحان کن.";
        } finally {
          verifyBtn.disabled = false;
          verifyBtn.textContent = old;
        }
      };

      $("pvChangeLink").onclick = function () {
        codeStep.style.display = "none";
        phoneStep.style.display = "block";
        errEl.textContent = "";
      };
      $("pvLogoutLink").onclick = function () {
        try { localStorage.removeItem(SAVED_PROFILE_KEY); } catch (e) {}
        location.reload();
      };
    });
  }

  async function ensurePhoneVerified() {
    if (!myProfile || !myProfile.username || !supabaseClient) return true;
    var row = null;
    try {
      var r = await supabaseClient.from("users").select("sms_phone,sms_verified").eq("username", myProfile.username).maybeSingle();
      if (r.error) return true;           // مشکل فنی: کاربر را قفل نکن
      row = r.data;
    } catch (e) { return true; }
    if (!row || row.sms_verified) return true;
    if (!PHONE_GATE_FOR_EXISTING_USERS && !window.__ayvinJustRegistered) return true;
    return runPhoneVerify(row);
  }

  /* ============================================================
     ۴) مشخصات کامل + پست‌ها در پروفایل
     ============================================================ */
  var renderToken = 0;

  function extraBox() {
    var el = $("profileExtra");
    if (!el) {
      el = document.createElement("div");
      el.id = "profileExtra";
      var ref = $("modalBlockReportRow");
      ref.parentNode.insertBefore(el, ref);
    }
    return el;
  }

  function infoRow(label, value) {
    var row = document.createElement("div");
    row.className = "modal-info-row";
    var a = document.createElement("span"); a.textContent = label;
    var b = document.createElement("span"); b.textContent = value;
    row.appendChild(a); row.appendChild(b);
    return row;
  }

  function openLightbox(url) {
    var img = $("lightboxImg"), ov = $("lightboxOverlay");
    if (!img || !ov) return;
    img.src = url;
    ov.classList.add("open");
  }

  async function fetchExtras(username) {
    var colsList = [
      "username,birth_day,birth_month,birth_year,relationship,posts,privacy,page_settings",
      "username,birth_day,birth_month,birth_year,relationship,posts,privacy"
    ];
    for (var i = 0; i < colsList.length; i++) {
      try {
        var r = await supabaseClient.from("users").select(colsList[i]).eq("username", username).maybeSingle();
        if (!r.error) return r.data;
      } catch (e) {}
    }
    return null;
  }

  async function deletePost(postId) {
    var r = await supabaseClient.from("users").select("posts").eq("username", myProfile.username).maybeSingle();
    var posts = (r.data && Array.isArray(r.data.posts)) ? r.data.posts : [];
    posts = posts.filter(function (p) { return p && p.id !== postId; });
    var u = await supabaseClient.from("users").update({ posts: posts }).eq("username", myProfile.username);
    if (u.error) throw u.error;
    myProfile.posts = posts;
  }

  async function uploadPostVideo(file) {
    var uname = String(myProfile.username).replace(/[^a-zA-Z0-9_-]/g, "_");
    var ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    var path = "post_" + uname + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6) + "." + ext;
    var r = await supabaseClient.storage.from("videos").upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
    if (r.error) throw r.error;
    var u = supabaseClient.storage.from("videos").getPublicUrl(path);
    return u && u.data && u.data.publicUrl;
  }

  async function addPost(text, file, video) {
    var r = await supabaseClient.from("users").select("posts").eq("username", myProfile.username).maybeSingle();
    if (r.error) throw new Error("ستون posts در جدول users ساخته نشده؛ فایل SQL رو در Supabase اجرا کن.");
    var posts = (r.data && Array.isArray(r.data.posts)) ? r.data.posts : [];
    if (posts.length >= MAX_POSTS) throw new Error("حداکثر " + toFa(MAX_POSTS) + " پست می‌تونی داشته باشی.");
    var img = null, vid = null;
    if (file) img = await uploadImage(await resizeImage(file, 1024, 0.85), "posts");
    if (video) vid = await uploadPostVideo(video);
    posts.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: text, image: img, video: vid, at: new Date().toISOString() });
    var u = await supabaseClient.from("users").update({ posts: posts }).eq("username", myProfile.username);
    if (u.error) throw u.error;
    myProfile.posts = posts;
  }

  function openPostModal() {
    var m = ensureSimpleModal("postModal", "📝 پست جدید");
    var body = m.querySelector(".sm-body");
    body.innerHTML =
      '<textarea id="postText" maxlength="300" rows="4" placeholder="چیزی که می‌خوای تو پروفایلت باشه..." ' +
      'style="width:100%;padding:12px;border-radius:13px;border:1px solid rgba(255,255,255,.09);background:var(--card2);color:var(--text);font:inherit;font-size:15px;resize:none;outline:none;margin-bottom:10px;"></textarea>' +
      '<div style="display:flex;gap:8px;">' +
      '<button type="button" class="modal-close" id="postPickImg" style="margin-top:0;">🖼️ عکس</button>' +
      '<button type="button" class="modal-close" id="postPickVid" style="margin-top:0;">🎬 ویدیو</button>' +
      '</div>' +
      '<input id="postFile" type="file" accept="image/*" style="display:none">' +
      '<input id="postVideoFile" type="file" accept="video/*" style="display:none">' +
      '<img id="postPreview" alt="" style="display:none;max-width:100%;max-height:180px;border-radius:12px;margin:10px auto 0;">' +
      '<video id="postVideoPreview" controls playsinline style="display:none;max-width:100%;max-height:200px;border-radius:12px;margin:10px auto 0;"></video>' +
      '<div class="login-error" id="postError"></div>' +
      '<button type="button" class="call-send-btn" id="postSubmit" style="margin-top:8px;">انتشار پست</button>';
    var file = null, video = null, previewUrl = null, videoUrl = null;
    var fileEl = body.querySelector("#postFile"), vidEl = body.querySelector("#postVideoFile");
    var prev = body.querySelector("#postPreview"), vprev = body.querySelector("#postVideoPreview"), err = body.querySelector("#postError");
    var maxVid = (typeof MAX_VIDEO_MB !== "undefined" && MAX_VIDEO_MB) ? MAX_VIDEO_MB : 50;
    body.querySelector("#postPickImg").onclick = function () { fileEl.click(); };
    body.querySelector("#postPickVid").onclick = function () { vidEl.click(); };
    fileEl.onchange = function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { err.textContent = "فقط فایل تصویری انتخاب کن."; return; }
      if (f.size > 8 * 1024 * 1024) { err.textContent = "حجم عکس باید حداکثر ۸ مگابایت باشه."; return; }
      err.textContent = "";
      video = null; vprev.style.display = "none"; vprev.removeAttribute("src");
      file = f;
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
      previewUrl = URL.createObjectURL(f);
      prev.src = previewUrl;
      prev.style.display = "block";
    };
    vidEl.onchange = function () {
      var f = vidEl.files && vidEl.files[0];
      if (!f) return;
      if (!/^video\//.test(f.type)) { err.textContent = "فقط فایل ویدیویی انتخاب کن."; return; }
      if (f.size > maxVid * 1024 * 1024) { err.textContent = "حجم ویدیو باید حداکثر " + toFa(maxVid) + " مگابایت باشه."; return; }
      err.textContent = "";
      file = null; prev.style.display = "none"; prev.removeAttribute("src");
      video = f;
      if (videoUrl) { try { URL.revokeObjectURL(videoUrl); } catch (e) {} }
      videoUrl = URL.createObjectURL(f);
      vprev.src = videoUrl;
      vprev.style.display = "block";
    };
    var submit = body.querySelector("#postSubmit");
    submit.onclick = async function () {
      var text = body.querySelector("#postText").value.trim();
      if (!text && !file && !video) { err.textContent = "یه متن بنویس یا عکس/ویدیو بذار."; return; }
      submit.disabled = true;
      var old = submit.textContent;
      submit.textContent = video ? "در حال آپلود ویدیو..." : "در حال انتشار...";
      err.textContent = "";
      try {
        await addPost(text, file, video);
        m.classList.remove("open");
        showToast("پست منتشر شد ✅");
        if (typeof window.ayvinPostsChanged === "function") window.ayvinPostsChanged();
        if (!(window.ayvinMyPageOpen && window.ayvinMyPageOpen())) showProfile(myProfile);
      } catch (e) {
        err.textContent = (e && e.message) || "انتشار ناموفق بود.";
      } finally {
        submit.disabled = false;
        submit.textContent = old;
      }
    };
    m.classList.add("open");
  }

  window.ayvinOpenPostModal = openPostModal;

  async function renderProfileExtras(p) {
    var box = extraBox();
    box.innerHTML = "";
    if (!p || !p.username || !supabaseClient) return;
    var token = ++renderToken;
    var own = !!(myProfile && sameUser(p.username, myProfile.username));
    var row = await fetchExtras(p.username);
    if (token !== renderToken) return;
    if (!row && own) row = myProfile;
    if (row && row.privacy && typeof row.privacy === "object") privacyCache[String(p.username).toLowerCase()] = row.privacy;

    box.appendChild(infoRow("یوزرنیم", "@" + p.username));
    try { if (typeof window.ayvinRenderFollowBox === "function") window.ayvinRenderFollowBox(box, p, own); } catch (e) { console.warn("follow box:", e); }

    if (row && row.birth_year && canSeeField(p.username, "age")) {
      var age = calcAge(row.birth_year, row.birth_month || 1, row.birth_day || 1);
      box.appendChild(infoRow("تاریخ تولد", toFa(row.birth_year) + " " + (MONTHS[(row.birth_month || 1) - 1] || "") + " " + toFa(row.birth_day || "")));
      if (age >= 1 && age <= 120 && $("modalAge")) $("modalAge").textContent = String(age);
    }
    if (row && row.relationship && canSeeField(p.username, "relationship")) {
      box.appendChild(infoRow("وضعیت رابطه", (REL_ICON[row.relationship] || "") + " " + row.relationship));
    }

    var posts = (row && Array.isArray(row.posts)) ? row.posts.slice(0, MAX_POSTS) : [];
    var canPosts = canSeeField(p.username, "posts");

    /* به‌جای نمایش پست‌ها داخل پروفایل، یک دکمه‌ی «دیدن صفحه» */
    var pageBtn = document.createElement("button");
    pageBtn.type = "button";
    pageBtn.className = "call-send-btn pf-page-btn";
    pageBtn.style.marginTop = "12px";
    pageBtn.textContent = own ? "📄 دیدن صفحه‌ی من" : ("📄 دیدن صفحه" + ((canPosts && posts.length) ? " (" + toFa(posts.length) + " پست)" : ""));
    pageBtn.onclick = function () {
      profileModal.classList.remove("open");
      if (typeof window.ayvinOpenUserPage === "function") window.ayvinOpenUserPage(p.username);
    };
    box.appendChild(pageBtn);
  }

  /* ============================================================
     ۵) صدای اعلان
     ============================================================ */
  var actx = null;
  function audioCtx() {
    if (!actx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { actx = new C(); } catch (e) { return null; }
    }
    return actx;
  }
  function unlockAudio() {
    var c = audioCtx();
    if (c && c.state === "suspended") c.resume().catch(function () {});
  }
  ["pointerdown", "touchstart", "keydown", "click"].forEach(function (ev) {
    document.addEventListener(ev, unlockAudio, { passive: true });
  });

  window.ayvinPlayBeep = function () {
    try {
      if (localStorage.getItem("ayvin_mute_sound") === "1") return;
    } catch (e) {}
    try {
      var c = audioCtx();
      if (!c) return;
      if (c.state === "suspended") c.resume().catch(function () {});
      var t = c.currentTime;
      [[880, 0], [1175, 0.15]].forEach(function (n) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = "sine";
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t + n[1]);
        g.gain.exponentialRampToValueAtTime(0.28, t + n[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.24);
        o.connect(g);
        g.connect(c.destination);
        o.start(t + n[1]);
        o.stop(t + n[1] + 0.27);
      });
    } catch (e) {}
  };

  /* پیام تازه‌ای رسید که گفتگوش الان باز نیست */
  window.ayvinIncoming = function (type, id) {
    try {
      if (id == null) return;
      if (typeof isConvOpen === "function" && isConvOpen(type, id)) return;
      if (typeof isMutedConv === "function" && isMutedConv(type, id)) return;
      window.ayvinPlayBeep();
    } catch (e) {}
  };

  /* وقتی push رسید و برنامه باز است، سرویس‌ورکر خبر می‌دهد */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "ayvin-push" && document.visibilityState === "visible") window.ayvinPlayBeep();
    });
  }

  /* ============================================================
     اتصال به بقیه‌ی برنامه
     ============================================================ */
  // ورود به صفحه‌ی اصلی بعد از تایید شماره
  var _origProceed = window.proceedJoin;
  if (typeof _origProceed === "function") {
    window.proceedJoin = async function (opts) {
      var ok = true;
      try { ok = await ensurePhoneVerified(); } catch (e) { console.warn(e); }
      if (!ok) return;
      return _origProceed.call(this, opts);
    };
  }

  // نمایش مشخصات کامل و پست‌ها
  var _origShowProfile = window.showProfile;
  if (typeof _origShowProfile === "function") {
    window.showProfile = function (p) {
      var res = _origShowProfile.apply(this, arguments);
      try { renderProfileExtras(p); } catch (e) { console.warn(e); }
      return res;
    };
  }

  function boot() {
    initSignupForm();
    showWelcome();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
