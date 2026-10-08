-- PETAQU: LANGGANAN — masa aktif, jatuh tempo pembayaran, riwayat bayar, dan hapus akun yang tidak berlangganan.
-- Jalankan di Supabase > SQL Editor SETELAH supabase-akses-admin.sql dan supabase-pendaftaran.sql. Aman dijalankan ulang.
--
-- Cara kerja:
--   * aktif_sampai  = HARI TERAKHIR akun boleh dipakai (tanggal WIB). NULL = tanpa batas waktu. Admin tidak pernah kedaluwarsa.
--   * Begitu lewat tanggal itu, my_role() mengembalikan 'expired' -> data ruas/foto TERKUNCI oleh database (bukan hanya tampilan),
--     aplikasi mengeluarkan pengguna, dan akun muncul di tab "Berakhir" pada panel admin.
--   * jatuh_tempo   = tanggal tagihan berikutnya harus dibayar (pengingat untuk admin; akses baru terputus di aktif_sampai).
--   * Hapus akun    = hanya akun yang TIDAK berlangganan lagi (berakhir / menunggu / diblokir). Pelanggan yang masih aktif ditolak.
--   * Riwayat pembayaran tetap tersimpan walau akun dihapus (tabel pembayaran tanpa foreign key).

-- 1) Kolom langganan -----------------------------------------------------------
alter table profiles add column if not exists aktif_sampai date;
alter table profiles add column if not exists jatuh_tempo  date;
alter table profiles add column if not exists paket        text;
alter table profiles add column if not exists tarif        bigint check (tarif is null or tarif >= 0);   -- rupiah per bulan

create table if not exists pembayaran (
  id      bigserial primary key,
  user_id uuid not null,                       -- sengaja TANPA foreign key: riwayat tetap ada setelah akun dihapus
  email   text,
  tanggal date not null default ((now() at time zone 'Asia/Jakarta')::date),
  bulan   int,
  jumlah  bigint,
  metode  text,
  catatan text,
  sampai  date,                                -- masa aktif setelah pembayaran ini
  by      uuid
);
create index if not exists pembayaran_user_idx on pembayaran (user_id, tanggal desc);
alter table pembayaran enable row level security;   -- tanpa policy: hanya lewat fungsi admin

-- 2) Penegakan di database: langganan habis = tidak punya akses ----------------
create or replace function hari_wib() returns date language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

create or replace function my_role() returns text language sql stable security definer set search_path = public as $$
  select case when p.role in ('surveyor','viewer') and p.aktif_sampai is not null and p.aktif_sampai < hari_wib()
              then 'expired' else p.role end
    from profiles p where p.id = auth.uid()
$$;
-- (semua policy yang memakai my_role() in ('admin','surveyor','viewer') otomatis menolak peran 'expired')

-- 3) Daftar pengguna + data langganan -------------------------------------------
drop function if exists admin_daftar_pengguna();
create or replace function admin_daftar_pengguna()
returns table(id uuid, email text, role text, provider text, created_at timestamptz, last_sign_in_at timestamptz, banned boolean,
              trial_dipakai boolean, nama text, instansi text, hp text, tujuan text, skor int, saran text, email_terkonfirmasi boolean,
              aktif_sampai date, jatuh_tempo date, paket text, tarif bigint, terakhir_bayar date)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query
    select u.id, u.email::text, coalesce(p.role, 'pending'), coalesce(u.raw_app_meta_data->>'provider', ''),
           u.created_at, u.last_sign_in_at, coalesce(u.banned_until > now(), false),
           exists (select 1 from trial_claims c
                    where c.email = replace(split_part(split_part(lower(u.email), '@', 1), '+', 1), '.', '') || '@gmail.com'),
           coalesce(p.nama, nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', '')),
           p.instansi, p.hp, p.tujuan, coalesce(p.skor, 0), p.saran, (u.email_confirmed_at is not null),
           p.aktif_sampai, p.jatuh_tempo, p.paket, p.tarif,
           (select max(b.tanggal) from pembayaran b where b.user_id = u.id)
      from auth.users u left join profiles p on p.id = u.id
     order by (coalesce(p.role, 'pending') in ('pending','trial')) desc, coalesce(p.skor, 0) desc, u.created_at desc;
end $$;

-- 4) Setujui (kini bisa sekaligus menetapkan masa aktif dalam bulan) -------------
drop function if exists admin_setujui(uuid, text);
create or replace function admin_setujui(p_id uuid, p_role text default 'viewer', p_bulan int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text; akhir date;
begin
  perform admin_cek();
  if p_role not in ('viewer','surveyor') then return jsonb_build_object('ok', false, 'reason', 'peran_tidak_valid'); end if;
  if p_bulan is not null and (p_bulan < 1 or p_bulan > 120) then return jsonb_build_object('ok', false, 'reason', 'durasi_tidak_valid'); end if;
  if exists (select 1 from profiles where id = p_id and role = 'admin') then return jsonb_build_object('ok', false, 'reason', 'akun_admin'); end if;
  select email into em from auth.users where id = p_id;
  if em is null then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
  insert into profiles(id, role) values (p_id, p_role) on conflict (id) do update set role = excluded.role;
  if p_bulan is not null then                       -- NULL = jangan ubah masa aktif yang sudah ada
    akhir := (hari_wib() + make_interval(months => p_bulan))::date;
    update profiles set aktif_sampai = akhir, jatuh_tempo = akhir where id = p_id;
  end if;
  update auth.users set banned_until = null where id = p_id;
  insert into audit_log(road_id, action, by)
    values (null, 'setujui:' || em || ':' || p_role || coalesce(':' || p_bulan::text || 'bln', ''), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

drop function if exists admin_setujui_banyak(uuid[], text);
create or replace function admin_setujui_banyak(p_ids uuid[], p_role text default 'viewer', p_bulan int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0; x uuid; em text; akhir date;
begin
  perform admin_cek();
  if p_role not in ('viewer','surveyor') then return jsonb_build_object('ok', false, 'reason', 'peran_tidak_valid'); end if;
  if p_bulan is not null and (p_bulan < 1 or p_bulan > 120) then return jsonb_build_object('ok', false, 'reason', 'durasi_tidak_valid'); end if;
  foreach x in array coalesce(p_ids, '{}') loop
    select u.email into em from auth.users u where u.id = x;
    continue when em is null;
    continue when exists (select 1 from profiles where id = x and role in ('admin','blocked'));
    insert into profiles(id, role) values (x, p_role) on conflict (id) do update set role = excluded.role;
    if p_bulan is not null then
      akhir := (hari_wib() + make_interval(months => p_bulan))::date;
      update profiles set aktif_sampai = akhir, jatuh_tempo = akhir where id = x;
    end if;
    update auth.users set banned_until = null where id = x;
    insert into audit_log(road_id, action, by)
      values (null, 'setujui:' || em || ':' || p_role || coalesce(':' || p_bulan::text || 'bln', ''), auth.uid());
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'jumlah', n);
end $$;

-- 5) Perpanjang + catat pembayaran ----------------------------------------------
create or replace function admin_perpanjang(p_id uuid, p_bulan int, p_jumlah bigint default null, p_metode text default null, p_catatan text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r profiles; em text; dasar date; akhir date; jml bigint;
begin
  perform admin_cek();
  if p_bulan is null or p_bulan < 1 or p_bulan > 120 then return jsonb_build_object('ok', false, 'reason', 'durasi_tidak_valid'); end if;
  if p_jumlah is not null and p_jumlah < 0 then return jsonb_build_object('ok', false, 'reason', 'jumlah_tidak_valid'); end if;
  select * into r from profiles where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
  if r.role not in ('viewer','surveyor') then return jsonb_build_object('ok', false, 'reason', 'belum_disetujui'); end if;   -- setujui dulu
  select email into em from auth.users where id = p_id;
  dasar := greatest(hari_wib(), coalesce(r.aktif_sampai, hari_wib()));      -- sisa masa aktif tidak hangus; yang sudah lewat dihitung dari hari ini
  akhir := (dasar + make_interval(months => p_bulan))::date;
  jml   := coalesce(p_jumlah, case when r.tarif is not null then r.tarif * p_bulan end);
  update profiles set aktif_sampai = akhir, jatuh_tempo = akhir where id = p_id;
  insert into pembayaran(user_id, email, bulan, jumlah, metode, catatan, sampai, by)
    values (p_id, em, p_bulan, jml, nullif(left(btrim(coalesce(p_metode, '')), 60), ''), nullif(left(btrim(coalesce(p_catatan, '')), 200), ''), akhir, auth.uid());
  insert into audit_log(road_id, action, by) values (null, 'perpanjang:' || coalesce(em, '?') || ':' || p_bulan::text || 'bln:s/d ' || akhir::text, auth.uid());
  return jsonb_build_object('ok', true, 'aktif_sampai', akhir);
end $$;

-- 6) Atur tanggal langsung (NULL = tanpa batas / tanpa tagihan) -------------------
create or replace function admin_atur_langganan(p_id uuid, p_aktif_sampai date default null, p_jatuh_tempo date default null, p_paket text default null, p_tarif bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text;
begin
  perform admin_cek();
  if p_tarif is not null and p_tarif < 0 then return jsonb_build_object('ok', false, 'reason', 'tarif_tidak_valid'); end if;
  if exists (select 1 from profiles where id = p_id and role = 'admin') then return jsonb_build_object('ok', false, 'reason', 'akun_admin'); end if;
  select email into em from auth.users where id = p_id;
  if em is null or not exists (select 1 from profiles where id = p_id) then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
  update profiles set aktif_sampai = p_aktif_sampai, jatuh_tempo = p_jatuh_tempo,
                      paket = nullif(left(btrim(coalesce(p_paket, '')), 60), ''), tarif = p_tarif
   where id = p_id;
  insert into audit_log(road_id, action, by)
    values (null, 'langganan:' || em || ':s/d ' || coalesce(p_aktif_sampai::text, 'tanpa-batas') || ':tempo ' || coalesce(p_jatuh_tempo::text, '-'), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- 7) Riwayat pembayaran satu akun -------------------------------------------------
create or replace function admin_riwayat_bayar(p_id uuid)
returns table(tanggal date, bulan int, jumlah bigint, metode text, catatan text, sampai date)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query select b.tanggal, b.bulan, b.jumlah, b.metode, b.catatan, b.sampai
                 from pembayaran b where b.user_id = p_id order by b.tanggal desc, b.id desc limit 50;
end $$;

-- 8) Hapus akun yang TIDAK berlangganan -------------------------------------------
-- Inti penghapusan (internal). Data yang dibuat akun itu TIDAK ikut hilang:
--   ruas: kolom updated_by dikosongkan | foto proyek: kepemilikan dipindah ke admin | riwayat bayar: tetap tersimpan
create or replace function hapus_akun_inti(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare pemilik uuid := coalesce(auth.uid(), (select id from profiles where role = 'admin' order by id limit 1));
begin
  if pemilik is null then raise exception 'tidak ada admin untuk menerima data foto'; end if;
  update roads set updated_by = null where updated_by = p_id;
  if to_regclass('public.project_photos') is not null then
    execute 'update public.project_photos set uploaded_by = $2 where uploaded_by = $1' using p_id, pemilik;
  end if;
  delete from auth.users where id = p_id;        -- profil ikut terhapus (on delete cascade)
end $$;
revoke all on function hapus_akun_inti(uuid) from public, anon, authenticated;

create or replace function admin_hapus_akun(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r profiles; em text;
begin
  perform admin_cek();
  if p_id = auth.uid() then return jsonb_build_object('ok', false, 'reason', 'akun_admin'); end if;
  select * into r from profiles where id = p_id;
  if found and r.role = 'admin' then return jsonb_build_object('ok', false, 'reason', 'akun_admin'); end if;
  if found and r.role in ('viewer','surveyor') and not (r.aktif_sampai is not null and r.aktif_sampai < hari_wib()) then
    return jsonb_build_object('ok', false, 'reason', 'masih_berlangganan');       -- pelanggan aktif tidak bisa dihapus dari sini
  end if;
  select email into em from auth.users where id = p_id;
  if em is null then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
  perform hapus_akun_inti(p_id);
  insert into audit_log(road_id, action, by) values (null, 'hapus-akun:' || em, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Hapus massal: akun yang sudah berakhir lebih dari p_hari hari (minimal 7 supaya tidak salah hapus)
create or replace function admin_hapus_kedaluwarsa(p_hari int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  perform admin_cek();
  if p_hari is null or p_hari < 7 then return jsonb_build_object('ok', false, 'reason', 'minimal_7_hari'); end if;
  for x in select p.id, u.email from profiles p join auth.users u on u.id = p.id
            where p.role in ('viewer','surveyor') and p.aktif_sampai is not null and p.aktif_sampai < hari_wib() - p_hari loop
    perform hapus_akun_inti(x.id);
    insert into audit_log(road_id, action, by) values (null, 'hapus-kedaluwarsa:' || coalesce(x.email, '?'), auth.uid());
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'jumlah', n);
end $$;

-- 9) Izin: hanya akun login yang lolos admin_cek() di dalam fungsi ------------------
revoke all on function admin_daftar_pengguna() from public, anon;
revoke all on function admin_setujui(uuid, text, int) from public, anon;
revoke all on function admin_setujui_banyak(uuid[], text, int) from public, anon;
revoke all on function admin_perpanjang(uuid, int, bigint, text, text) from public, anon;
revoke all on function admin_atur_langganan(uuid, date, date, text, bigint) from public, anon;
revoke all on function admin_riwayat_bayar(uuid) from public, anon;
revoke all on function admin_hapus_akun(uuid) from public, anon;
revoke all on function admin_hapus_kedaluwarsa(int) from public, anon;
grant execute on function admin_daftar_pengguna() to authenticated;
grant execute on function admin_setujui(uuid, text, int) to authenticated;
grant execute on function admin_setujui_banyak(uuid[], text, int) to authenticated;
grant execute on function admin_perpanjang(uuid, int, bigint, text, text) to authenticated;
grant execute on function admin_atur_langganan(uuid, date, date, text, bigint) to authenticated;
grant execute on function admin_riwayat_bayar(uuid) to authenticated;
grant execute on function admin_hapus_akun(uuid) to authenticated;
grant execute on function admin_hapus_kedaluwarsa(int) to authenticated;

-- 10) (OPSIONAL, MATI SECARA DEFAULT) Hapus otomatis tiap malam lewat pg_cron ----------
-- Penghapusan permanen, jadi sengaja tidak diaktifkan. Bila ingin: aktifkan Database > Extensions > pg_cron,
-- hapus tanda komentar blok di bawah, ganti 90 dengan jumlah hari tenggang yang kamu inginkan, lalu jalankan.
--
-- create or replace function hapus_kedaluwarsa_otomatis(p_hari int default 90) returns int language plpgsql security definer set search_path = public as $$
-- declare x record; n int := 0;
-- begin
--   if p_hari < 7 then raise exception 'minimal 7 hari'; end if;
--   for x in select p.id, u.email from profiles p join auth.users u on u.id = p.id
--             where p.role in ('viewer','surveyor') and p.aktif_sampai is not null and p.aktif_sampai < hari_wib() - p_hari loop
--     perform hapus_akun_inti(x.id);
--     insert into audit_log(road_id, action, by) values (null, 'hapus-otomatis:' || coalesce(x.email, '?'), null);
--     n := n + 1;
--   end loop;
--   return n;
-- end $$;
-- revoke all on function hapus_kedaluwarsa_otomatis(int) from public, anon, authenticated;
-- select cron.schedule('petaqu-hapus-kedaluwarsa', '0 20 * * *', $$select hapus_kedaluwarsa_otomatis(90)$$);   -- 20:00 UTC = 03:00 WIB

notify pgrst, 'reload schema';

-- 11) Cek hasil: status langganan semua akun
select u.email, p.role, p.aktif_sampai, p.jatuh_tempo, p.paket, p.tarif,
       case when p.role in ('viewer','surveyor') and p.aktif_sampai is not null and p.aktif_sampai < hari_wib() then 'BERAKHIR' else 'ok' end as status
  from auth.users u left join profiles p on p.id = u.id order by u.created_at desc;
