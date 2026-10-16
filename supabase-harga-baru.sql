-- PETAQU — harga baru (1 bulan Rp 99.900). Jalankan SEKALI di Supabase → SQL Editor. Berlaku untuk order berikutnya.
-- Pembulatan diubah dari Rp 1.000 → Rp 100 (kalau tidak, 99.900 akan terbulat jadi 100.000).
create or replace function qris_hitung_harga(p_bulan int, p_email text) returns bigint language sql stable security definer set search_path = public as $$
  select (round(h.harga * (100 - qris_persen_diskon(p_email)) / 100.0 / 100.0) * 100)::bigint
    from harga_langganan h where h.bulan = p_bulan and h.aktif
$$;

insert into harga_langganan(bulan, harga, label) values
  (1,    99900, '1 bulan'),
  (3,   269900, '3 bulan'),     -- ±89.967/bln, hemat 10%
  (6,   499900, '6 bulan'),     -- ±83.317/bln, hemat 17%
  (12,  899900, '1 tahun'),     -- ±74.992/bln, hemat 25%
  (24, 1599900, '2 tahun'),     -- ±66.663/bln, hemat 33%
  (36, 2199900, '3 tahun')      -- ±61.108/bln, hemat 39%
on conflict (bulan) do update set harga = excluded.harga, label = excluded.label, aktif = true;

notify pgrst, 'reload schema';
select * from qris_harga(null);
