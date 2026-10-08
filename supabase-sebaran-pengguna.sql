-- PETAQU: sebaran lokasi & akses perangkat pengguna (HANYA admin yang bisa membaca).
-- Jalankan di Supabase > SQL Editor SETELAH supabase-akses-admin.sql & supabase-langganan.sql. Aman dijalankan ulang.
--
-- Keamanan:
--  * Tabel dikunci RLS TANPA policy  -> tidak bisa dibaca/ditulis langsung lewat API oleh siapa pun.
--  * Penulisan hanya lewat catat_perangkat() (selalu memakai auth.uid() milik pemanggil sendiri).
--  * Pembacaan hanya lewat admin_sebaran_pengguna(), yang menolak non-admin di sisi server (admin_cek()).
--  * Alamat IP TIDAK disimpan. Koordinat dibulatkan 2 desimal (~1 km) dan hanya perkiraan dari IP.

create table if not exists perangkat_pengguna (
  user_id    uuid not null references auth.users(id) on delete cascade,
  device_id  text not null,
  jenis      text,            -- mobile | tablet | desktop
  os         text,
  browser    text,
  model      text,
  layar      text,
  bahasa     text,
  zona       text,
  pwa        boolean not null default false,
  jaringan   text,
  negara     text,
  provinsi   text,
  kota       text,
  lat        numeric(6,2),
  lng        numeric(6,2),
  sumber     text default 'ip',
  pertama    timestamptz not null default now(),
  terakhir   timestamptz not null default now(),
  jml_akses  int not null default 1,
  primary key (user_id, device_id)
);
alter table perangkat_pengguna enable row level security;   -- sengaja tanpa policy
revoke all on perangkat_pengguna from anon, authenticated;
create index if not exists perangkat_pengguna_terakhir_idx on perangkat_pengguna (terakhir desc);

-- Dipanggil aplikasi milik pengguna yang sedang login (semua peran, hanya untuk dirinya sendiri)
create or replace function catat_perangkat(
  p_device_id text, p_jenis text default null, p_os text default null, p_browser text default null,
  p_model text default null, p_layar text default null, p_bahasa text default null, p_zona text default null,
  p_pwa boolean default false, p_jaringan text default null, p_negara text default null, p_provinsi text default null,
  p_kota text default null, p_lat numeric default null, p_lng numeric default null, p_sumber text default 'ip')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(p_device_id, '') = '' then return; end if;
  insert into perangkat_pengguna as d
    (user_id, device_id, jenis, os, browser, model, layar, bahasa, zona, pwa, jaringan, negara, provinsi, kota, lat, lng, sumber)
  values
    (auth.uid(), left(p_device_id, 64),
     case when p_jenis in ('mobile','tablet','desktop') then p_jenis else 'desktop' end,
     left(p_os, 40), left(p_browser, 40), left(p_model, 60), left(p_layar, 24), left(p_bahasa, 16), left(p_zona, 48),
     coalesce(p_pwa, false), left(p_jaringan, 12), left(p_negara, 60), left(p_provinsi, 80), left(p_kota, 80),
     case when p_lat between -90  and 90  then round(p_lat, 2) end,
     case when p_lng between -180 and 180 then round(p_lng, 2) end,
     case when p_sumber in ('ip','gps','zona') then p_sumber else 'ip' end)
  on conflict (user_id, device_id) do update set
    jenis = excluded.jenis, os = excluded.os, browser = excluded.browser,
    model = coalesce(excluded.model, d.model), layar = excluded.layar, bahasa = excluded.bahasa, zona = excluded.zona,
    pwa = excluded.pwa, jaringan = excluded.jaringan,
    negara = coalesce(excluded.negara, d.negara), provinsi = coalesce(excluded.provinsi, d.provinsi),
    kota = coalesce(excluded.kota, d.kota), lat = coalesce(excluded.lat, d.lat), lng = coalesce(excluded.lng, d.lng),
    sumber = excluded.sumber, terakhir = now(), jml_akses = d.jml_akses + 1;
end $$;
revoke all on function catat_perangkat(text,text,text,text,text,text,text,text,boolean,text,text,text,text,numeric,numeric,text) from public, anon;
grant execute on function catat_perangkat(text,text,text,text,text,text,text,text,boolean,text,text,text,text,numeric,numeric,text) to authenticated;

-- Hanya admin (dicek di server). Satu baris per perangkat + identitas pemiliknya.
create or replace function admin_sebaran_pengguna()
returns table(user_id uuid, email text, nama text, instansi text, role text, device_id text, jenis text, os text, browser text,
              model text, layar text, bahasa text, zona text, pwa boolean, jaringan text, negara text, provinsi text, kota text,
              lat numeric, lng numeric, sumber text, pertama timestamptz, terakhir timestamptz, jml_akses int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query
    select d.user_id, u.email::text, p.nama, p.instansi, coalesce(p.role, 'pending'), d.device_id, d.jenis, d.os, d.browser,
           d.model, d.layar, d.bahasa, d.zona, d.pwa, d.jaringan, d.negara, d.provinsi, d.kota,
           d.lat, d.lng, d.sumber, d.pertama, d.terakhir, d.jml_akses
      from perangkat_pengguna d
      join auth.users u on u.id = d.user_id
      left join profiles p on p.id = d.user_id
     order by d.terakhir desc;
end $$;
revoke all on function admin_sebaran_pengguna() from public, anon;
grant execute on function admin_sebaran_pengguna() to authenticated;   -- non-admin tetap ditolak oleh admin_cek()

-- Hapus catatan perangkat lama (admin saja), default > 180 hari tidak aktif
create or replace function admin_bersihkan_perangkat(p_hari int default 180) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_cek();
  delete from perangkat_pengguna where terakhir < now() - make_interval(days => greatest(p_hari, 7));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function admin_bersihkan_perangkat(int) from public, anon;
grant execute on function admin_bersihkan_perangkat(int) to authenticated;
