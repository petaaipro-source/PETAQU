import { buatQRIS, db, json, cors } from "../_shared/midtrans.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  try {
    const { email, bulan } = await req.json();
    const sb = db();
    const { data: o, error } = await sb.rpc("qris_siapkan_order", { p_email: email, p_bulan: Number(bulan) });
    if (error || !o) return json(req, { ok: false, reason: "gateway" }, 500);
    if (!o.ok || !o.baru) return json(req, o); // gagal validasi, atau QR lama dipakai ulang
    try {
      const q = await buatQRIS(o.order_id, o.jumlah);
      await sb.rpc("qris_simpan_qr", { p_order_id: o.order_id, p_ref: q.ref, p_qr_string: q.qr_string, p_qr_url: q.qr_url, p_kedaluwarsa: q.kedaluwarsa });
      return json(req, { ok: true, order_id: o.order_id, jumlah: o.jumlah, bulan: o.bulan, diskon: o.diskon, qr_string: q.qr_string, qr_url: q.qr_url, kedaluwarsa: q.kedaluwarsa });
    } catch (e) {
      await sb.rpc("qris_batal_order", { p_order_id: o.order_id, p_catatan: String(e).slice(0, 150) });
      return json(req, { ok: false, reason: "gateway" }, 502);
    }
  } catch (_e) {
    return json(req, { ok: false, reason: "gateway" }, 400);
  }
});
