// Pembantu Midtrans (QRIS) + Supabase untuk Edge Function PETAQU.
// Ganti gateway lain: cukup ubah buatQRIS / cekStatus / verifikasiSignature di file ini.
import { createClient } from "npm:@supabase/supabase-js@2";

const PROD = (Deno.env.get("MIDTRANS_ENV") || "sandbox").toLowerCase() === "production";
const BASE = PROD ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
const KEY = Deno.env.get("MIDTRANS_SERVER_KEY") || "";
const AUTH = "Basic " + btoa(KEY + ":");

export const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://petaqu.my.id").split(",").map((s) => s.trim());
export function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  const ok = !o || ORIGINS.includes(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return {
    "Access-Control-Allow-Origin": ok && o ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// Midtrans memakai waktu WIB "YYYY-MM-DD HH:mm:ss"
export const wibKeISO = (s?: string) => (s ? new Date(s.replace(" ", "T") + "+07:00").toISOString() : null);

export async function buatQRIS(orderId: string, jumlah: number) {
  const r = await fetch(BASE + "/v2/charge", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: { order_id: orderId, gross_amount: jumlah },
      qris: { acquirer: "gopay" },
      custom_expiry: { expiry_duration: 15, unit: "minute" },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !["200", "201"].includes(String(j.status_code))) throw new Error("midtrans " + r.status + " " + (j.status_message || ""));
  const url = (j.actions || []).find((a: any) => a.name === "generate-qr-code")?.url || null;
  return { ref: j.transaction_id as string, qr_string: j.qr_string as string, qr_url: url as string | null, kedaluwarsa: wibKeISO(j.expiry_time) };
}

export async function cekStatus(orderId: string) {
  const r = await fetch(BASE + "/v2/" + encodeURIComponent(orderId) + "/status", { headers: { Authorization: AUTH, Accept: "application/json" } });
  return await r.json().catch(() => ({}));
}

async function sha512(s: string) {
  const b = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function verifikasiSignature(n: any) {
  if (!n || !n.signature_key) return false;
  return (await sha512(String(n.order_id) + String(n.status_code) + String(n.gross_amount) + KEY)) === String(n.signature_key).toLowerCase();
}

// Terapkan hasil status Midtrans ke database (idempoten). Mengembalikan status order.
export async function terapkanStatus(sb: ReturnType<typeof db>, s: any) {
  const id = String(s.order_id || "");
  if (!id.startsWith("PQ-")) return { ok: false };
  const ts = s.transaction_status, fraud = s.fraud_status;
  if ((ts === "settlement" || ts === "capture") && (!fraud || fraud === "accept")) {
    const jumlah = Math.round(parseFloat(s.gross_amount)); // "99900.00" -> 99900
    const { data } = await sb.rpc("qris_tandai_dibayar", { p_order_id: id, p_jumlah: jumlah, p_ref: s.transaction_id || null });
    return data;
  }
  if (["expire", "cancel", "deny", "failure"].includes(ts)) await sb.rpc("qris_tandai_gagal", { p_order_id: id, p_status: ts });
  return { ok: true, status: ts };
}
