# Aturan Import Excel Pegawai

Gunakan halaman `Import Excel Pegawai` untuk mengunduh template resmi dan mengupload file yang sudah diisi.

## Sheet Yang Dipakai

- Sistem hanya membaca sheet `Pegawai`.
- Sheet `Contoh`, `Aturan`, dan `Referensi` hanya untuk panduan.
- Baris pertama pada sheet `Pegawai` adalah nama kolom teknis dan tidak boleh diubah.

## Kolom Wajib

- `nama`
- `nama_ukpd`
- `jenis_pegawai`

## Kunci Update

Sistem mencari data lama dengan urutan berikut:

1. `id_pegawai`
2. `nip`
3. `nrk`
4. `nik`

Jika tidak ditemukan, sistem membuat pegawai baru. Kolom kosong pada update tidak menghapus nilai lama.

## Format Nilai

- Tanggal memakai format `YYYY-MM-DD`, contoh `2024-01-31`.
- `nama_ukpd` harus sama dengan referensi UKPD aktif di sistem.
- `jenis_pegawai` harus salah satu dari `PNS`, `CPNS`, `PPPK`, `PPPK Paruh Waktu`, `NON PNS`, `PJLP`.
- `agama`, `jenis_kontrak`, dan `pangkat_golongan` mengikuti sheet `Referensi` pada template.
- Kolom referensi di sheet `Pegawai` sudah diberi dropdown validasi. Sumber daftar tetap berada di sheet `Referensi`.
- Import Excel ini hanya untuk data utama pegawai. Alamat, keluarga, dan riwayat detail tetap memakai form profil atau import DRH.
