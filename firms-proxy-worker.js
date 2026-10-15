/* OPSIONAL — Proxy CORS untuk NASA FIRMS & GDACS (Cloudflare Workers, gratis).
   Pakai HANYA jika di tab "Satelit" panel Bencana, sumber titik panas bertanda "diblokir CORS".
   Deploy worker ini, lalu isi kolom "URL proxy" dengan:  https://NAMA.workers.dev/?u=
   (PETAQU otomatis menambahkan alamat tujuan setelah "?u="). Hanya host di daftar ALLOW yang diteruskan. */
const ALLOW_HOSTS = ["firms.modaps.eosdis.nasa.gov", "www.gdacs.org"];
const ORIGIN = "*"; /* ganti dengan domain Anda bila perlu */
export default {
  async fetch(req) {
    const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods": "GET", "Vary": "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    let u; try { u = new URL(new URL(req.url).searchParams.get("u")); } catch (e) { return new Response("u tidak valid", { status: 400, headers: cors }); }
    if (u.protocol !== "https:" || !ALLOW_HOSTS.includes(u.hostname)) return new Response("host tidak diizinkan", { status: 403, headers: cors });
    const r = await fetch(u.toString(), { cf: { cacheTtl: 600, cacheEverything: true } });
    return new Response(r.body, { status: r.status, headers: { ...cors, "content-type": r.headers.get("content-type") || "text/plain", "Cache-Control": "public, max-age=600" } });
  }
};
