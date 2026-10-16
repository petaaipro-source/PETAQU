// Dipanggil Midtrans begitu uang masuk. Tanda tangan diverifikasi, lalu status dicek ulang ke Midtrans (webhook palsu tak berguna).
import { cekStatus, db, terapkanStatus, verifikasiSignature } from "../_shared/midtrans.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const n = await req.json();
    if (!(await verifikasiSignature(n))) return new Response("signature salah", { status: 401 });
    const s = await cekStatus(String(n.order_id));
    if (s && s.order_id) await terapkanStatus(db(), s);
    return new Response("ok");
  } catch (_e) {
    return new Response("error", { status: 500 }); // Midtrans akan mengulang kiriman
  }
});
