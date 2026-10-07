# Panduan: simpan foto pekerjaan proyek di Supabase

## A. Pasang (sekali saja)
1. Buka proyek Supabase Anda (yang sama dengan login PETAQU).
2. Menu **SQL Editor → New query**.
3. Pastikan `supabase-schema.sql` (dan `supabase-akses-admin.sql`) sudah pernah dijalankan.
4. Tempel isi **`supabase-foto-proyek.sql`** → **Run**. Harus muncul "Success".
5. Cek hasil:
   - **Storage** → ada bucket **foto-proyek** (Private).
   - **Table Editor** → ada tabel **project_photos**.
   - **Authentication → Policies** → ada kebijakan "baca/tulis/ubah/hapus foto proyek".

## B. Peran pengguna
| Peran | Lihat | Unggah | Ubah/Hapus |
|---|---|---|---|
| admin | ya | ya | semua foto |
| surveyor | ya | ya | foto miliknya |
| viewer | ya | tidak | tidak |
| pending / trial / blocked | tidak | tidak | tidak |

Naikkan peran: `update profiles set role='surveyor' where id='<uuid-user>';`

## C. Pola path file
`<user_id>/<tahun>/<uuid>.jpg` — folder pertama WAJIB user id pengunggah (dipakai aturan keamanan).

## D. Contoh kode (supabase-js)
```js
// unggah
const uid = (await sb.auth.getUser()).data.user.id;
const id  = crypto.randomUUID();
const path = `${uid}/${new Date().getFullYear()}/${id}.jpg`;
const up = await sb.storage.from('foto-proyek').upload(path, blob, { contentType: 'image/jpeg' });
if (up.error) throw up.error;
await sb.from('project_photos').insert({
  id, storage_path: path, paket: 'Paket 01', ruas_nama: 'Ruas A', km_sta: 'KM 12+300',
  jenis: 'ac_wc', tahap: 'sesudah', progres: 100, lat, lng, taken_at, catatan
});

// tampilkan (bucket privat -> pakai signed URL, berlaku 1 jam)
const { data } = await sb.storage.from('foto-proyek').createSignedUrl(path, 3600);
img.src = data.signedUrl;

// filter
await sb.from('project_photos').select('*').eq('jenis','ac_wc').eq('paket','Paket 01').order('taken_at');
```

## E. Catatan kuota (paket gratis)
- Penyimpanan ±1 GB, foto terkompresi ±100 KB → sekitar 10.000 foto.
- Proyek gratis otomatis dijeda bila 7 hari tanpa aktivitas.
- Foto asli resolusi tinggi sebaiknya diarsipkan terpisah (Google Drive / Cloudflare R2).
