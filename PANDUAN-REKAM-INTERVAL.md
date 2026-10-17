# Rekam Koordinat — interval Auto bebas

Di tabel *Rekam Koordinat & KM*, dropdown Auto berisi:
- **Per jarak**: 10 m, 25 m, 50 m, 100 m, 250 m, 500 m, 1 km, 2 km, 5 km + nilai kustom favorit (★).
- **Per waktu**: 5 dtk, 10 dtk, 30 dtk, 1 menit.
- **Kustom…**: ketik angka bebas + satuan (meter / km / detik / menit), lalu *Terapkan* atau Enter. Koma desimal boleh (mis. `1,5 km`).

Batas: jarak 1 m – 100 km; waktu 1 dtk – 60 menit. Kustom jarak tersimpan (maks. 5) di dropdown.
Mode waktu hanya merekam bila posisi sudah bergeser >= 1 m. Panel menampilkan sisa jarak/waktu menuju rekaman berikutnya.
Lewat konsol: `PQRekam.setInterval(75,"m")`, `PQRekam.setInterval(1.5,"km")`, `PQRekam.setInterval(20,"t")`.
