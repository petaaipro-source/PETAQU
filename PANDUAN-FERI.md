# Pelayaran & Feri (`petaqu-feri.js` + `data-feri.js`)

Tombol **⚓ Pelayaran & Feri** ada di dock "Alat"; tombol **⛴ On/Off** menyalakan/mematikan jaringan di peta
(juga ada di menu layer grup *Kereta Api, Pesawat & Kapal*: **Jaringan Rute Kapal & Feri**, **Pelabuhan Indonesia**, **Perencana Rute Kapal**). Default MATI saat pertama dibuka; pilihan tersimpan di perangkat.

| Tab | Fungsi |
|---|---|
| 🕸️ Jaringan | Pelabuhan & rute di peta, kapal beranimasi searah rute, filter jenis kapal (Ro-Ro, kapal cepat, Pelni, speedboat, internasional, danau), muat **jalur feri nyata dari OSM** untuk area peta |
| 🧭 Rute | Asal/tujuan = pelabuhan, titik peta, lokasi saya, atau ruas proyek. 3 pilihan sekaligus (Tercepat · Termurah · Transit sedikit), transit antar-kapal dengan waktu tunggu sesuai frekuensi, sambungan darat antar pelabuhan satu pulau, jam berangkat → jam tiba (WIB/WITA/WIT), tarif per golongan kendaraan, CO₂, salin ringkasan |
| ⚓ Pelabuhan | Cari, terdekat dari pusat peta / GPS, tutup pelabuhan (skenario) |
| 🌊 Cuaca | Tinggi gelombang LIVE tiap rute (Open-Meteo Marine, tanpa API key) vs batas aman jenis kapal; peta dapat diwarnai menurut risiko |
| 🚛 Logistik | Alat berat/material → golongan, tarif, jumlah keberangkatan (SRU dek), peringatan lowbed/LCT/lebar/berat |
| 🛣️ Ruas | Pelabuhan terdekat dari setiap ruas jalan yang sudah dimuat |
| ⚙️ Data | Tutup rute/pelabuhan, tambah pelabuhan & rute kustom, keterhubungan jaringan, ekspor CSV/JSON, impor JSON |

## Memperbarui data (`data-feri.js`)
- `FR_PELABUHAN = [kode, nama, kab/kota, provinsi, lat, lng, tipe, pulau]` — tipe: A ro-ro · P Pelni · C kapal cepat · I internasional · D danau.
- `FR_RUTE = [id, nama, jenis, "KODE KODE @lat,lng KODE", frekuensi/hari, operator]` — `@lat,lng` = titik belok di laut; otomatis dua arah.
- `FR_JENIS` kecepatan, waktu bongkar-muat, batas gelombang aman; `FR_GOL` tarif per km tiap golongan (model indikatif).
Naikkan `?v=` di `index.html` dan `sw.js` agar cache perangkat diperbarui.

## Catatan akurasi
Koordinat pelabuhan & garis rute = **pendekatan kasar** untuk pra-survei (garis lurus + titik belok); gunakan "Muat jalur feri OSM" untuk geometri nyata.
Jadwal Pelni berubah-ubah; frekuensi hanya model. Tarif = jarak × tarif/km per golongan (bukan tarif resmi).
Gelombang = model global Open-Meteo, bukan peringatan resmi — utamakan BMKG, Syahbandar & operator.
