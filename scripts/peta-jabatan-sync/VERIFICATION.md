# Hasil Pemeriksaan

Pemeriksaan lokal 23 September 2026:

- 7 tes otomatis lulus: koordinat, label, angka negatif, garis, header matriks,
  batas chunk, teks literal, pembatasan penulisan, commit, dan kelanjutan update.
- 28 ekspor bagan lulus perbandingan nilai, koordinat, dan jumlah merge terhadap
  exporter Excel asli, untuk dua kelompok pegawai pada 14 jenis UKPD.
- Sudin Kota dilewati karena fixture CSV lokal tidak memiliki baris data.
- Pembacaan tabel matriks melalui browser lulus untuk header bertingkat dan
  angka dengan pemisah ribuan Indonesia.
- Screenshot bagan RSUD B diperiksa; artefak pengujian berada di
  `/tmp/peta-layout-verification`.
- Checksum enam file aplikasi/script lama identik dengan sebelum pekerjaan.

Pengujian memakai komponen sistem dan fixture lokal, bukan sesi aplikasi live.
Belum dilakukan: login exporter live, publikasi manifest baru, pemasangan Apps
Script pada spreadsheet tujuan, impor nyata, dan pemeriksaan visual Google Sheets.
Hasil ini tidak menyatakan spreadsheet tujuan sudah diperbarui atau identik piksel.

Langkah aktivasi tersedia di README.md. Sesi login yang sah diperlukan untuk
pengambilan ekspor live; export token CSV tidak menggantikan sesi login halaman.
