// Cadangan webhook: layar bayar menanyakan status ±9 detik; server bertanya langsung ke Midtrans lalu mengaktifkan akun.
import { cekStatus, db, json, cors, terapkanStatus } from "../_shared/midtrans.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  try {
    const { order_id } = await req.json();
    const sb = db();
    const { data: cur } = await sb.rpc("qris_status", { p_order_id: String(order_id || "") });
    if (!cur || cur.status !== "pending") return json(req, cur || { status: "tidak_ada" });
    const s = await cekStatus(String(order_id));
    if (s && s.order_id) await terapkanStatus(sb, s);
    const { data } = await sb.rpc("qris_status", { p_order_id: String(order_id) });
    return json(req, data || { status: "pending" });
  } catch (_e) {
    return json(req, { status: "pending" });
  }
});
