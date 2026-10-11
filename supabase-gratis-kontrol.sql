-- PETAQU: KONTROL UJI COBA GRATIS oleh ADMIN (siapa pun selain admin tidak bisa melihat/mengubah pengaturannya).
-- Jalankan di Supabase > SQL Editor SETELAH supabase-trial.sql, supabase-akses-admin.sql (dan, bila dipakai,
-- supabase-langganan.sql / supabase-riwayat-pengguna.sql). Aman dijalankan ulang. Jalankan file ini PALING AKHIR.
--
-- Yang berubah:
--  * Uji coba gratis MATI secara bawaan. Hanya admin yang bisa menyalakannya (panel Persetujuan akses > tab "Kontrol Gratis").
--  * Lama gratis (menit) ditentukan admin, bukan lagi 10 menit tetap. Tiap klaim menyimpan menit saat klaim dibuat.
--  * Pengaman cerdas di server: kuota harian/total, batas pendaftar per jam (anti-lonjakan), batas per sidik perangkat,
--    jam buka harian (WIB), tanggal tutup otomatis, daftar blokir, tombol hentikan semua yang berjalan.
--  * Undangan khusus: admin membuat tautan/kode berisi menit sendiri (boleh untuk Gmail tertentu) walau gratis umum sedang mati.
--  * Pengguna biasa hanya bisa bertanya "tombol gratis perlu tampil atau tidak?" (jawaban hanya ya/tidak, tanpa angka apa pun).

-- 1) Tabel -------------------------------------------------------------------------------
create table if not exists gratis_config (
  id            int primary key default 1 check (id = 1),
  aktif         boolean not null default false,
  menit         int not null default 10 check (menit between 1 and 1440),
  kuota_harian  int check (kuota_harian is null or kuota_harian > 0),
  kuota_total   int check (kuota_total  is null or kuota_total  > 0),
  maks_per_jam  int check (maks_per_jam is null or maks_per_jam > 0),
  maks_per_fp   int not null default 1 check (maks_per_fp between 1 and 10),
  buka_sampai   timestamptz,
  jam_mulai     int check (jam_mulai  is null or jam_mulai  between 0 and 24),
  jam_selesai   int check (jam_selesai is null or jam_selesai between 0 and 24),
  pesan_habis   text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
insert into gratis_config (id, maks_per_jam) values (1, 30) on conflict (id) do nothing;

create table if not exists gratis_blokir (
  id      bigserial primary key,
  jenis   text not null check (jenis in ('email','device','fp')),
  nilai   text not null,
  alasan  text,
  dibuat  timestamptz not null default now(),
  unique (jenis, nilai)
);

create table if not exists gratis_undangan (
  kode            text primary key,
  email           text,                       -- Gmail ternormalisasi; kosong = siapa pun yang membuka tautan (terikat saat dipakai)
  menit           int not null check (menit between 1 and 1440),
  berlaku_sampai  timestamptz,
  catatan         text,
  dibuat          timestamptz not null default now(),
  dibuat_oleh     uuid,
  dipakai_at      timestamptz,
  dipakai_oleh    uuid
);
create index if not exists gratis_undangan_email_idx on gratis_undangan (email) where dipakai_at is null;

create table if not exists gratis_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  jenis   text not null,                      -- klaim | lanjut | tolak
  email   text,
  device  text,
  detail  jsonb not null default '{}'::jsonb
);
create index if not exists gratis_log_at_idx on gratis_log (at desc);

alter table gratis_config   enable row level security;   -- tanpa policy: tidak bisa diakses langsung lewat API
alter table gratis_blokir   enable row level security;
alter table gratis_undangan enable row level security;
alter table gratis_log      enable row level security;
revoke all on gratis_config, gratis_blokir, gratis_undangan, gratis_log from anon, authenticated;

alter table trial_claims add column if not exists menit      int     not null default 10;
alter table trial_claims add column if not exists sumber     text    not null default 'umum';
alter table trial_claims add column if not exists dihentikan boolean not null default false;

-- 2) Pembantu internal (tidak bisa dipanggil langsung dari browser) ---------------------------------
create or replace function gratis_norm_email(p text) returns text language sql immutable as $$
  select case
    when lower(coalesce(p, '')) ~ '^[a-z0-9._+-]+@(gmail|googlemail)\.com$'
     and length(replace(split_part(split_part(lower(p), '@', 1), '+', 1), '.', '')) >= 6
    then replace(split_part(split_part(lower(p), '@', 1), '+', 1), '.', '') || '@gmail.com'
  end
$$;

create or replace function gratis_tandai(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin   -- pendaftar baru (<10 menit) yang masih 'pending' ditandai 'trial' (perilaku lama); pengguna yang sudah disetujui tidak disentuh
  update profiles set role = 'trial'
   where id = p_uid and role = 'pending'
     and exists (select 1 from auth.users u where u.id = p_uid and u.created_at > now() - interval '10 minutes');
end $$;

-- Apakah gratis UMUM sedang dibuka? (aktif + jadwal + kuota + anti-lonjakan). Mengembalikan alasan internal saat tutup.
create or replace function gratis_tersedia() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c gratis_config; n int; jam int; hari0 timestamptz;
begin
  select * into c from gratis_config where id = 1;
  if not found or not c.aktif then return jsonb_build_object('ok', false, 'reason', 'nonaktif'); end if;
  if c.buka_sampai is not null and now() >= c.buka_sampai then return jsonb_build_object('ok', false, 'reason', 'ditutup'); end if;
  if c.jam_mulai is not null and c.jam_selesai is not null and c.jam_mulai <> c.jam_selesai then
    jam := extract(hour from (now() at time zone 'Asia/Jakarta'))::int;
    if c.jam_mulai < c.jam_selesai then
      if not (jam >= c.jam_mulai and jam < c.jam_selesai) then return jsonb_build_object('ok', false, 'reason', 'ditutup'); end if;
    else   -- melewati tengah malam, mis. 20 -> 6
      if not (jam >= c.jam_mulai or jam < c.jam_selesai) then return jsonb_build_object('ok', false, 'reason', 'ditutup'); end if;
    end if;
  end if;
  if c.kuota_total is not null then
    select count(*) into n from trial_claims where sumber = 'umum';
    if n >= c.kuota_total then return jsonb_build_object('ok', false, 'reason', 'kuota_habis'); end if;
  end if;
  if c.kuota_harian is not null then
    hari0 := date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
    select count(*) into n from trial_claims where sumber = 'umum' and started_at >= hari0;
    if n >= c.kuota_harian then return jsonb_build_object('ok', false, 'reason', 'kuota_habis'); end if;
  end if;
  if c.maks_per_jam is not null then
    select count(*) into n from trial_claims where sumber = 'umum' and started_at > now() - interval '1 hour';
    if n >= c.maks_per_jam then return jsonb_build_object('ok', false, 'reason', 'penuh'); end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 3) Untuk pengguna biasa: HANYA ya/tidak -------------------------------------------------------------
create or replace function gratis_publik(p_kode text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k text := upper(regexp_replace(coalesce(p_kode, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if coalesce((gratis_tersedia()->>'ok')::boolean, false) then return jsonb_build_object('on', true); end if;
  if length(k) >= 8 and exists (select 1 from gratis_undangan where kode = k and dipakai_at is null and (berlaku_sampai is null or berlaku_sampai > now())) then
    return jsonb_build_object('on', true);
  end if;
  return jsonb_build_object('on', false);
end $$;

-- Mengikat kode undangan ke Gmail yang baru dipilih lewat Google (dipanggil aplikasi sebelum klaim)
create or replace function gratis_tebus(p_kode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := upper(regexp_replace(coalesce(p_kode, ''), '[^A-Za-z0-9]', '', 'g')); e text; u gratis_undangan;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'no_auth'); end if;
  e := gratis_norm_email(auth.jwt()->>'email');
  if e is null then return jsonb_build_object('ok', false, 'reason', 'bad_email'); end if;
  select * into u from gratis_undangan where kode = k and dipakai_at is null and (berlaku_sampai is null or berlaku_sampai > now()) for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'undangan_tidak_berlaku'); end if;
  if u.email is not null and u.email <> e then return jsonb_build_object('ok', false, 'reason', 'bukan_pemilik'); end if;
  update gratis_undangan set email = e where kode = k;
  return jsonb_build_object('ok', true);
end $$;

-- 4) Klaim & status (menggantikan versi 10 menit tetap) ------------------------------------------------
create or replace function claim_trial_inner(uid uuid, j jsonb, p_device text, p_fp text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e text; r trial_claims; rem int; c gratis_config; iv gratis_undangan; t jsonb; mnt int; sm text := 'umum'; n int;
begin
  e := gratis_norm_email(j->>'email');
  if coalesce(j->'app_metadata'->>'provider', '') <> 'google' or e is null then
    perform gratis_tandai(uid); return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;
  if length(coalesce(p_device, '')) < 16 or length(coalesce(p_fp, '')) < 16 then
    perform gratis_tandai(uid); return jsonb_build_object('ok', false, 'reason', 'bad_device');
  end if;

  if exists (select 1 from gratis_blokir b where (b.jenis = 'email' and b.nilai = e) or (b.jenis = 'device' and b.nilai = p_device) or (b.jenis = 'fp' and b.nilai = p_fp)) then
    return jsonb_build_object('ok', false, 'reason', 'diblokir');     -- tidak ditandai/dikunci: akun tetap 'pending'
  end if;

  select * into c from gratis_config where id = 1;
  select * into iv from gratis_undangan where email = e and dipakai_at is null and (berlaku_sampai is null or berlaku_sampai > now()) order by dibuat desc limit 1 for update;

  if found then                                   -- undangan admin: mulai segar, tidak terkena kuota/anti-lonjakan
    delete from trial_claims where email = e or device_id = p_device;
    mnt := iv.menit; sm := 'undangan';
    update gratis_undangan set dipakai_at = now(), dipakai_oleh = uid where kode = iv.kode;
  else
    select * into r from trial_claims where device_id = p_device;
    if found then                                 -- perangkat sama: lanjutkan sisa waktu / tolak bila habis atau dihentikan admin
      perform gratis_tandai(uid);
      rem := case when r.dihentikan then 0 else greatest(0, r.menit * 60 - floor(extract(epoch from (now() - r.started_at)))::int) end;
      if rem <= 0 then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
      return jsonb_build_object('ok', true, 'remaining', rem, 'durasi', r.menit * 60);
    end if;
    t := gratis_tersedia();
    if not coalesce((t->>'ok')::boolean, false) then return t; end if;   -- nonaktif / ditutup / kuota_habis / penuh (akun tidak dikunci)
    perform gratis_tandai(uid);
    if exists (select 1 from trial_claims where email = e) then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
    select count(*) into n from trial_claims where fp = p_fp;
    if n >= greatest(1, coalesce(c.maks_per_fp, 1)) then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
    mnt := c.menit;
  end if;

  perform gratis_tandai(uid);
  insert into trial_claims (email, device_id, fp, menit, sumber) values (e, p_device, p_fp, mnt, sm);
  return jsonb_build_object('ok', true, 'remaining', mnt * 60, 'durasi', mnt * 60);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'used');
end $$;

create or replace function claim_trial_g(p_device text, p_fp text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); res jsonb; had boolean; jns text; em text := auth.jwt()->>'email';
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'no_auth'); end if;
  had := exists (select 1 from trial_claims where device_id = p_device);
  res := claim_trial_inner(uid, auth.jwt(), p_device, p_fp);
  perform kunci_trial(uid);          -- hanya menyentuh akun ber-peran 'trial'
  if coalesce((res->>'ok')::boolean, false) then jns := case when had then 'trial_lanjut' else 'trial_klaim' end; else jns := 'trial_ditolak'; end if;
  begin
    insert into gratis_log (jenis, email, device, detail)
    values (case jns when 'trial_klaim' then 'klaim' when 'trial_lanjut' then 'lanjut' else 'tolak' end, lower(em), left(p_device, 64),
            jsonb_build_object('alasan', res->>'reason', 'sisa', res->'remaining', 'fp', left(coalesce(p_fp, ''), 8)));
  exception when others then null;
  end;
  begin   -- riwayat pengguna (supabase-riwayat-pengguna.sql) bila terpasang
    perform catat_riwayat(jns, uid, em, p_device, jsonb_build_object('alasan', res->>'reason', 'sisa', res->'remaining', 'fp', left(coalesce(p_fp, ''), 8)));
  exception when others then null;
  end;
  return res;
end $$;

create or replace function trial_status(p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r trial_claims; rem int; ps text;
begin
  select * into r from trial_claims where device_id = p_device;
  if not found then return jsonb_build_object('ok', false, 'reason', 'none'); end if;
  rem := case when r.dihentikan then 0 else greatest(0, r.menit * 60 - floor(extract(epoch from (now() - r.started_at)))::int) end;
  select pesan_habis into ps from gratis_config where id = 1;
  return jsonb_build_object('ok', rem > 0, 'remaining', rem, 'durasi', r.menit * 60,
                            'reason', case when rem > 0 then 'active' else 'expired' end,
                            'pesan', case when rem > 0 then null else ps end);
end $$;

-- 5) Fungsi ADMIN (admin_cek() menolak siapa pun yang bukan admin; dicek di server) --------------------
create or replace function admin_gratis_ambil() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c gratis_config; hari0 timestamptz := date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'; st jsonb; kl jsonb; un jsonb; bl jsonb; jam jsonb;
begin
  perform admin_cek();
  delete from gratis_log where at < now() - interval '60 days';
  select * into c from gratis_config where id = 1;

  select coalesce(jsonb_agg(coalesce(x.n, 0) order by g.h), '[]'::jsonb) into jam
    from generate_series(0, 23) g(h)
    left join (select floor(extract(epoch from (now() - started_at)) / 3600)::int h, count(*) n
                 from trial_claims where started_at > now() - interval '24 hours' group by 1) x on x.h = g.h;

  select jsonb_build_object(
    'hari_ini',   (select count(*) from trial_claims where started_at >= hari0),
    'hari_ini_umum', (select count(*) from trial_claims where started_at >= hari0 and sumber = 'umum'),
    'total_umum', (select count(*) from trial_claims where sumber = 'umum'),
    'tujuh_hari', (select count(*) from trial_claims where started_at > now() - interval '7 days'),
    'total',      (select count(*) from trial_claims),
    'berjalan',   (select count(*) from trial_claims where not dihentikan and started_at + make_interval(mins => menit) > now()),
    'jam_ini',    (select count(*) from trial_claims where sumber = 'umum' and started_at > now() - interval '1 hour'),
    'ditolak_24j',(select count(*) from gratis_log where jenis = 'tolak' and at > now() - interval '24 hours'),
    'alasan_24j', (select coalesce(jsonb_object_agg(a, n), '{}'::jsonb) from (select coalesce(detail->>'alasan', '?') a, count(*) n from gratis_log where jenis = 'tolak' and at > now() - interval '24 hours' group by 1) z),
    'konversi',   (select count(*) from trial_claims k where exists (select 1 from auth.users u join profiles p on p.id = u.id where p.role in ('viewer','surveyor') and gratis_norm_email(u.email) = k.email)),
    'fp_ganda',   (select count(*) from (select fp from trial_claims group by fp having count(*) > 1) q),
    'per_jam',    jam
  ) into st;

  select coalesce(jsonb_agg(x order by (x->>'mulai') desc), '[]'::jsonb) into kl from (
    select jsonb_build_object(
      'id', k.id, 'email', k.email, 'dev', left(k.device_id, 8), 'fp', left(k.fp, 8), 'mulai', k.started_at, 'menit', k.menit, 'sumber', k.sumber,
      'dihentikan', k.dihentikan,
      'sisa', case when k.dihentikan then 0 else greatest(0, k.menit * 60 - floor(extract(epoch from (now() - k.started_at)))::int) end,
      'fp_ganda', (select count(*) from trial_claims k2 where k2.fp = k.fp and k2.id <> k.id),
      'blok', exists (select 1 from gratis_blokir b where (b.jenis = 'email' and b.nilai = k.email) or (b.jenis = 'device' and b.nilai = k.device_id) or (b.jenis = 'fp' and b.nilai = k.fp)),
      'konversi', exists (select 1 from auth.users u join profiles p on p.id = u.id where p.role in ('viewer','surveyor') and gratis_norm_email(u.email) = k.email)
    ) x from trial_claims k order by k.started_at desc limit 40) s;

  select coalesce(jsonb_agg(jsonb_build_object('kode', g.kode, 'email', g.email, 'menit', g.menit, 'berlaku_sampai', g.berlaku_sampai, 'catatan', g.catatan,
                                               'dibuat', g.dibuat, 'dipakai_at', g.dipakai_at, 'dipakai_oleh', u.email) order by g.dibuat desc), '[]'::jsonb) into un
    from (select * from gratis_undangan order by dibuat desc limit 50) g left join auth.users u on u.id = g.dipakai_oleh;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'jenis', b.jenis, 'nilai', b.nilai, 'alasan', b.alasan, 'dibuat', b.dibuat) order by b.dibuat desc), '[]'::jsonb) into bl from gratis_blokir b;

  return jsonb_build_object('config', to_jsonb(c), 'tersedia', gratis_tersedia(), 'stat', st, 'klaim', kl, 'undangan', un, 'blokir', bl, 'sekarang', now());
end $$;

create or replace function admin_gratis_simpan(p_cfg jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c gratis_config; v text;
begin
  perform admin_cek();
  select * into c from gratis_config where id = 1 for update;
  if p_cfg ? 'aktif' then c.aktif := coalesce((p_cfg->>'aktif')::boolean, false); end if;
  if p_cfg ? 'menit' then c.menit := greatest(1, least(1440, coalesce((p_cfg->>'menit')::int, c.menit))); end if;
  if p_cfg ? 'kuota_harian' then c.kuota_harian := nullif(greatest(0, coalesce((p_cfg->>'kuota_harian')::int, 0)), 0); end if;
  if p_cfg ? 'kuota_total'  then c.kuota_total  := nullif(greatest(0, coalesce((p_cfg->>'kuota_total')::int, 0)), 0); end if;
  if p_cfg ? 'maks_per_jam' then c.maks_per_jam := nullif(greatest(0, coalesce((p_cfg->>'maks_per_jam')::int, 0)), 0); end if;
  if p_cfg ? 'maks_per_fp'  then c.maks_per_fp  := greatest(1, least(10, coalesce((p_cfg->>'maks_per_fp')::int, 1))); end if;
  if p_cfg ? 'buka_sampai'  then c.buka_sampai  := nullif(p_cfg->>'buka_sampai', '')::timestamptz; end if;
  if p_cfg ? 'jam_mulai'    then v := nullif(p_cfg->>'jam_mulai', '');   c.jam_mulai   := case when v is null then null else greatest(0, least(24, v::int)) end; end if;
  if p_cfg ? 'jam_selesai'  then v := nullif(p_cfg->>'jam_selesai', ''); c.jam_selesai := case when v is null then null else greatest(0, least(24, v::int)) end; end if;
  if p_cfg ? 'pesan_habis'  then c.pesan_habis := left(nullif(trim(coalesce(p_cfg->>'pesan_habis', '')), ''), 240); end if;
  update gratis_config set aktif = c.aktif, menit = c.menit, kuota_harian = c.kuota_harian, kuota_total = c.kuota_total, maks_per_jam = c.maks_per_jam,
         maks_per_fp = c.maks_per_fp, buka_sampai = c.buka_sampai, jam_mulai = c.jam_mulai, jam_selesai = c.jam_selesai, pesan_habis = c.pesan_habis,
         updated_at = now(), updated_by = auth.uid()
   where id = 1;
  insert into audit_log(road_id, action, by) values (null, 'gratis_simpan:' || case when c.aktif then 'ON' else 'OFF' end || ':' || c.menit || 'mnt', auth.uid());
  return jsonb_build_object('ok', true, 'tersedia', gratis_tersedia());
end $$;

create or replace function admin_gratis_undang(p_email text default null, p_menit int default 10, p_hari int default 7, p_catatan text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e text := null; k text; mnt int := greatest(1, least(1440, coalesce(p_menit, 10)));
begin
  perform admin_cek();
  if coalesce(trim(p_email), '') <> '' then
    e := gratis_norm_email(trim(p_email));
    if e is null then return jsonb_build_object('ok', false, 'reason', 'email_tidak_valid'); end if;
    delete from trial_claims where email = e;                        -- beri jatah baru
    update auth.users set banned_until = null                          -- akun uji coba lama dibuka kuncinya
     where id in (select u.id from auth.users u join profiles p on p.id = u.id where p.role = 'trial' and gratis_norm_email(u.email) = e);
  end if;
  k := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into gratis_undangan (kode, email, menit, berlaku_sampai, catatan, dibuat_oleh)
  values (k, e, mnt, case when coalesce(p_hari, 0) > 0 then now() + make_interval(days => least(p_hari, 365)) end, left(nullif(trim(coalesce(p_catatan, '')), ''), 120), auth.uid());
  insert into audit_log(road_id, action, by) values (null, 'gratis_undang:' || coalesce(e, 'tautan') || ':' || mnt || 'mnt', auth.uid());
  return jsonb_build_object('ok', true, 'kode', k);
end $$;

create or replace function admin_gratis_cabut_undangan(p_kode text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform admin_cek();
  delete from gratis_undangan where kode = upper(regexp_replace(coalesce(p_kode, ''), '[^A-Za-z0-9]', '', 'g')) and dipakai_at is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_gratis_blokir(p_jenis text default 'email', p_nilai text default null, p_klaim bigint default null, p_alasan text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k trial_claims; v text; j text := coalesce(p_jenis, 'email');
begin
  perform admin_cek();
  if j not in ('email','device','fp') then return jsonb_build_object('ok', false, 'reason', 'jenis_tidak_valid'); end if;
  if p_klaim is not null then
    select * into k from trial_claims where id = p_klaim;
    if not found then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
    v := case j when 'email' then k.email when 'device' then k.device_id else k.fp end;
  else
    v := lower(trim(coalesce(p_nilai, '')));
    if j = 'email' then v := gratis_norm_email(v); end if;
  end if;
  if v is null or v = '' then return jsonb_build_object('ok', false, 'reason', 'nilai_kosong'); end if;
  insert into gratis_blokir (jenis, nilai, alasan) values (j, v, left(nullif(trim(coalesce(p_alasan, '')), ''), 120)) on conflict (jenis, nilai) do nothing;
  update trial_claims set dihentikan = true where (j = 'email' and email = v) or (j = 'device' and device_id = v) or (j = 'fp' and fp = v);
  insert into audit_log(road_id, action, by) values (null, 'gratis_blokir:' || j, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_gratis_buka_blokir(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform admin_cek();
  delete from gratis_blokir where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Beri jatah ulang untuk satu klaim (hapus klaim + buka kunci akun uji cobanya)
create or replace function admin_gratis_reset(p_klaim bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k trial_claims;
begin
  perform admin_cek();
  select * into k from trial_claims where id = p_klaim;
  if not found then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
  delete from trial_claims where id = p_klaim;
  update auth.users set banned_until = null
   where id in (select u.id from auth.users u join profiles p on p.id = u.id where p.role = 'trial' and gratis_norm_email(u.email) = k.email);
  insert into audit_log(road_id, action, by) values (null, 'gratis_reset:' || k.email, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Hentikan uji coba yang sedang berjalan (satu klaim, atau semuanya bila p_klaim kosong). Berlaku di perangkat paling lambat ~1 menit.
create or replace function admin_gratis_hentikan(p_klaim bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_cek();
  update trial_claims set dihentikan = true
   where not dihentikan and started_at + make_interval(mins => menit) > now() and (p_klaim is null or id = p_klaim);
  get diagnostics n = row_count;
  insert into audit_log(road_id, action, by) values (null, 'gratis_hentikan:' || n, auth.uid());
  return jsonb_build_object('ok', true, 'jumlah', n);
end $$;

-- 6) Hak akses --------------------------------------------------------------------------------------
revoke all on function gratis_norm_email(text)  from public, anon, authenticated;
revoke all on function gratis_tandai(uuid)       from public, anon, authenticated;
revoke all on function gratis_tersedia()         from public, anon, authenticated;
revoke all on function claim_trial_inner(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function gratis_publik(text)       from public;
revoke all on function gratis_tebus(text)        from public, anon;
revoke all on function claim_trial_g(text, text) from public, anon;
revoke all on function trial_status(text)        from public;
grant execute on function gratis_publik(text)       to anon, authenticated;
grant execute on function gratis_tebus(text)        to authenticated;
grant execute on function claim_trial_g(text, text) to authenticated;
grant execute on function trial_status(text)        to anon, authenticated;

revoke all on function admin_gratis_ambil()                                  from public, anon;
revoke all on function admin_gratis_simpan(jsonb)                            from public, anon;
revoke all on function admin_gratis_undang(text, int, int, text)             from public, anon;
revoke all on function admin_gratis_cabut_undangan(text)                     from public, anon;
revoke all on function admin_gratis_blokir(text, text, bigint, text)         from public, anon;
revoke all on function admin_gratis_buka_blokir(bigint)                      from public, anon;
revoke all on function admin_gratis_reset(bigint)                            from public, anon;
revoke all on function admin_gratis_hentikan(bigint)                         from public, anon;
grant execute on function admin_gratis_ambil()                               to authenticated;
grant execute on function admin_gratis_simpan(jsonb)                         to authenticated;
grant execute on function admin_gratis_undang(text, int, int, text)          to authenticated;
grant execute on function admin_gratis_cabut_undangan(text)                  to authenticated;
grant execute on function admin_gratis_blokir(text, text, bigint, text)      to authenticated;
grant execute on function admin_gratis_buka_blokir(bigint)                   to authenticated;
grant execute on function admin_gratis_reset(bigint)                         to authenticated;
grant execute on function admin_gratis_hentikan(bigint)                      to authenticated;

-- 7) Halaman "riwayat gratis" admin (bila supabase-riwayat-pengguna.sql terpasang): ikut memakai menit per klaim, bukan 600 detik tetap
do $do$
begin
  if to_regclass('public.riwayat_akses') is not null and to_regproc('hari_wib') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'aktif_sampai') then
    execute $fn$
create or replace function admin_riwayat_gratis()
returns table(email text, nama text, instansi text, hp text, user_id uuid, device_id text, fp text, mulai timestamptz, status text, role text,
              sisa_detik int, ditolak int, ditolak_terakhir timestamptz, klaim_se_perangkat int,
              jenis text, os text, browser text, model text, kota text, provinsi text, negara text,
              akun_ada boolean, dikonversi_pada timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query
    select c.email, coalesce(p.nama, nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', '')),
           p.instansi, p.hp, u.id, c.device_id, c.fp, c.started_at,
           case when u.id is null then 'akun_dihapus'
                when p.role = 'blocked' then 'diblokir'
                when p.role in ('viewer','surveyor','admin') and p.aktif_sampai is not null and p.aktif_sampai < hari_wib() then 'berlangganan_berakhir'
                when p.role in ('viewer','surveyor','admin') then 'berlangganan'
                when not c.dihentikan and c.started_at > now() - make_interval(mins => c.menit) then 'berjalan'
                else 'habis' end,
           coalesce(p.role, case when u.id is null then 'dihapus' else 'pending' end),
           (case when c.dihentikan then 0 else greatest(0, c.menit * 60 - floor(extract(epoch from (now() - c.started_at)))::int) end),
           (select count(*)::int from riwayat_akses x
             where x.jenis = 'trial_ditolak'
               and (replace(split_part(split_part(lower(coalesce(x.email, '')), '@', 1), '+', 1), '.', '') || '@gmail.com' = c.email
                    or x.device_id = c.device_id or x.detail->>'fp' = left(c.fp, 8))),
           (select max(x.at) from riwayat_akses x
             where x.jenis = 'trial_ditolak'
               and (replace(split_part(split_part(lower(coalesce(x.email, '')), '@', 1), '+', 1), '.', '') || '@gmail.com' = c.email
                    or x.device_id = c.device_id or x.detail->>'fp' = left(c.fp, 8))),
           (select count(*)::int from trial_claims c2 where c2.fp = c.fp and c2.id <> c.id),
           i.detail->>'jenis', i.detail->>'os', i.detail->>'browser', i.detail->>'model',
           i.detail->>'kota', i.detail->>'provinsi', i.detail->>'negara',
           (u.id is not null),
           (select min(x.at) from riwayat_akses x
             where x.user_id = u.id and x.jenis = 'peran' and x.detail->>'ke' in ('viewer','surveyor') and x.at >= c.started_at)
      from trial_claims c
      left join lateral (select uu.* from auth.users uu
                          where replace(split_part(split_part(lower(uu.email), '@', 1), '+', 1), '.', '') || '@gmail.com' = c.email
                          order by uu.created_at limit 1) u on true
      left join profiles p on p.id = u.id
      left join lateral (select x.detail from riwayat_akses x
                          where x.jenis = 'trial_info' and x.device_id = c.device_id order by x.at desc limit 1) i on true
     order by c.started_at desc;
end $$;
    $fn$;
    execute 'revoke all on function admin_riwayat_gratis() from public, anon';
    execute 'grant execute on function admin_riwayat_gratis() to authenticated';
  end if;
end $do$;

notify pgrst, 'reload schema';

-- Cek cepat (hasil hanya terlihat di SQL Editor): gratis harus MATI sampai admin menyalakannya
select aktif, menit, kuota_harian, maks_per_jam, maks_per_fp from gratis_config;
