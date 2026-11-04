// ============================================================
// push-notify — ارسال اعلان وب (Web Push) برای پیام خصوصی جدید
// ------------------------------------------------------------
// راه‌اندازی:
//  1) Secrets (Supabase → Edge Functions → Secrets):
//       VAPID_PUBLIC_KEY   = همان کلیدی که در js/10-backend-bridge.js (VAPID_PUBLIC_KEY) است
//       VAPID_PRIVATE_KEY  = کلید خصوصیِ جفت همان کلید
//       VAPID_SUBJECT      = mailto:you@example.com
//  2) Deploy:  supabase functions deploy push-notify --no-verify-jwt
//  3) Database Webhook: جدول private_messages، رویداد INSERT، آدرس تابع push-notify
//
// رفتار: اگر گیرنده «آنلاین» باشد (last_seen_at کمتر از ۴۵ ثانیه) اعلان نمی‌رود.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@ayvin.ir",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const ONLINE_WINDOW_MS = 45_000;

function preview(m: Record<string, unknown>): string {
  if (m.deleted) return "پیام حذف شد";
  if (m.image_path) return "🖼 عکس";
  if (m.video_path) return "🎬 ویدیو";
  if (m.audio_path) return "🎤 پیام صوتی";
  if (m.file_path) return "📎 " + (m.file_name || "فایل");
  const t = String(m.text || "").replace(/\s+/g, " ").trim();
  return (t || "پیام جدید").slice(0, 100);
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const m = payload?.record;
    if (!m || payload?.type !== "INSERT") return new Response("ignored");

    const sender = String(m.sender_username || "");
    const receiver = String(m.receiver_username || "");
    if (!sender || !receiver || sender === receiver) return new Response("ignored");
    if (sender.startsWith("bot-") || receiver.startsWith("bot-")) return new Response("ignored");

    // گیرنده آنلاین است؟
    const { data: u } = await supabase
      .from("users").select("last_seen_at").eq("username", receiver).maybeSingle();
    if (u?.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < ONLINE_WINDOW_MS) {
      return new Response("online");
    }

    const { data: subs } = await supabase
      .from("push_subscriptions").select("endpoint,p256dh,auth").eq("username", receiver);
    if (!subs?.length) return new Response("no subs");

    const body = JSON.stringify({
      title: String(m.sender_name || sender),
      body: preview(m),
      data: { type: "dmUser", id: sender },
    });

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600, urgency: "high" },
        );
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }));
    return new Response("sent");
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
