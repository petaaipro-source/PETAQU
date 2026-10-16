-- PETAQU: PEMBAYARAN QRIS OTOMATIS — bayar QRIS dengan nominal pas, akun aktif sendiri tanpa admin klik.
-- Jalankan di Supabase > SQL Editor SETELAH supabase-langganan.sql dan supabase-langganan-pilihan.sql. Aman dijalankan ulang.
--
-- Alur:
--   1) Pengguna pilih lama langganan + isi email di aplikasi  ->  Edge Function `qris-buat` memanggil fungsi qris_siapkan_order():
--      HARGA DIHITUNG DI SERVER (tabel harga_langganan), bukan dari browser, jadi tidak bisa diakali.
--   2) Midtrans membuat QRIS dinamis dengan nominal tepat  ->  pengguna scan  ->  Midtrans memanggil Edge Function `qris-webhook`.
--   3) Webhook memverifikasi tanda tangan + mengecek ulang ke Midtrans, lalu memanggil qris_tandai_dibayar():
--        - akun dengan email itu SUDAH ADA   -> langsung aktif / diperpanjang (sisa masa aktif tidak hangus)
--        - akun BELUM ada (belum daftar)     -> pembayaran disimpan; aktif otomatis begitu email itu mendaftar
--        - akun diblokir / admin / tanpa batas waktu -> status 'ditahan' (tidak mengubah apa pun), admin memutuskan manual
--   4) Setiap pembayaran tercatat di tabel `pembayaran` (riwayat yang sudah ada di panel admin) dan audit_log.
-- Tabel & fungsi di sini hanya bisa dipanggil lewat service_role (Edge Function) — kecuali yang memang publik (harga, status order).

-- 1) Harga ---------------------------------------------------------------------------------------
create table if not exists harga_langganan (
  bulan int primary key check (bulan between 1 and 120),
  harga bigint not null check (harga > 0),
  label text,
  aktif boolean not null default true
);
alter table harga_langganan enable row level security;     -- tanpa policy: dibaca lewat qris_harga()

-- Harga awal (ubah kapan saja dengan UPDATE; berlaku untuk order berikutnya):
--   1 bln 49rb | 3 bln 129rb (43rb/bln) | 6 bln 239rb (40rb/bln) | 1 th 429rb (36rb/bln) | 2 th 749rb (31rb/bln) | 3 th 999rb (28rb/bln)
insert into harga_langganan(bulan, harga, label) values
  (1,   99900, '1 bulan'),
  (3,  269900, '3 bulan'),
  (6,  499900, '6 bulan'),
  (12, 899900, '1 tahun'),
  (24, 1599900, '2 tahun'),
  (36, 2199900, '3 tahun')
on conflict (bulan) do nothing;

-- Diskon otomatis untuk email pelajar/mahasiswa/instansi pendidikan (berdasarkan domain email, bukan pengakuan sendiri)
create table if not exists diskon_domain (
  akhiran text primary key,          -- contoh 'ac.id' cocok untuk ui.ac.id, mhs.unsoed.ac.id, dst.
  persen int not null check (persen between 1 and 90),
  keterangan text
);
alter table diskon_domain enable row level security;
insert into diskon_domain(akhiran, persen, keterangan) values
  ('ac.id',  30, 'Mahasiswa / dosen perguruan tinggi'),
  ('sch.id', 30, 'Pelajar / guru sekolah')
on conflict (akhiran) do nothing;

create or replace function qris_persen_diskon(p_email text) returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(d.persen), 0)::int from diskon_domain d
   where lower(split_part(coalesce(p_email, ''), '@', 2)) = d.akhiran
      or lower(split_part(coalesce(p_email, ''), '@', 2)) like '%.' || d.akhiran
$$;

-- harga akhir (dibulatkan ke Rp 1.000 terdekat)
create or replace function qris_hitung_harga(p_bulan int, p_email text) returns bigint language sql stable security definer set search_path = public as $$
  select (round(h.harga * (100 - qris_persen_diskon(p_email)) / 100.0 / 100.0) * 100)::bigint
    from harga_langganan h where h.bulan = p_bulan and h.aktif
$$;

-- Daftar harga untuk layar bayar (publik: hanya harga, tidak ada data pengguna)
create or replace function qris_harga(p_email text default null)
returns table(bulan int, label text, normal bigint, diskon int, harga bigint)
language sql stable security definer set search_path = public as $$
  select h.bulan, coalesce(h.label, h.bulan || ' bulan'), h.harga, qris_persen_diskon(p_email), qris_hitung_harga(h.bulan, p_email)
    from harga_langganan h where h.aktif order by h.bulan
$$;

-- 2) Order QRIS -----------------------------------------------------------------------------------
create table if not exists order_qris (
  order_id   text primary key,                       -- acak & tak bisa ditebak: dipakai juga sebagai "tiket" cek status
  email      text not null,
  bulan      int  not null,
  harga_normal bigint not null,
  diskon     int  not null default 0,
  jumlah     bigint not null check (jumlah > 0),     -- nominal yang HARUS dibayar (persis ini yang ada di QR)
  status     text not null default 'pending' check (status in ('pending','paid','expired','failed','ditahan')),
  gateway_ref text,
  qr_string  text,
  qr_url     text,
  dibuat     timestamptz not null default now(),
  kedaluwarsa timestamptz,
  dibayar    timestamptz,
  diterapkan boolean not null default false,         -- sudah mengaktifkan akun?
  diterapkan_pada timestamptz,
  sampai     date,                                   -- masa aktif akun setelah order ini
  catatan    text
);
create index if not exists order_qris_email_idx on order_qris (email, dibuat desc);
create index if not exists order_qris_belum_idx on order_qris (email) where status = 'paid' and not diterapkan;
alter table order_qris enable row level security;     -- tanpa policy: hanya fungsi di bawah

-- Dipanggil Edge Function `qris-buat` (service_role). Memakai ulang QR yang masih berlaku untuk email+paket yang sama.
create or replace function qris_siapkan_order(p_email text, p_bulan int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text := lower(btrim(coalesce(p_email, ''))); h bigint; n bigint; pct int; r order_qris; oid text;
begin
  if em !~ '^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$' or length(em) > 120 then return jsonb_build_object('ok', false, 'reason', 'email_tidak_valid'); end if;
  select harga into n from harga_langganan where bulan = p_bulan and aktif;
  if n is null then return jsonb_build_object('ok', false, 'reason', 'paket_tidak_valid'); end if;
  h := qris_hitung_harga(p_bulan, em); pct := qris_persen_diskon(em);
  if h is null or h < 1000 then return jsonb_build_object('ok', false, 'reason', 'paket_tidak_valid'); end if;

  -- QR lama yang masih berlaku (sisa > 2 menit, harga masih sama) dipakai ulang
  select * into r from order_qris
   where order_qris.email = em and bulan = p_bulan and status = 'pending' and qr_string is not null
     and kedaluwarsa > now() + interval '2 minutes' and jumlah = h
   order by dibuat desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'baru', false, 'order_id', r.order_id, 'jumlah', r.jumlah, 'qr_string', r.qr_string, 'qr_url', r.qr_url,
                              'kedaluwarsa', r.kedaluwarsa, 'bulan', r.bulan, 'diskon', r.diskon);
  end if;

  -- batasi spam: maksimal 8 order belum dibayar per email per jam
  if (select count(*) from order_qris where order_qris.email = em and status = 'pending' and dibuat > now() - interval '1 hour') >= 8 then
    return jsonb_build_object('ok', false, 'reason', 'terlalu_banyak');
  end if;
  update order_qris set status = 'expired' where order_qris.email = em and status = 'pending' and kedaluwarsa is not null and kedaluwarsa < now();

  oid := 'PQ-' || replace(gen_random_uuid()::text, '-', '');
  insert into order_qris(order_id, email, bulan, harga_normal, diskon, jumlah) values (oid, em, p_bulan, n, pct, h);
  return jsonb_build_object('ok', true, 'baru', true, 'order_id', oid, 'jumlah', h, 'bulan', p_bulan, 'diskon', pct);
end $$;

-- Edge Function menyimpan QR yang dibuat Midtrans
create or replace function qris_simpan_qr(p_order_id text, p_ref text, p_qr_string text, p_qr_url text, p_kedaluwarsa timestamptz)
returns void language sql security definer set search_path = public as $$
  update order_qris set gateway_ref = p_ref, qr_string = p_qr_string, qr_url = p_qr_url, kedaluwarsa = p_kedaluwarsa
   where order_id = p_order_id and status = 'pending'
$$;

-- Gagal membuat QR di gateway -> order dibatalkan (supaya tidak mengisi kuota 8/jam)
create or replace function qris_batal_order(p_order_id text, p_catatan text default null)
returns void language sql security definer set search_path = public as $$
  update order_qris set status = 'failed', catatan = left(coalesce(p_catatan, 'gagal membuat QR'), 200) where order_id = p_order_id and status = 'pending' and qr_string is null
$$;

-- 3) Aktivasi akun dari satu order lunas (idempoten) ------------------------------------------------
create or replace function qris_terapkan(p_order_id text) returns text language plpgsql security definer set search_path = public as $$
declare o order_qris; uid uuid; r profiles; dasar date; akhir date; peran text; label text;
begin
  select * into o from order_qris where order_id = p_order_id for update;
  if not found or o.status <> 'paid' or o.diterapkan then return coalesce(o.status, 'tidak_ada'); end if;

  select u.id into uid from auth.users u where lower(u.email) = o.email order by u.created_at limit 1;
  if uid is null then return 'menunggu_akun'; end if;                     -- belum daftar: dipasang saat email ini mendaftar

  select * into r from profiles where id = uid;
  if not found then
    insert into profiles(id, role) values (uid, 'pending') on conflict (id) do nothing;
    select * into r from profiles where id = uid;
  end if;

  if r.role in ('admin', 'blocked') then
    update order_qris set status = 'ditahan', catatan = 'akun ' || r.role || ': tidak diubah, putuskan manual / refund' where order_id = o.order_id;
    insert into audit_log(road_id, action, by) values (null, 'qris-ditahan:' || o.email || ':' || o.order_id, null);
    return 'ditahan';
  end if;
  if r.role in ('viewer', 'surveyor') and r.aktif_sampai is null then
    update order_qris set status = 'ditahan', catatan = 'akun sudah tanpa batas waktu: tidak diubah, putuskan manual / refund' where order_id = o.order_id;
    insert into audit_log(road_id, action, by) values (null, 'qris-ditahan:' || o.email || ':' || o.order_id, null);
    return 'ditahan';
  end if;

  dasar := case when r.role in ('viewer', 'surveyor') then greatest(hari_wib(), r.aktif_sampai) else hari_wib() end;   -- sisa masa aktif tidak hangus
  akhir := (dasar + make_interval(months => o.bulan))::date;
  peran := case when r.role in ('viewer', 'surveyor') then r.role else 'viewer' end;                                   -- pending/trial -> viewer
  select coalesce(h.label, o.bulan || ' bulan') into label from harga_langganan h where h.bulan = o.bulan;

  update profiles set role = peran, aktif_sampai = akhir, jatuh_tempo = akhir, paket = left('QRIS ' || coalesce(label, o.bulan || ' bulan'), 60),
                      tarif = round(o.jumlah::numeric / o.bulan)::bigint
   where id = uid;
  update auth.users set banned_until = null where id = uid;                -- akun uji coba yang dikunci ikut dibuka

  insert into pembayaran(user_id, email, bulan, jumlah, metode, catatan, sampai, by)
    values (uid, o.email, o.bulan, o.jumlah, 'QRIS otomatis', 'order ' || o.order_id, akhir, null);
  insert into audit_log(road_id, action, by) values (null, 'qris-aktif:' || o.email || ':' || o.bulan || 'bln:s/d ' || akhir::text, null);
  update order_qris set diterapkan = true, diterapkan_pada = now(), sampai = akhir where order_id = o.order_id;
  return 'aktif';
end $$;
revoke all on function qris_terapkan(text) from public, anon, authenticated;

-- Dipanggil webhook / pengecekan (service_role) saat Midtrans bilang LUNAS. p_jumlah harus sama persis dengan nominal order.
create or replace function qris_tandai_dibayar(p_order_id text, p_jumlah bigint, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o order_qris; hasil text;
begin
  select * into o from order_qris where order_id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'order_tidak_ada'); end if;
  if o.status in ('paid', 'ditahan') then return jsonb_build_object('ok', true, 'status', o.status, 'diterapkan', o.diterapkan, 'ulang', true); end if;
  if p_jumlah is distinct from o.jumlah then
    update order_qris set status = 'ditahan', catatan = 'nominal tidak cocok: dibayar ' || coalesce(p_jumlah::text, '?') || ' seharusnya ' || o.jumlah where order_id = o.order_id;
    insert into audit_log(road_id, action, by) values (null, 'qris-nominal-beda:' || o.email || ':' || o.order_id, null);
    return jsonb_build_object('ok', false, 'reason', 'nominal_tidak_cocok');
  end if;
  update order_qris set status = 'paid', dibayar = now(), gateway_ref = coalesce(p_ref, gateway_ref) where order_id = o.order_id;
  hasil := qris_terapkan(o.order_id);
  return jsonb_build_object('ok', true, 'status', hasil, 'diterapkan', hasil = 'aktif');
end $$;

create or replace function qris_tandai_gagal(p_order_id text, p_status text)
returns void language sql security definer set search_path = public as $$
  update order_qris set status = case when p_status = 'expire' then 'expired' else 'failed' end where order_id = p_order_id and status = 'pending'
$$;

-- 4) Pembayaran yang masuk SEBELUM akunnya ada: pasang otomatis begitu email itu mendaftar / masuk ---
create or replace function qris_klaim_email(p_email text) returns int language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  for x in select order_id from order_qris where email = lower(btrim(coalesce(p_email, ''))) and status = 'paid' and not diterapkan order by dibayar loop
    if qris_terapkan(x.order_id) = 'aktif' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function qris_klaim_email(text) from public, anon, authenticated;

create or replace function qris_klaim_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare em text;
begin
  begin
    select u.email into em from auth.users u where u.id = new.id;
    if em is not null and exists (select 1 from order_qris where email = lower(em) and status = 'paid' and not diterapkan) then
      perform qris_klaim_email(em);
    end if;
  exception when others then null;                   -- tidak pernah menggagalkan pendaftaran
  end;
  return null;
end $$;
drop trigger if exists qris_klaim_profil on profiles;
create trigger qris_klaim_profil after insert on profiles for each row execute function qris_klaim_trigger();

-- Cadangan: dipanggil aplikasi setelah login (mis. profil sudah ada sebelum order dibayar)
create or replace function qris_klaim_saya() returns int language plpgsql security definer set search_path = public as $$
declare em text;
begin
  if auth.uid() is null then return 0; end if;
  select u.email into em from auth.users u where u.id = auth.uid();
  return qris_klaim_email(em);
end $$;

-- 5) Status order untuk layar bayar (publik, hanya dengan order_id acak; tidak membocorkan email) ------
create or replace function qris_status(p_order_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o order_qris; akun boolean;
begin
  select * into o from order_qris where order_id = p_order_id;
  if not found then return jsonb_build_object('status', 'tidak_ada'); end if;
  return jsonb_build_object('status', case when o.status = 'pending' and o.kedaluwarsa is not null and o.kedaluwarsa < now() then 'expired' else o.status end,
                            'jumlah', o.jumlah, 'bulan', o.bulan, 'diterapkan', o.diterapkan, 'sampai', o.sampai, 'kedaluwarsa', o.kedaluwarsa);
end $$;

-- 6) Untuk admin: daftar order terbaru (termasuk yang 'ditahan' dan perlu keputusan) ----------------------
create or replace function admin_order_qris(p_limit int default 100)
returns table(order_id text, email text, bulan int, jumlah bigint, diskon int, status text, dibuat timestamptz, dibayar timestamptz, diterapkan boolean, sampai date, catatan text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query select o.order_id, o.email, o.bulan, o.jumlah, o.diskon, o.status, o.dibuat, o.dibayar, o.diterapkan, o.sampai, o.catatan
                 from order_qris o order by (o.status = 'ditahan') desc, (o.status = 'paid' and not o.diterapkan) desc, o.dibuat desc limit least(greatest(p_limit, 1), 500);
end $$;

-- 7) Izin ------------------------------------------------------------------------------------------
revoke all on function qris_persen_diskon(text), qris_hitung_harga(int, text), qris_siapkan_order(text, int), qris_simpan_qr(text, text, text, text, timestamptz),
  qris_batal_order(text, text), qris_tandai_dibayar(text, bigint, text), qris_tandai_gagal(text, text) from public, anon, authenticated;
revoke all on function qris_harga(text), qris_status(text), qris_klaim_saya(), admin_order_qris(int) from public;
grant execute on function qris_harga(text), qris_status(text) to anon, authenticated;
grant execute on function qris_klaim_saya(), admin_order_qris(int) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function qris_siapkan_order(text, int), qris_simpan_qr(text, text, text, text, timestamptz), qris_batal_order(text, text),
      qris_tandai_dibayar(text, bigint, text), qris_tandai_gagal(text, text), qris_status(text) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';

-- 8) Cek: harga yang berlaku
select * from qris_harga(null);
