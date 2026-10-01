/* Deteksi kerusakan jalan (YOLOv8 ONNX) di browser. Butuh model Anda sendiri:
   window.PETAQU_MODEL = {url:'models/jalan.onnx', classes:['lubang','retak_buaya','retak_memanjang','tambalan'], size:640, conf:0.35}
   Pakai: await PETAQU_DETECT.run(videoOrImgOrCanvas) -> [{cls,score,box:[x,y,w,h]}]; hasil + GPS disimpan di localStorage 'pq_detections'. */
(function () {
  'use strict';
  let sess = null;
  async function load() {
    if (sess) return sess; const M = window.PETAQU_MODEL; if (!M || !M.url) throw new Error('PETAQU_MODEL belum diatur');
    if (!window.ort) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js'; s.onload = ok; s.onerror = () => no(new Error('ONNX Runtime gagal dimuat')); document.head.append(s); });
    sess = await ort.InferenceSession.create(M.url, { executionProviders: ['webgpu', 'wasm'] }); return sess;
  }
  const iou = (a, b) => { const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]), i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1); return i / (a[2] * a[3] + b[2] * b[3] - i || 1); };
  async function run(src, opt) {
    const M = window.PETAQU_MODEL, S = M.size || 640, s = await load();
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    const sc = Math.min(S / w, S / h), nw = Math.round(w * sc), nh = Math.round(h * sc), dx = (S - nw) >> 1, dy = (S - nh) >> 1;
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.fillStyle = '#727272'; g.fillRect(0, 0, S, S); g.drawImage(src, dx, dy, nw, nh);
    const d = g.getImageData(0, 0, S, S).data, f = new Float32Array(3 * S * S);
    for (let i = 0; i < S * S; i++) { f[i] = d[i * 4] / 255; f[S * S + i] = d[i * 4 + 1] / 255; f[2 * S * S + i] = d[i * 4 + 2] / 255; }
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, S, S]) }), o = out[s.outputNames[0]], nc = M.classes.length, N = o.dims[2], p = o.data, c = [];
    for (let i = 0; i < N; i++) {          // keluaran YOLOv8: [1, 4+nc, N]
      let best = 0, bc = -1; for (let k = 0; k < nc; k++) { const v = p[(4 + k) * N + i]; if (v > best) { best = v; bc = k; } }
      if (best < (M.conf || .35)) continue;
      const cx = p[i], cy = p[N + i], bw = p[2 * N + i], bh = p[3 * N + i];
      c.push({ cls: M.classes[bc], score: best, box: [(cx - bw / 2 - dx) / sc, (cy - bh / 2 - dy) / sc, bw / sc, bh / sc] });
    }
    c.sort((a, b) => b.score - a.score); const keep = [];
    for (const x of c) if (keep.every(k => k.cls !== x.cls || iou(k.box, x.box) < .5)) keep.push(x);   // NMS
    if (keep.length && !(opt && opt.noTag)) tag(keep); return keep;
  }
  function tag(dets) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => { const a = JSON.parse(localStorage.getItem('pq_detections') || '[]'); dets.forEach(d => a.push({ t: Date.now(), lat: p.coords.latitude, lng: p.coords.longitude, cls: d.cls, score: +d.score.toFixed(2) })); localStorage.setItem('pq_detections', JSON.stringify(a.slice(-5000))); window.PETAQU && PETAQU.enqueue && PETAQU.enqueue({ type: 'deteksi', dets: dets.map(d => ({ cls: d.cls, score: d.score })), lat: p.coords.latitude, lng: p.coords.longitude }); }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
  }
  window.PETAQU_DETECT = { run, load, list: () => JSON.parse(localStorage.getItem('pq_detections') || '[]') };
})();
