/* OPSIONAL — Proxy CORS untuk API BMKG (Cloudflare Workers, gratis). Pakai HANYA jika di panel cuaca muncul
   "BMKG: Failed to fetch (kemungkinan diblokir CORS)". Lihat PANDUAN-CUACA.md.
   Meneruskan ?adm4=KODE ke api.bmkg.go.id, menyimpan cache 15 menit (hemat kuota BMKG 60 req/menit/IP), menambah header CORS. */
const ALLOW = "*"; /* ganti dengan domain Anda, mis. "https://petaqu.example.com" */
export default {
  async fetch(req, env, ctx) {
    const cors = { "Access-Control-Allow-Origin": ALLOW, "Access-Control-Allow-Methods": "GET", "Vary": "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const adm4 = new URL(req.url).searchParams.get("adm4") || "";
    if (!/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(adm4)) return new Response('{"error":"adm4 tidak valid"}', { status: 400, headers: { ...cors, "content-type": "application/json" } });
    const up = "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=" + adm4;
    const r = await fetch(up, { cf: { cacheTtl: 900, cacheEverything: true } });
    return new Response(r.body, { status: r.status, headers: { ...cors, "content-type": "application/json", "Cache-Control": "public, max-age=900" } });
  }
};
