// Edge Function: JWT برای JaaS (Jitsi as a Service) + مدیریت سهمیه‌ی رایگان (MAU).
// دیپلوی:  supabase functions deploy jaas-token --no-verify-jwt
//
// - action "check": فقط می‌پرسد کاربر مجاز است یا نه؛ هیچ سهمیه‌ای مصرف نمی‌کند (ساخت اتاق/ارسال دعوت).
// - بدون action:   ورود واقعی به تماس. اگر کاربر در این ماه شمرده نشده باشد، یک جای MAU می‌گیرد و توکن می‌دهد.
// سقف امن داخلی: JAAS_SAFE_MAU_LIMIT (پیش‌فرض ۲۰، پایین‌تر از ۲۵ واقعی پلن رایگان).
import { importPrivateKey, signJwt } from "./jwt.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SAFE_LIMIT = (() => {
  const n = parseInt(Deno.env.get("JAAS_SAFE_MAU_LIMIT") || "", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
})();

// شمارش/بررسی سهمیه در دیتابیس (تابع claim_call_slot؛ اتمی و فقط با service role قابل‌اجرا).
async function claimSlot(username: string, consume: boolean): Promise<{ allowed: boolean; reason: string }> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("no-service-key");
  const res = await fetch(url + "/rest/v1/rpc/claim_call_slot", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: "Bearer " + key },
    body: JSON.stringify({ p_username: username, p_limit: SAFE_LIMIT, p_consume: consume }),
  });
  if (!res.ok) throw new Error("rpc-" + res.status);
  const d = await res.json();
  return { allowed: !!d.allowed, reason: String(d.reason || "") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const kid = (Deno.env.get("JAAS_KEY_ID") || "").trim();
  const pem = Deno.env.get("JAAS_PRIVATE_KEY") || "";
  // AppID همان بخش قبل از «/» در Key ID است؛ اگر JAAS_APP_ID تنظیم شده باشد از آن استفاده می‌شود.
  const appId = (Deno.env.get("JAAS_APP_ID") || "").trim() || kid.split("/")[0];
  if (!appId || !kid || !pem) return json({ error: "not-configured" }, 500);

  let body: { action?: string; room?: string; name?: string; username?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "bad-json" }, 400); }

  const username = String(body.username || "").trim().slice(0, 60);
  const checkOnly = body.action === "check";

  // سهمیه: قبل از هر کار دیگری. خطا در بررسی = رد کردن (سهمیه هرگز به‌طور ناخواسته مصرف نشود).
  let slot: { allowed: boolean; reason: string };
  try { slot = await claimSlot(username, !checkOnly); } catch { return json({ error: "quota-check-failed" }, 503); }
  if (!slot.allowed) {
    return json({ error: slot.reason === "quota_reached" ? "quota-reached" : "unknown-user" }, 403);
  }
  if (checkOnly) return json({ allowed: true });

  const room = String(body.room || "");
  const esc = appId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp("^" + esc + "/[A-Za-z0-9_-]{6,64}$").test(room)) return json({ error: "bad-room" }, 400);

  const name = String(body.name || "User").trim().slice(0, 60) || "User";

  try {
    const key = await importPrivateKey(pem);
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      { alg: "RS256", typ: "JWT", kid },
      {
        aud: "jitsi",
        iss: "chat",
        sub: appId,
        room: "*",
        iat: now,
        nbf: now - 10,
        exp: now + 2 * 60 * 60,
        context: {
          user: { id: username || name, name, avatar: "", email: "", moderator: "false" },
          features: { livestreaming: "false", recording: "false", transcription: "false", "outbound-call": "false" },
        },
      },
      key,
    );
    return json({ token });
  } catch (_e) {
    return json({ error: "sign-failed" }, 500);
  }
});
