/* تنظیمات پنل تماس گوگل میت — همه‌ی مقادیر قابل تغییر اینجاست، چیزی داخل کد هاردکد نشده. */
window.MEET_PANEL_CONFIG = {
  // خاموش/روشن کردن کل پنل. با false رفتار برنامه دقیقاً مثل قبل می‌شود.
  enabled: true,
  // لینکی که به‌عنوان «تماس میت» شناخته می‌شود (گروه اول = کد جلسه).
  linkPattern: "^https://meet\\.google\\.com/([a-z0-9-]+)",
  // این مسیرها جلسه‌ی واقعی نیستند و پنل برایشان باز نمی‌شود.
  ignoredCodes: ["new", "landing"],
  // با کلیک روی هر لینک میت داخل چت، پنل هم باز شود (لینک مثل قبل در تب جدید باز می‌شود).
  openLinksInPanel: true,
  // حالت اولیه‌ی پنل: "normal" | "max" | "min"
  defaultState: "normal",
  // نقطه‌ی اتصال برای نمایش خود تماس داخل پنل.
  // فعلاً null است چون Meet Embed SDK Web در مستندات رسمی فعلی گوگل تأیید نشده.
  // اگر بعداً تأیید شد: تابعی بگذار با امضای ({container, url, code, label}) که داخل container
  // رندر کند و در صورت نیاز تابع پاک‌سازی برگرداند.
  embedProvider: null,
  // تماس داخل برنامه با Jitsi (iframe API رسمی). جدا از گوگل میت و بدون تغییر جریان میت.
  jitsi: {
    enabled: true,
    // دامنه‌ی سرور. توجه: embed روی meet.jit.si طبق اعلام رسمی Jitsi بعد از ۵ دقیقه قطع می‌شود
    // (فقط برای آزمایش). برای استفاده‌ی واقعی: یا jaas.appId را پر کن (پایین)، یا دامنه‌ی سرور خودت را اینجا بگذار.
    domain: "meet.jit.si",
    // JaaS = سرویس رسمی Jitsi (8x8) برای embed، رایگان تا ۲۵ کاربر فعال ماهانه، بدون محدودیت ۵ دقیقه.
    // فقط appId را (مثل vpaas-magic-cookie-xxxx) بگذار؛ بقیه‌ی تنظیمات خودکار می‌شود.
    // راه‌اندازی توکن: supabase/functions/jaas-token و فایل JITSI-SETUP.md
    jaas: { appId: "vpaas-magic-cookie-ae725115329a4c11817c5e2718412ff4", tokenFunction: "jaas-token" },
    // پیشوند نام اتاق. برای JaaS باید "<AppID>/" باشد.
    roomNamePrefix: "ayvin-",
    // اختیاری: async function(roomName) که توکن JWT برمی‌گرداند (برای JaaS یا سرور خودت).
    getJwt: null,
    // حالت اولیه‌ی پنل هنگام تماس: "normal" | "max"
    defaultState: "max",
    // زبان رابط Jitsi
    lang: "fa"
  },
  strings: {
    panelLabel: "پنل تماس گوگل میت",
    title: "تماس گوگل میت",
    fallbackTitle: "تماس در جریان است",
    fallbackDesc: "گوگل میت امکان نمایش تماس داخل برنامه را ندارد، پس تماس در تب جدید باز می‌شود. این پنل را کوچک کن و به چت برگرد؛ هر وقت خواستی از همین‌جا دوباره وارد شو.",
    join: "ورود به تماس",
    copy: "کپی لینک",
    copied: "لینک کپی شد",
    copyFailed: "کپی نشد، لینک را دستی انتخاب کن",
    back: "بازگشت به چت",
    minimize: "کوچک کردن",
    maximize: "بزرگ کردن",
    restore: "اندازه‌ی عادی",
    close: "بستن پنل",
    expand: "باز کردن پنل تماس",
    loading: "در حال آماده‌سازی تماس…",
    jitsiTitle: "تماس داخل برنامه",
    jitsiButton: "تماس داخل برنامه",
    jitsiInvite: "📹 دعوت به تماس داخل برنامه",
    jitsiFallbackTitle: "نمایش داخل برنامه ممکن نشد",
    jitsiFallbackDesc: "می‌توانی همین تماس را در تب جدید باز کنی.",
    jitsiJoinNewTab: "باز کردن در تب جدید",
    jitsiNeedChat: "اول یک گفتگوی شخصی یا گروه را باز کن.",
    jitsiSendFailed: "ارسال دعوت ناموفق بود.",
    jitsiPublicNotice: "سرور عمومی Jitsi برای آزمایش است و تماس بعد از ۵ دقیقه قطع می‌شود.",
    quotaReached: "Your free call capacity has been reached.",
    embedFailed: "نمایش داخل برنامه ممکن نشد؛ تماس در تب جدید باز می‌شود."
  }
};
