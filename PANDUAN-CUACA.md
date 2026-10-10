# Cuaca Indonesia (BMKG) di PETAQU

**Cara pakai:** buka tombol folder → **Cuaca Indonesia** → *Cuaca klik-peta (BMKG)* (ON) → ketuk titik mana saja di peta.
Muncul animasi cuaca di titik itu + panel (suhu, angin, hujan, timeline 3 hari, dampak ke pekerjaan jalan).
Tombol **Putar** menjalankan animasi 3 hari ke depan; geser garis waktu untuk melompat. **Esc** menutup. *Cuaca di lokasi saya* memakai GPS.

## Cara kerja
1. Klik → `data-adm4.js` (83.377 desa/kelurahan, dimuat sekali saat pertama dipakai, 0,95 MB) mencari **desa terdekat** → kode adm4.
2. Kode itu dikirim ke **BMKG** `api.bmkg.go.id/publik/prakiraan-cuaca?adm4=KODE` (prakiraan 3 hari, per 3 jam).
3. Bila BMKG tidak terjangkau (CORS/offline/laut/luar Indonesia) otomatis **Open-Meteo**. Lencana di panel selalu menyebut sumber sebenarnya.

## Penting: cek apakah BMKG bisa dipanggil langsung dari browser
Saya tidak dapat menguji domain BMKG dari lingkungan saya. Setelah di-deploy, klik satu titik di Indonesia:
- Lencana hijau **BMKG · desa xx.xx.xx.xxxx** → langsung bekerja, tidak perlu apa-apa.
- Lencana kuning **OPEN-METEO** dan footer menyebut "diblokir CORS" → pasang proxy di bawah.

### Proxy opsional (±5 menit)
1. dash.cloudflare.com → Workers → Create → tempel isi `bmkg-proxy-worker.js` → Deploy.
2. Salin URL Worker (mis. `https://bmkg.namaanda.workers.dev`).
3. Di console browser sekali saja: `localStorage.setItem("petaqu_cuaca_proxy","https://bmkg.namaanda.workers.dev")`
   (atau tambahkan `cuacaProxy:"..."` pada `PETAQU_CFG`).

## Perbarui indeks desa
`python3 tools/build-adm4.py` (butuh internet, 1–3 menit) → menimpa `data-adm4.js`.

## Penilaian dampak pekerjaan (aturan praktis, bukan standar resmi)
Aspal: tunda saat hujan/permukaan basah. Beton: tunda bila hujan ≥0,5 mm. Drone: angin hembusan×1,3 > 10 m/s waspada, > 13 tunda; jarak pandang < 3 km waspada. Risiko genangan memakai kelas hujan harian BMKG (20/50/100/150 mm). Sesuaikan di fungsi `judge()` dan `risk24()` pada `petaqu-cuaca.js`.
"Peringatan" di panel diturunkan dari prakiraan, **bukan** peringatan dini resmi BMKG.

## Atribusi & batas
Data cuaca © BMKG (wajib dicantumkan; sudah tampil di panel). Batas BMKG: 60 permintaan/menit/IP (dibatasi cache 20 menit).
Kode & titik pusat desa: cahyadsn/wilayah_boundaries (MIT), Kepmendagri 300.2.2-2430/2025.
