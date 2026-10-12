/* PETAQU — KONVERSI VIDEO DI BROWSER (PQVidConv): WebM → MP4 (H.264/AAC), MP4 ringan 480p, GIF, WebM bisa digeser.
   Memakai ffmpeg.wasm (single-thread, tanpa SharedArrayBuffer/COOP-COEP) yang DIMUAT HANYA SAAT DIPERLUKAN (±31 MB, lalu di-cache
   service worker). Semua diproses di perangkat — video tidak dikirim ke server mana pun.
     PQVidConv.run(blob, { to: "mp4"|"mp4s"|"gif"|"webm", dur: detik, onStatus: fn(teks, 0..1) }) → Promise<{ blob, ext, type }>
     PQVidConv.cancel()   — batalkan proses berjalan (mesin dimuat ulang saat dipakai lagi)
   Base URL dapat diganti untuk uji/offline: window.PQ_FFMPEG_BASE = { ff: "…/umd", core: "…/umd" }. */
(function () {
  "use strict";
  if (window.PQVidConv) return;
  var CDN = { ff: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd", core: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm" };
  var inst = null, loading = null, queue = Promise.resolve(), gen = 0, MAXMB = 200;
  function base() { return window.PQ_FFMPEG_BASE || CDN; }
  function loadScript(u) {
    return new Promise(function (res, rej) {
      if (window.FFmpegWASM) return res();
      var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { rej(new Error("gagal memuat pustaka konversi (periksa internet)")); }; document.head.appendChild(s);
    });
  }
  async function blobURL(u, type, st, label) {
    var r = await fetch(u); if (!r.ok) throw new Error("gagal mengunduh " + label + " (HTTP " + r.status + ")");
    var total = +r.headers.get("content-length") || 0, rd = r.body && r.body.getReader, parts = [], got = 0;
    if (rd) { var R = r.body.getReader(); for (;;) { var x = await R.read(); if (x.done) break; parts.push(x.value); got += x.value.length; if (total && st) st("Mengunduh mesin konversi… " + Math.round(got * 100 / total) + "% (sekali saja)", 0); } }
    else parts.push(new Uint8Array(await r.arrayBuffer()));
    return URL.createObjectURL(new Blob(parts, { type: type }));
  }
  async function load(st) {
    if (inst) return inst; if (loading) return loading;
    loading = (async function () {
      var b = base(); await loadScript(b.ff + "/ffmpeg.js");
      var F = new window.FFmpegWASM.FFmpeg(); st("Mengunduh mesin konversi (±31 MB, sekali saja)…", 0);
      var core = await blobURL(b.core + "/ffmpeg-core.wasm", "application/wasm", st, "mesin"), js = await blobURL(b.core + "/ffmpeg-core.js", "text/javascript", null, "mesin"), wk = await blobURL(b.ff + "/814.ffmpeg.js", "text/javascript", null, "worker");
      await F.load({ coreURL: js, wasmURL: core, classWorkerURL: wk }); inst = F; return F;
    })();
    loading.catch(function () { loading = null; });
    return loading;
  }
  function args(to, inName, outName, dur) {
    var v = "scale=-2:'min(%H,ih)'";
    if (to === "gif") return ["-i", inName, "-t", "20", "-an", "-vf", "fps=10,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", outName];
    if (to === "webm") return ["-i", inName, "-c", "copy", outName];
    var h = to === "mp4s" ? 480 : 720;
    return ["-i", inName, "-vf", v.replace("%H", h), "-c:v", "libx264", "-preset", "ultrafast", "-crf", to === "mp4s" ? "30" : "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", outName];
  }
  var EXT = { mp4: "mp4", mp4s: "mp4", gif: "gif", webm: "webm" }, MIME = { mp4: "video/mp4", mp4s: "video/mp4", gif: "image/gif", webm: "video/webm" };
  function run(blob, o) {
    o = o || {}; var st = o.onStatus || function () {}, to = o.to || "mp4";
    var job = queue.then(async function () {
      if (blob.size > MAXMB * 1048576) throw new Error("video terlalu besar untuk dikonversi di browser (" + Math.round(blob.size / 1048576) + " MB; maks " + MAXMB + " MB)");
      var my = gen, F = await load(st); if (my !== gen) throw new Error("dibatalkan");
      var inExt = /mp4/.test(blob.type) ? "mp4" : "webm", inName = "in." + inExt, outName = "out." + EXT[to], dur = o.dur > 0 ? o.dur : 0;
      if (to === "gif" && dur) dur = Math.min(dur, 20);
      var onLog = function (e) { var m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(e.message || ""); if (m && dur) { var s = +m[1] * 3600 + +m[2] * 60 + +m[3]; st("Mengonversi… " + Math.min(99, Math.round(s * 100 / dur)) + "%", Math.min(0.99, s / dur)); } };
      F.on("log", onLog); st("Mengonversi…", 0);
      try {
        await F.writeFile(inName, new Uint8Array(await blob.arrayBuffer()));
        var rc = await F.exec(args(to, inName, outName, dur));
        if (my !== gen) throw new Error("dibatalkan");
        if (rc !== 0) throw new Error("konversi gagal (kode " + rc + ")");
        var data = await F.readFile(outName); if (!data || !data.length) throw new Error("hasil konversi kosong");
        st("Selesai", 1);
        return { blob: new Blob([data.buffer || data], { type: MIME[to] }), ext: EXT[to], type: MIME[to] };
      } finally {
        try { F.off("log", onLog); } catch (e) {}
        try { await F.deleteFile(inName); } catch (e) {} try { await F.deleteFile(outName); } catch (e) {}
      }
    });
    queue = job.catch(function () {});
    return job;
  }
  function cancel() { gen++; var F = inst; inst = null; loading = null; try { F && F.terminate(); } catch (e) {} }
  window.PQVidConv = { run: run, cancel: cancel, version: 1 };
})();
