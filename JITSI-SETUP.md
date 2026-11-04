# راه‌اندازی تماس Jitsi (بدون محدودیت ۵ دقیقه)

سرور عمومی meet.jit.si برای embed بعد از ۵ دقیقه تماس را قطع می‌کند. راه رسمی و ساده: **JaaS** (رایگان تا ۲۵ کاربر فعال ماهانه).

## ۱) ساخت حساب JaaS
1. در https://jaas.8x8.vc ثبت‌نام کن.
2. از بخش **API Keys** یک کلید بساز و فایل private key را دانلود کن.
3. این سه مقدار را یادداشت کن:
   - **AppID** (شبیه `vpaas-magic-cookie-xxxxxxxx`)
   - **Key ID** (همان که کنار کلید نوشته شده، به شکل `vpaas-magic-cookie-xxxx/yyyy`)
   - محتوای فایل private key

## ۲) دیپلوی تابع توکن روی Supabase
```bash
supabase secrets set JAAS_APP_ID="vpaas-magic-cookie-xxxx"
supabase secrets set JAAS_KEY_ID="vpaas-magic-cookie-xxxx/yyyy"
supabase secrets set JAAS_PRIVATE_KEY="$(cat jaas-private-key.pem)"
supabase functions deploy jaas-token --no-verify-jwt
```

## ۳) فعال‌سازی در سایت
در `js/meet-config.js` فقط این را پر کن:
```js
jaas: { appId: "vpaas-magic-cookie-xxxx", tokenFunction: "jaas-token" },
```
بعد فایل‌ها را آپلود کن (نسخه‌ی کش service worker به v8 رفته، پس خودکار آپدیت می‌شود).

## نکته‌ها
- تا وقتی `appId` خالی است، همه‌چیز مثل قبل با meet.jit.si کار می‌کند (با همان محدودیت ۵ دقیقه).
- در JaaS لینک اتاق بدون توکن در تب مرورگر باز نمی‌شود؛ تماس فقط از داخل آیوین (پنل) کار می‌کند.
- تابع توکن به حساب کاربری آیوین وصل نیست (احراز هویت سوپابیس ندارید)؛ هر کس آدرس تابع را بداند می‌تواند توکن بگیرد و از سهمیه‌ی ۲۵ نفر مصرف کند.

## مدیریت سهمیه‌ی رایگان (MAU)
- جدول `call_mau_usage` (ماه UTC + username) و تابع `claim_call_slot` در سوپابیس؛ فقط با service role قابل‌دسترس‌اند.
- ساخت اتاق / ارسال دعوت سهمیه مصرف نمی‌کند (فقط `action:"check"`)؛ فقط ورود واقعی (گرفتن توکن) کاربر را برای آن ماه یک‌بار می‌شمارد.
- سقف امن داخلی ۲۰ است (واقعی ۲۵). تغییر: secret با نام `JAAS_SAFE_MAU_LIMIT`.
- ماه جدید = کلید ماه جدید، پس شمارنده خودکار از صفر شروع می‌شود.
- پر بودن ظرفیت: کاربر جدید پیام «Your free call capacity has been reached.» می‌بیند؛ کاربران شمرده‌شده‌ی همان ماه مثل قبل ادامه می‌دهند.
- مشاهده‌ی مصرف: `select month, count(*) from call_mau_usage group by month;`
