-- PETAQU: PILIHAN LANGGANAN & STATUS PENDAFTAR DARI HALAMAN DAFTAR
-- Jalankan di Supabase > SQL Editor SETELAH supabase-pendaftaran.sql dan supabase-langganan.sql. Aman dijalankan ulang.
--
-- Yang dilakukan:
--   1) Menyimpan pilihan pendaftar: status (instansi / perusahaan / pelajar / umum), lama langganan (bulan), tanggal mulai.
--   2) Admin melihat permintaan itu di panel; menu masa aktif otomatis terpilih sesuai permintaan.
--   3) Saat disetujui, masa aktif dihitung dari tanggal mulai yang dipilih (bila lebih baru dari hari ini), maksimal 120 bulan.
-- Catatan: ini PERMINTAAN pendaftar. Akses & tanggal berlaku sebenarnya tetap ditetapkan admin saat menyetujui.

alter table profiles add column if not exists status_pendaftar text;
alter table profiles add column if not exists paket_bulan      int;
alter table profiles add column if not exists mulai_tanggal    date;
alter table profiles drop constraint if exists profiles_status_pendaftar_check;
alter table profiles add  constraint profiles_status_pendaftar_check check (status_pendaftar is null or status_pendaftar in ('instansi','perusahaan','pelajar','umum'));
alter table profiles drop constraint if exists profiles_paket_bulan_check;
alter table profiles add  constraint profiles_paket_bulan_check check (paket_bulan is null or (paket_bulan between 1 and 120));

-- 1) Pendaftar baru: simpan juga status, lama langganan, tanggal mulai (tidak pernah menggagalkan pendaftaran) ----
create or replace function new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        v_nama text; v_inst text; v_hp text; v_tuj text; sk int := 0; sr text := null; dr domain_resmi; v_role text := 'pending';
        v_stat text; v_bln int; v_mulai date;
begin
  begin
    v_nama := left(btrim(coalesce(m->>'nama', m->>'full_name', m->>'name', '')), 80);
    v_inst := left(btrim(coalesce(m->>'instansi', '')), 100);
    v_hp   := left(regexp_replace(coalesce(m->>'hp', ''), '[^0-9]', '', 'g'), 16);
    v_tuj  := left(btrim(coalesce(m->>'tujuan', '')), 300);
    v_stat := lower(btrim(coalesce(m->>'status', '')));
    if v_stat not in ('instansi','perusahaan','pelajar','umum') then v_stat := null; end if;
    begin v_bln := (m->>'paket_bulan')::int; exception when others then v_bln := null; end;
    if v_bln is not null and (v_bln < 1 or v_bln > 120) then v_bln := null; end if;
    begin v_mulai := (m->>'mulai_tanggal')::date; exception when others then v_mulai := null; end;
    if v_mulai is not null and (v_mulai < hari_wib() - 1 or v_mulai > hari_wib() + 90) then v_mulai := null; end if;
    select n.skor, n.saran into sk, sr from nilai_pendaftar(new.email, v_nama, v_inst, v_hp) n;
    if new.email_confirmed_at is not null then
      select * into dr from domain_resmi where domain = lower(split_part(coalesce(new.email,''), '@', 2)) and auto;
      if found then v_role := dr.saran; end if;
    end if;
    insert into profiles(id, role, nama, instansi, hp, tujuan, skor, saran, status_pendaftar, paket_bulan, mulai_tanggal)
      values (new.id, v_role, nullif(v_nama,''), nullif(v_inst,''), nullif(v_hp,''), nullif(v_tuj,''), coalesce(sk,0), sr, v_stat, v_bln, v_mulai)
      on conflict (id) do nothing;
  exception when others then
    insert into profiles(id, role) values (new.id, 'pending') on conflict (id) do nothing;
  end;
  return new;
end $$;

-- 2) Daftar pengguna untuk admin + permintaan langganan ------------------------------------
drop function if exists admin_daftar_pengguna();
create or replace function admin_daftar_pengguna()
returns table(id uuid, email text, role text, provider text, created_at timestamptz, last_sign_in_at timestamptz, banned boolean,
              trial_dipakai boolean, nama text, instansi text, hp text, tujuan text, skor int, saran text, email_terkonfirmasi boolean,
              aktif_sampai date, jatuh_tempo date, paket text, tarif bigint, terakhir_bayar date,
              status_pendaftar text, paket_bulan int, mulai_tanggal date)
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
           (select max(b.tanggal) from pembayaran b where b.user_id = u.id),
           p.status_pendaftar, p.paket_bulan, p.mulai_tanggal
      from auth.users u left join profiles p on p.id = u.id
     order by (coalesce(p.role, 'pending') in ('pending','trial')) desc, coalesce(p.skor, 0) desc, u.created_at desc;
end $$;

-- 3) Setujui: masa aktif dihitung dari tanggal mulai pilihan pendaftar (bila di masa depan) -------
create or replace function admin_setujui(p_id uuid, p_role text default 'viewer', p_bulan int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text; akhir date; mulai date;
begin
  perform admin_cek();
  if p_role not in ('viewer','surveyor') then return jsonb_build_object('ok', false, 'reason', 'peran_tidak_valid'); end if;
  if p_bulan is not null and (p_bulan < 1 or p_bulan > 120) then return jsonb_build_object('ok', false, 'reason', 'durasi_tidak_valid'); end if;
  if exists (select 1 from profiles where id = p_id and role = 'admin') then return jsonb_build_object('ok', false, 'reason', 'akun_admin'); end if;
  select email into em from auth.users where id = p_id;
  if em is null then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
  insert into profiles(id, role) values (p_id, p_role) on conflict (id) do update set role = excluded.role;
  if p_bulan is not null then
    select greatest(hari_wib(), coalesce(mulai_tanggal, hari_wib())) into mulai from profiles where id = p_id;
    akhir := (mulai + make_interval(months => p_bulan))::date;
    update profiles set aktif_sampai = akhir, jatuh_tempo = akhir where id = p_id;
  end if;
  update auth.users set banned_until = null where id = p_id;
  insert into audit_log(road_id, action, by)
    values (null, 'setujui:' || em || ':' || p_role || coalesce(':' || p_bulan::text || 'bln', ''), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_setujui_banyak(p_ids uuid[], p_role text default 'viewer', p_bulan int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0; x uuid; em text; akhir date; mulai date;
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
      select greatest(hari_wib(), coalesce(mulai_tanggal, hari_wib())) into mulai from profiles where id = x;
      akhir := (mulai + make_interval(months => p_bulan))::date;
      update profiles set aktif_sampai = akhir, jatuh_tempo = akhir where id = x;
    end if;
    update auth.users set banned_until = null where id = x;
    insert into audit_log(road_id, action, by)
      values (null, 'setujui:' || em || ':' || p_role || coalesce(':' || p_bulan::text || 'bln', ''), auth.uid());
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'jumlah', n);
end $$;

-- 4) Hak akses (fungsi yang di-drop kehilangan grant-nya) ---------------------------------------
revoke all on function admin_daftar_pengguna() from public, anon;
revoke all on function admin_setujui(uuid, text, int) from public, anon;
revoke all on function admin_setujui_banyak(uuid[], text, int) from public, anon;
grant execute on function admin_daftar_pengguna() to authenticated;
grant execute on function admin_setujui(uuid, text, int) to authenticated;
grant execute on function admin_setujui_banyak(uuid[], text, int) to authenticated;
