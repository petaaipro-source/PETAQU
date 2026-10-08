# Pendaftaran akun PETAQU — cara pasang (±5 menit)

## 1. Supabase (sekali saja)
1. **SQL Editor → New query** → tempel isi `supabase-pendaftaran.sql` → **Run** (harus "Success").
   Prasyarat: `supabase-schema.sql`, `supabase-trial.sql`, `supabase-akses-admin.sql` sudah pernah dijalankan.
2. **Authentication → Sign In / Providers → Email**: aktifkan, lalu aktifkan **Confirm email** (disarankan).
3. **Authentication → Sign In / Providers**: pastikan **Allow new users to sign up** aktif.
4. **Authentication → URL Configuration**: Site URL dan Redirect URLs berisi `https://petaqu.my.id`.

## 2. Unggah file ke GitHub (timpa yang lama)
`index.html`, `sw.js`, `petaqu-auth.js`, `petaqu-trial.js`, `petaqu-admin.js`, plus file baru `petaqu-daftar.js`.

## 3. Cek
Masuk sebagai admin → buka **Persetujuan akses** → tombol **Cek koneksi**. Setiap baris harus ✓.

## Alur pendaftar
Daftar Akun Baru → (konfirmasi email) → admin menyetujui → masuk dengan email + password.

## Nomor WhatsApp admin (opsional)
Di `petaqu-daftar.js`, isi `var ADMIN_WA = "62812xxxxxxx";` supaya muncul tombol "Hubungi admin".

## Domain instansi
`supabase-pendaftaran.sql` berisi contoh `pu.go.id` dan `jatengprov.go.id` (hanya menambah skor). Ubah dengan
`select admin_atur_domain('domain.go.id','viewer', true);` — `true` = setujui otomatis, tetapi hanya setelah email terkonfirmasi.
