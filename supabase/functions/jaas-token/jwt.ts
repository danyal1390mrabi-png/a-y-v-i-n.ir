// امضای JWT با RS256 فقط با Web Crypto (بدون وابستگی خارجی).
const enc = new TextEncoder();

function b64u(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function derLen(n: number): number[] {
  if (n < 128) return [n];
  if (n < 256) return [0x81, n];
  return [0x82, (n >> 8) & 255, n & 255];
}

// کلید PKCS#1 («BEGIN RSA PRIVATE KEY») را به PKCS#8 تبدیل می‌کند تا Web Crypto بپذیرد.
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...derLen(pkcs1.length)];
  const inner = [0x02, 0x01, 0x00, ...algo, ...octet];
  const total = inner.length + pkcs1.length;
  return new Uint8Array([0x30, ...derLen(total), ...inner, ...pkcs1]);
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const text = pem.replace(/\\n/g, "\n");
  const isPkcs1 = text.includes("BEGIN RSA PRIVATE KEY");
  const body = text.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  let der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  if (isPkcs1) der = pkcs1ToPkcs8(der);
  return await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

export async function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, key: CryptoKey): Promise<string> {
  const data = b64u(JSON.stringify(header)) + "." + b64u(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(data)));
  return data + "." + b64u(sig);
}
