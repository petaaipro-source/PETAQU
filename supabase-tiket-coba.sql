-- PETAQU — TIKET COBA BERBAYAR (bayar Rp 5.000 lewat QRIS -> coba 15 menit).
-- Jalankan SEKALI di Supabase > SQL Editor, SETELAH supabase-qris-otomatis.sql DAN supabase-gratis-kontrol.sql. Aman dijalankan ulang.
-- Cara kerja: order QRIS dengan paket 0 = tiket. Saat lunas, server menerbitkan UNDANGAN uji coba (tabel gratis_undangan) terikat
-- ke Gmail pembeli dengan jumlah menit dari tabel tiket_coba. Pembeli memilih Gmail itu lewat Google -> timer 15 menit berjalan
-- (memakai mekanisme uji coba yang sudah ada: waktu dihitung server, sekali pakai, akun dikunci setelah klaim).
-- Ubah harga/menit/saklar kapan saja:  update tiket_coba set harga = 5000, menit = 15, aktif = true;

create table if not exists tiket_coba (
  id    int primary key default 1 check (id = 1),
  aktif boolean not null default true,
  harga bigint  not null default 5000 check (harga >= 1000),
  menit int     not null default 15 check (menit between 1 and 1440)
);
insert into tiket_coba (id) values (1) on conflict (id) do nothing;
alter table tiket_coba enable row level security;      -- tanpa policy: dibaca lewat tiket_info()

alter table order_qris add column if not exists menit int;
alter table order_qris add column if not exists kode  text;

create or replace function tiket_info() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('aktif', aktif, 'harga', harga, 'menit', menit) from tiket_coba where id = 1), jsonb_build_object('aktif', false))
$$;
revoke all on function tiket_info() from public;
grant execute on function tiket_info() to anon, authenticated;

-- 1) Order QRIS: cabang tiket (paket 0)
create or replace function qris_siapkan_order(p_email text, p_bulan int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text := lower(btrim(coalesce(p_email, ''))); h bigint; n bigint; pct int; r order_qris; oid text; tk tiket_coba;
begin
  if em !~ '^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$' or length(em) > 120 then return jsonb_build_object('ok', false, 'reason', 'email_tidak_valid'); end if;
  -- TIKET COBA (p_bulan = 0): harga & menit dari tabel tiket_coba, wajib Gmail
  if p_bulan = 0 then
    select * into tk from tiket_coba where id = 1;
    if not found or not tk.aktif then return jsonb_build_object('ok', false, 'reason', 'tiket_nonaktif'); end if;
    if gratis_norm_email(em) is null then return jsonb_build_object('ok', false, 'reason', 'wajib_gmail'); end if;
    select * into r from order_qris
     where order_qris.email = em and bulan = 0 and status = 'pending' and qr_string is not null
       and kedaluwarsa > now() + interval '2 minutes' and jumlah = tk.harga
     order by dibuat desc limit 1;
    if found then
      return jsonb_build_object('ok', true, 'baru', false, 'order_id', r.order_id, 'jumlah', r.jumlah, 'qr_string', r.qr_string, 'qr_url', r.qr_url,
                                'kedaluwarsa', r.kedaluwarsa, 'bulan', 0, 'diskon', 0);
    end if;
    if (select count(*) from order_qris where order_qris.email = em and status = 'pending' and dibuat > now() - interval '1 hour') >= 8 then
      return jsonb_build_object('ok', false, 'reason', 'terlalu_banyak');
    end if;
    update order_qris set status = 'expired' where order_qris.email = em and status = 'pending' and kedaluwarsa is not null and kedaluwarsa < now();
    oid := 'PQ-' || replace(gen_random_uuid()::text, '-', '');
    insert into order_qris(order_id, email, bulan, harga_normal, diskon, jumlah, menit) values (oid, em, 0, tk.harga, 0, tk.harga, tk.menit);
    return jsonb_build_object('ok', true, 'baru', true, 'order_id', oid, 'jumlah', tk.harga, 'bulan', 0, 'diskon', 0);
  end if;

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

-- 2) Lunas -> terbit undangan uji coba
create or replace function qris_terapkan(p_order_id text) returns text language plpgsql security definer set search_path = public as $$
declare o order_qris; uid uuid; r profiles; dasar date; akhir date; peran text; label text; gm text; k text;
begin
  select * into o from order_qris where order_id = p_order_id for update;
  if not found or o.status <> 'paid' or o.diterapkan then return coalesce(o.status, 'tidak_ada'); end if;

  -- TIKET COBA: bayar lunas -> terbit undangan uji coba (gratis_undangan) terikat ke Gmail pembeli; tidak mengubah akun/langganan
  if o.bulan = 0 then
    gm := gratis_norm_email(o.email);
    if gm is null then
      update order_qris set status = 'ditahan', catatan = 'tiket: email bukan Gmail, putuskan manual / refund' where order_id = o.order_id;
      return 'ditahan';
    end if;
    k := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    update auth.users set banned_until = null     -- akun uji coba lama (terkunci) dibuka agar bisa masuk lewat Google lagi
     where id in (select u.id from auth.users u join profiles p on p.id = u.id where p.role = 'trial' and gratis_norm_email(u.email) = gm);
    insert into gratis_undangan (kode, email, menit, berlaku_sampai, catatan)
      values (k, gm, greatest(1, least(1440, coalesce(o.menit, 15))), now() + interval '30 days', 'tiket QRIS ' || o.order_id);
    update order_qris set diterapkan = true, diterapkan_pada = now(), kode = k where order_id = o.order_id;
    begin insert into audit_log(road_id, action, by) values (null, 'qris-tiket:' || o.email || ':' || o.order_id, null); exception when others then null; end;
    return 'aktif';
  end if;

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

-- 3) Status order: sertakan kode tiket setelah lunas
create or replace function qris_status(p_order_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o order_qris; akun boolean;
begin
  select * into o from order_qris where order_id = p_order_id;
  if not found then return jsonb_build_object('status', 'tidak_ada'); end if;
  return jsonb_build_object('status', case when o.status = 'pending' and o.kedaluwarsa is not null and o.kedaluwarsa < now() then 'expired' else o.status end,
                            'jumlah', o.jumlah, 'bulan', o.bulan, 'menit', o.menit, 'kode', case when o.bulan = 0 and o.diterapkan then o.kode end, 'diterapkan', o.diterapkan, 'sampai', o.sampai, 'kedaluwarsa', o.kedaluwarsa);
end $$;

revoke all on function qris_siapkan_order(text, int), qris_terapkan(text) from public, anon, authenticated;
revoke all on function qris_status(text) from public;
grant execute on function qris_status(text) to anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function qris_siapkan_order(text, int), qris_status(text) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
select tiket_info();
