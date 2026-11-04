# Alur dan Proses Usulan Kenaikan Pangkat End-to-End

Dokumen ini menjelaskan alur operasional modul Usulan Kenaikan Pangkat pada aplikasi SMART SDMK, mulai dari persiapan master data, pembuatan draft oleh UKPD, pemeriksaan dokumen, Smart Validation, rekap periode, pengiriman ke BKD/BKN, sampai SK terbit dan usulan selesai.

## Sumber yang Dibaca

- `docs/KENAIKAN_PANGKAT_DESIGN.md`
- `prisma/migrations/202609110001_promotion/migration.sql`
- `src/lib/promotion/policy.js`
- `src/lib/promotion/workflow.js`
- `src/lib/promotion/service.js`
- `src/lib/promotion/eligibility.js`
- `src/lib/promotion/documents.js`
- `src/lib/promotion/reader.js`
- `src/lib/promotion/repository.js`
- `src/lib/promotion/export.js`
- `src/app/(app)/usulan/kenaikan-pangkat/page.jsx`
- `src/app/(app)/usulan/kenaikan-pangkat/pengaturan/page.jsx`
- `src/app/(app)/usulan/kenaikan-pangkat/rekap/page.jsx`
- `src/components/promotion/PromotionDetail.jsx`

Catatan: dokumen desain menyebut sumber eksternal `petunjuk tambah usulan kenaikan pangkat.docx`, tetapi file tersebut tidak ditemukan di workspace ini. Penjelasan di bawah disusun dari dokumen desain dan implementasi yang tersedia di repository.

## Tujuan Modul

Modul Kenaikan Pangkat dibuat untuk mengelola proses usulan PNS secara terstruktur, terdokumentasi, dan dapat diaudit. Sistem tidak hanya menyimpan daftar usulan, tetapi juga mengikat setiap usulan pada periode, jenis kenaikan pangkat, pegawai, UKPD pemilik, kewenangan verifikasi, dokumen persyaratan, hasil pembacaan dokumen, hasil Smart Validation, riwayat workflow, batch rekap, serta catatan pengembalian dari BKD/BKN.

Prinsip utama modul:

- UKPD hanya dapat membuat dan memperbaiki usulan pegawai pada UKPD sendiri.
- Verifikator hanya dapat memproses usulan sesuai wilayah dan kewenangan.
- Status tidak dapat diubah sembarang dari frontend; server menentukan transisi yang sah.
- Dokumen disimpan private, harus PDF, dibatasi ukuran, dipindai lokal, lalu dibaca text/OCR lokal.
- Hasil validasi harus terkini terhadap data, dokumen, dan konfigurasi kebijakan.
- Warning harus diakui oleh verifikator dengan alasan sebelum proses diteruskan.
- Semua aksi penting dicatat di timeline dan audit log.

## Aktor dan Peran

### Admin UKPD

Admin UKPD adalah pengusul utama. Aksesnya dibatasi ke UKPD sendiri.

Tanggung jawab:

- Mencari PNS pada UKPD sendiri.
- Membuat draft usulan.
- Memilih periode, jenis kenaikan pangkat, dan pangkat usulan.
- Mengunggah dokumen persyaratan.
- Mengajukan usulan ke verifikator.
- Memperbaiki usulan yang dikembalikan.
- Mengunduh paket dokumen untuk usulan yang dapat diakses.

Kemampuan teknis default:

- `read_own`
- `create`
- `edit`

### Admin Wilayah / Sudin

Admin Wilayah memverifikasi usulan yang berada dalam kewenangan SUDIN sesuai wilayahnya.

Tanggung jawab:

- Melihat usulan wilayah sendiri dengan authority `SUDIN`.
- Memeriksa dokumen dan hasil ekstraksi.
- Menjalankan Smart Validation.
- Memberikan acknowledgement atas warning.
- Mengembalikan usulan ke UKPD bila perlu perbaikan.
- Menyetujui verifikasi SUDIN.
- Membuat batch rekap untuk usulan yang siap.

Kemampuan teknis default:

- `read_region`
- `verify_sudin`
- `recap_sudin`

### Super Admin / Dinas

Super Admin memiliki akses penuh untuk monitoring, verifikasi DINKES, rekap DINKES, dan konfigurasi master modul.

Tanggung jawab:

- Mengatur periode, deadline, jenis KP, dokumen persyaratan, rule, angka kredit, organisasi, dan permission.
- Memverifikasi usulan authority `DINKES`.
- Melakukan monitoring lintas UKPD.
- Membuat rekap Dinas.
- Mencatat proses lanjutan ke BKD/BKN, persetujuan, SK terbit, dan selesai.

Kemampuan teknis default:

- `read_all`
- `verify_dinkes`
- `recap_dinkes`
- `configure`

## Data Master yang Harus Siap

Sebelum proses berjalan, pengelola harus memastikan master berikut sudah benar.

### Master Pegawai

Data pegawai menjadi dasar usulan. Pegawai harus:

- Berstatus PNS.
- Memiliki UKPD yang dapat dikenali sistem.
- Memiliki pangkat/golongan terakhir.
- Memiliki TMT pangkat terakhir.
- Memiliki jabatan.
- Memiliki wilayah/authority yang dapat ditentukan.

Field penting yang dipakai sistem:

- `id_pegawai`
- `nama`
- `nip`
- `nrk`
- `jenis_pegawai`
- `nama_ukpd`
- `ukpd_id` atau `id_ukpd`
- `wilayah`
- `pangkat_golongan`
- `tmt_pangkat_terakhir`
- `jenjang_pendidikan`
- `jabatan`
- `status_rumpun`
- `struktur_atasan_langsung`
- `tmt_jabatan`

### Master Organisasi KP

Master organisasi menghubungkan UKPD dengan kategori dan alur verifikasi. Sistem mengenal:

- `DINAS`
- `SUDIN`
- `PUSKESMAS`
- `UPT`
- `RSUD`

Untuk RSUD, kelas rumah sakit wajib diisi. Untuk alur SUDIN, wilayah wajib tersedia. Alur pemeriksaan ditentukan oleh `promotion_verification_authority`:

- `SUDIN`: diperiksa oleh Admin Wilayah/Sudin sesuai wilayah.
- `DINKES`: diperiksa oleh Super Admin/Dinas.

### Master Periode

Periode menentukan bulan dan tanggal efektif kenaikan pangkat. Pada schema, tanggal efektif harus tanggal 1 sesuai tahun dan bulan periode.

Status periode:

- `DRAFT`: belum dibuka.
- `OPEN`: dapat dipakai untuk pengajuan jika seluruh deadline lengkap.
- `CLOSED`: tidak menerima pengajuan baru.

Deadline yang wajib lengkap saat periode dibuka:

- `submission_start`
- `submission_end`
- `ukpd_deadline`
- `sudin_deadline`
- `dinkes_deadline`

Untuk Admin UKPD, periode hanya dapat dipakai bila status `OPEN` dan waktu saat ini berada di antara `submission_start` sampai batas yang lebih awal antara `submission_end` dan `ukpd_deadline`.

### Master Jenis Kenaikan Pangkat

Jenis awal yang disediakan migration:

- `REGULER` - Reguler
- `JF` - Jabatan Fungsional
- `STRUKTURAL` - Struktural
- `IJAZAH` - Penyesuaian Ijazah
- `LAINNYA` - Pilihan / lainnya

Konfigurasi jenis KP memuat status kebijakan dan parameter seperti masa minimal pangkat dan ambang confidence pembacaan dokumen. Jika konfigurasi belum sah, statusnya tetap `REQUIRES_POLICY_CONFIGURATION`.

### Master Dokumen Persyaratan

Dokumen awal yang disediakan:

- `SK_PANGKAT` - SK Pangkat terakhir
- `SK_JABATAN` - SK Jabatan
- `PAK` - SK PAK / SK Konversi Angka Kredit
- `KONVERSI_AK` - Konversi Angka Kredit
- `SKP` - SKP
- `IJAZAH` - Ijazah
- `TRANSKRIP` - Transkrip
- `UJIAN_DINAS` - Ujian Dinas
- `PENYESUAIAN_IJAZAH` - Penyesuaian Ijazah
- `PENDUKUNG` - Dokumen pendukung
- `SK_KP_TERBIT` - SK Kenaikan Pangkat terbit

Dokumen dapat dibuat wajib atau tidak wajib berdasarkan selector. Selector bisa membatasi dokumen hanya untuk jenis KP, kategori jabatan, jabatan, pangkat, jenjang, atau periode tertentu.

### Master Rule dan Angka Kredit

Rule awal yang tersedia:

- `KP-001`: NIP dokumen sama dengan pegawai.
- `KP-002`: TMT pangkat sesuai master.
- `KP-003`: Jabatan sesuai master.
- `KP-004`: Pangkat lama sesuai master.
- `KP-005`: Transisi pangkat sesuai ketentuan.
- `KP-006`: SKP memenuhi ketentuan.
- `KP-007`: Dokumen wajib lengkap.
- `KP-008`: PAK milik pegawai yang diusulkan.
- `KP-009`: Jenjang konsisten lintas dokumen.
- `KP-010`: Periode PAK tidak overlap.
- `KP-011`: Angka kredit memenuhi aturan.
- `KP-012`: TMT jabatan konsisten.
- `KP-013`: Dokumen relevan terhadap periode.

Beberapa rule bersifat konfiguratif dan tidak boleh dianggap sah sebelum pejabat/pengelola menetapkan parameter kebijakan yang benar. Contohnya transisi pangkat, SKP, overlap PAK, angka kredit, dan rentang relevansi dokumen.

## Status Usulan

Status yang digunakan dalam modul:

- `DRAFT`
- `DIAJUKAN_UKPD`
- `MENUNGGU_VERIFIKASI_SUDIN`
- `MENUNGGU_VERIFIKASI_DINKES`
- `SMART_VALIDATION`
- `DIVERIFIKASI_SUDIN`
- `DIVERIFIKASI_DINKES`
- `SIAP_DIUSULKAN`
- `MASUK_REKAP_PERIODE`
- `DIUSULKAN_KE_BKD`
- `PERBAIKAN_BKD`
- `DIUSULKAN_KE_BKN`
- `PERBAIKAN_BKN`
- `DISETUJUI`
- `SK_TERBIT`
- `SELESAI`
- `PERLU_PERBAIKAN_UKPD`
- `DITOLAK`

`DITOLAK` adalah terminal. `SELESAI` adalah akhir normal setelah SK terbit dan proses ditutup.

## Diagram Alur Utama

```text
UKPD pilih PNS + periode + jenis KP
  -> DRAFT
  -> upload dokumen private
  -> ajukan
  -> MENUNGGU_VERIFIKASI_SUDIN atau MENUNGGU_VERIFIKASI_DINKES
  -> Smart Validation
  -> SMART_VALIDATION
  -> verifikator review dokumen, warning, dan error
  -> jika perlu perbaikan: PERLU_PERBAIKAN_UKPD -> UKPD perbaiki -> ajukan ulang
  -> jika lolos: DIVERIFIKASI_SUDIN atau DIVERIFIKASI_DINKES
  -> SIAP_DIUSULKAN
  -> MASUK_REKAP_PERIODE
  -> DIUSULKAN_KE_BKD
  -> DIUSULKAN_KE_BKN
  -> DISETUJUI
  -> upload dan verifikasi SK_KP_TERBIT
  -> SK_TERBIT
  -> SELESAI
```

Alur koreksi eksternal:

```text
DIUSULKAN_KE_BKD -> PERBAIKAN_BKD -> PERLU_PERBAIKAN_UKPD
DIUSULKAN_KE_BKN -> PERBAIKAN_BKN -> PERLU_PERBAIKAN_UKPD
```

## Alur End-to-End Detail

### 1. Persiapan Sistem

Pengelola menjalankan migration promotion secara eksplisit, bukan otomatis ketika request masuk. Script `scripts/migrate-promotion.mjs` membutuhkan env database yang diberikan secara eksplisit. Script memakai advisory lock dan checksum agar migration tidak diterapkan ganda atau berubah diam-diam.

Output penting migration:

- Tabel permission KP.
- Tabel master organisasi, periode, jenis KP, dokumen, rule, credit rule.
- Tabel transaksi usulan, dokumen, ekstraksi, validasi, workflow history, batch, dan pengembalian.
- Seed role capability awal.
- Seed jenis KP awal.
- Seed dokumen persyaratan awal.
- Seed rule awal.
- Seed alasan pengembalian BKD/BKN.

Setelah migration, pengelola wajib memastikan kebijakan yang masih `REQUIRES_POLICY_CONFIGURATION` sudah dikonfigurasi bila akan dipakai sebagai dasar keputusan.

### 2. Persiapan Storage Dokumen

Dokumen KP disimpan di root private:

```text
PROMOTION_STORAGE_ROOT atau /usb-uploads/kenaikan-pangkat
```

Storage harus memiliki marker:

```text
.smart-hrm-usb-storage
```

Jika marker tidak ditemukan, upload dan akses dokumen ditolak dengan pesan bahwa volume penyimpanan dokumen KP belum terpasang.

### 3. Konfigurasi Periode oleh Super Admin

Super Admin membuka menu:

```text
/usulan/kenaikan-pangkat/pengaturan
```

Pada tab jadwal pengajuan, Super Admin mengisi:

- Bulan kenaikan pangkat.
- Tanggal efektif, otomatis tanggal 1.
- Waktu mulai pengajuan.
- Waktu selesai pengajuan.
- Batas UKPD.
- Batas Sudin.
- Batas Dinas.
- Status periode.

Periode baru sebaiknya dimulai dari `DRAFT`, diperiksa, lalu diubah menjadi `OPEN` ketika seluruh deadline sudah benar.

### 4. Konfigurasi Dokumen dan Kebijakan

Super Admin meninjau:

- Dokumen persyaratan.
- Jenis kenaikan pangkat.
- Rule pemeriksaan.
- Ketentuan angka kredit.
- Hak akses.

Untuk dokumen, tentukan:

- Kode dokumen.
- Nama dokumen.
- Apakah wajib.
- Selector berlakunya dokumen.
- Status konfigurasi.

Untuk rule, tentukan:

- Kode dan nama rule.
- Severity `ERROR` atau `WARNING`.
- Referensi regulasi.
- Jenis KP atau kategori jabatan yang berlaku.
- Tanggal efektif rule.
- Konfigurasi rule.

Untuk angka kredit, tentukan:

- Metode perhitungan.
- Minimum angka kredit.
- Selector jabatan/jenis KP/periode.
- Referensi regulasi.
- Status `CONFIGURED` bila sudah sah.

### 5. UKPD Membuka Dashboard Kenaikan Pangkat

Admin UKPD membuka:

```text
/usulan/kenaikan-pangkat
```

Dashboard menampilkan:

- Periode aktif dan deadline.
- Total usulan.
- Jumlah draft.
- Jumlah menunggu verifikasi.
- Jumlah siap diusulkan.
- Jumlah selesai.
- KPI pemeriksaan sistem.
- Notifikasi proses terbaru.
- Filter pencarian.
- Rekap usulan per periode.
- Rekap batch verifikator.

### 6. UKPD Membuat Draft Usulan

Admin UKPD menekan tombol `Tambah usulan`. Sistem menampilkan drawer dengan langkah:

1. Cari PNS berdasarkan nama, NIP, atau NRK.
2. Pilih PNS dari UKPD sendiri.
3. Pilih periode yang sedang `OPEN`.
4. Pilih jenis KP.
5. Pilih pangkat usulan.
6. Sistem menampilkan Smart Check awal.
7. Tekan `Buat draft dan lanjutkan dokumen`.

Validasi saat membuat draft:

- User harus punya capability `create`.
- Pegawai harus milik UKPD user.
- Pegawai harus PNS.
- Wilayah dan authority pegawai harus lengkap.
- Periode harus terbuka.
- Jenis KP harus enabled.
- Pangkat usulan wajib diisi.

Jika berhasil, sistem membuat `promotion_submissions` dengan status `DRAFT`, menyimpan snapshot pegawai, mencatat history `create`, dan mencatat audit `promotion.create`.

### 7. Smart Check Awal

Smart Check awal pada drawer pembuatan usulan bersifat informasional. Pemeriksaan awal meliputi:

- Data PNS ditemukan.
- Pangkat terakhir tersedia.
- TMT pangkat tersedia.
- Jabatan tersedia.
- Unit kerja tersedia.
- Warning bahwa angka kredit dan SKP perlu diperiksa dari dokumen.

Potensi periode KP hanya dihitung bila konfigurasi masa minimal pangkat pada jenis KP sudah `CONFIGURED`.

### 8. UKPD Mengunggah Dokumen

Setelah draft dibuat, detail usulan terbuka. UKPD mengunggah dokumen pada bagian dokumen persyaratan.

Ketentuan upload:

- File harus PDF.
- MIME harus `application/pdf`.
- Signature file harus `%PDF-`.
- Ukuran maksimal 10 MB.
- Jumlah halaman maksimal 30 halaman saat pembacaan.
- Dokumen disimpan dengan nama UUID di folder submission.
- Dokumen dipindai menggunakan scanner lokal.
- Jika scanner mendeteksi ancaman, dokumen ditolak.
- Jika scanner lokal belum tersedia, upload ditolak.

Setelah upload:

- Dokumen masuk ke `promotion_documents`.
- Hasil pembacaan masuk ke `promotion_document_extractions`.
- Revision usulan bertambah.
- Verifikasi dokumen sebelumnya direset bila dokumen diganti.
- Audit upload dicatat.

### 9. Pembacaan Dokumen

Sistem membaca dokumen dengan dua jalur:

1. `PDFTextReader`: membaca text layer PDF memakai `pdftotext`.
2. `OCRReader`: bila halaman minim text, halaman dibaca dengan `pdftoppm` dan `tesseract` lokal.

Field yang dapat diekstraksi:

- `nama`
- `nip`
- `nomor_sk`
- `tanggal_sk`
- `pangkat`
- `tmt_pangkat`
- `jabatan`
- `jenjang`
- `tmt_jabatan`
- `periode_awal`
- `periode_akhir`
- `angka_kredit_awal`
- `angka_kredit_baru`
- `angka_kredit_tambahan`
- `total_angka_kredit`
- `tanggal_pak`
- `pejabat_penetap`
- `nilai_skp`
- `tahun_skp`

Status ekstraksi:

- `EXTRACTED`: data terbaca dan confidence cukup.
- `MANUAL_REVIEW_REQUIRED`: data ambigu, kosong, confidence rendah, atau reader tidak tersedia.
- `REVIEWED`: verifikator sudah memasukkan hasil review manual.

### 10. UKPD Mengajukan Usulan

Pada detail usulan, UKPD menekan aksi `Ajukan ke verifikator`.

Syarat submit:

- Status saat ini `DRAFT` atau `PERLU_PERBAIKAN_UKPD`.
- User dapat edit usulan.
- Periode masih terbuka untuk UKPD.
- Dokumen wajib dasar dan konfigurasi persyaratan memenuhi gate awal.

Transisi status:

- Jika authority `SUDIN`: `MENUNGGU_VERIFIKASI_SUDIN`.
- Jika authority `DINKES`: `MENUNGGU_VERIFIKASI_DINKES`.

History yang dicatat:

- `DIAJUKAN_UKPD` sebagai jejak pengajuan.
- Status akhir menunggu verifikasi sesuai authority.

### 11. Verifikator Memeriksa Detail Usulan

Verifikator membuka detail usulan. Detail menampilkan:

- Profil pegawai.
- Pangkat usulan.
- Periode.
- Jenis KP.
- Dokumen persyaratan.
- Hasil ekstraksi.
- Hasil Smart Validation terakhir.
- Timeline.
- Riwayat pengembalian BKD/BKN.
- Aksi workflow yang tersedia sesuai status dan kewenangan.

Verifikator dapat:

- Melihat preview dokumen.
- Melakukan review manual field ekstraksi.
- Memverifikasi dokumen.
- Menjalankan Smart Validation.
- Memberi acknowledgement untuk warning.
- Mengembalikan usulan.
- Menyetujui verifikasi.

### 12. Review Manual Dokumen

Jika dokumen `MANUAL_REVIEW_REQUIRED`, verifikator mengisi field hasil pemeriksaan manual.

Ketentuan review manual:

- Catatan wajib diisi.
- Field harus termasuk daftar field yang dikenal sistem.
- Halaman harus angka 1 sampai 30.
- Nilai ekstraksi harus string atau angka.
- Setelah review, status ekstraksi menjadi `REVIEWED`.
- Verifikasi dokumen direset sehingga dokumen perlu diverifikasi lagi.
- Revision usulan bertambah.

Review manual penting karena hasil OCR ambigu tidak dianggap cukup untuk meneruskan usulan.

### 13. Verifikasi Dokumen

Setelah dokumen terbaca atau direview, verifikator menekan aksi verifikasi dokumen.

Syarat verifikasi dokumen:

- User punya kewenangan verifikasi atas usulan.
- Status berada pada tahap yang memperbolehkan pemeriksaan dokumen.
- Status ekstraksi dokumen `EXTRACTED` atau `REVIEWED`.

Setelah diverifikasi:

- `verified_by` dan `verified_at` pada dokumen terisi.
- Revision usulan bertambah.
- Audit dokumen dicatat.

### 14. Smart Validation

Verifikator menjalankan Smart Validation. Sistem mengambil snapshot input:

- Pegawai terkini.
- Submission.
- Periode.
- Jenis KP.
- Dokumen aktif.
- Persyaratan dokumen.
- Rule versi yang berlaku.
- Credit rule yang berlaku.

Sistem menghitung `input_hash`. Hash ini dipakai untuk memastikan hasil validasi masih sesuai dengan data dan dokumen terkini.

Hasil validasi disimpan ke:

- `promotion_validation_runs`
- `promotion_validation_results`

Jika status sebelumnya menunggu verifikasi atau sudah diverifikasi/siap, setelah validasi status menjadi:

```text
SMART_VALIDATION
```

### 15. Jenis Hasil Smart Validation

Setiap rule menghasilkan:

- `PASS`: pemeriksaan lolos.
- `WARNING`: perlu perhatian atau acknowledgement.
- `ERROR`: harus diperbaiki atau konfigurasi kebijakan belum lengkap.

Overall status:

- `PASS`: tidak ada ERROR dan WARNING.
- `NEEDS REVIEW`: tidak ada ERROR, tetapi ada WARNING.
- `FAILED`: ada ERROR.

### 16. Gate Sebelum Usulan Diteruskan

Aksi berikut digate oleh hasil validasi:

- `approve`
- `ready`
- `recap`
- `send_bkd`
- `send_bkn`
- `accept`
- `issue_sk`
- `finish`

Syarat gate:

- Ada validation run terbaru.
- `input_hash` validasi sama dengan input terkini.
- Tidak ada hasil `ERROR`.
- Semua `WARNING` sudah di-acknowledge dengan alasan.
- Seluruh dokumen sudah diverifikasi pejabat sesuai kewenangan.
- Seluruh dokumen berstatus ekstraksi `EXTRACTED` atau `REVIEWED`.

Jika data pegawai, dokumen, atau kebijakan berubah, validasi menjadi stale dan harus dijalankan ulang.

### 17. Acknowledgement Warning

Warning tidak otomatis menghentikan proses, tetapi wajib diakui verifikator. Acknowledgement menyimpan:

- Actor.
- Waktu.
- Alasan.
- ID hasil validasi.

Jika validasi baru dijalankan setelah perubahan data/dokumen/kebijakan, acknowledgement lama tidak lagi cukup karena hasil validasi baru harus diperiksa ulang.

### 18. Pengembalian ke UKPD

Verifikator dapat mengembalikan usulan ke UKPD pada tahap:

- `MENUNGGU_VERIFIKASI_SUDIN`
- `MENUNGGU_VERIFIKASI_DINKES`
- `SMART_VALIDATION`
- `DIVERIFIKASI_SUDIN`
- `DIVERIFIKASI_DINKES`
- `SIAP_DIUSULKAN`
- `PERBAIKAN_BKD`
- `PERBAIKAN_BKN`

Catatan alasan wajib diisi.

Transisi:

```text
PERLU_PERBAIKAN_UKPD
```

Efek pengembalian:

- Keanggotaan batch aktif dihapus.
- Verifikasi dokumen aktif direset.
- Status berubah.
- History dan audit dicatat.

UKPD kemudian memperbaiki dokumen/data usulan dan mengajukan ulang.

### 19. Persetujuan Verifikasi

Jika hasil validasi lolos gate, verifikator menekan `Setujui verifikasi`.

Transisi:

- Dari `SMART_VALIDATION` ke `DIVERIFIKASI_SUDIN`, bila authority SUDIN.
- Dari `SMART_VALIDATION` ke `DIVERIFIKASI_DINKES`, bila authority DINKES.

Sistem menyimpan `verified_revision` sebagai revision yang telah disetujui. Setelah itu, perubahan dokumen atau usulan akan menaikkan revision dan membuat verifikasi perlu diperbarui.

### 20. Tandai Siap Diusulkan

Setelah diverifikasi, verifikator menekan `Tandai siap diusulkan`.

Syarat:

- Status `DIVERIFIKASI_SUDIN` atau `DIVERIFIKASI_DINKES`.
- Validasi masih terbaru.
- Tidak ada ERROR.
- Warning sudah di-acknowledge.
- Dokumen terverifikasi.
- `verified_revision` sesuai revision saat ini.

Transisi:

```text
SIAP_DIUSULKAN
```

### 21. Pembuatan Rekap Periode / Batch

Verifikator memilih satu atau lebih usulan dan menekan `Buat rekap periode`.

Syarat batch:

- User memiliki kewenangan rekap.
- Semua usulan berada dalam satu periode.
- Semua usulan memiliki authority yang sama.
- Semua usulan berada di wilayah yang sama.
- Semua usulan berstatus siap untuk direkap.
- Validasi setiap usulan masih terbaru.
- Semua dokumen sudah diverifikasi.
- `verified_revision` setiap usulan sesuai revision terkini.

Jika berhasil:

- Sistem membuat `promotion_batches`.
- Sistem membuat `promotion_batch_members`.
- Status setiap usulan menjadi `MASUK_REKAP_PERIODE`.
- Kode batch dibuat dalam format `KP-{period_id}-{authority}-{random}`.

### 22. Export Rekap dan Paket Dokumen

Dashboard menyediakan:

- Export Excel per periode.
- Download dokumen lengkap per periode.
- Export Excel per batch.
- Download dokumen per batch.
- Halaman rekap batch untuk cetak/simpan PDF.

Kolom rekap utama:

- Nama.
- NIP.
- Pendidikan terakhir.
- Golongan lama.
- TMT lama.
- Golongan baru.
- TMT baru.
- Jabatan terakhir.
- Jenjang jabatan.
- TMT jabatan.
- Atasan langsung.
- Unit kerja.
- Jenis kenaikan pangkat.
- Angka kredit.
- Hasil pemeriksaan sistem.
- Status.

Workbook Excel juga membuat format daftar usulan dan berita acara penerimaan KP.

### 23. Kirim ke BKD

Setelah masuk rekap periode, petugas berwenang mencatat bahwa usulan dikirim ke BKD.

Transisi:

```text
MASUK_REKAP_PERIODE -> DIUSULKAN_KE_BKD
```

Syarat:

- User punya kewenangan rekap.
- Validasi masih terbaru.
- Tidak ada ERROR.
- Warning sudah di-acknowledge.
- Dokumen sudah diverifikasi.
- Verifikasi pejabat masih sesuai revision.

### 24. Pengembalian dari BKD

Jika BKD mengembalikan usulan, petugas mencatat:

- Kategori pengembalian.
- Tanggal pengembalian.
- Subkategori.
- Dokumen terkait, bila ada.
- Catatan.

Kategori awal:

- `ANGKA_KREDIT`
- `PAK`
- `JABATAN`
- `PANGKAT`
- `SKP`
- `PENDIDIKAN`
- `DOKUMEN`
- `TMT`
- `ADMINISTRASI`
- `LAINNYA`

Transisi:

```text
DIUSULKAN_KE_BKD -> PERBAIKAN_BKD
```

Setelah itu usulan dapat dikembalikan ke UKPD menjadi:

```text
PERLU_PERBAIKAN_UKPD
```

### 25. Kirim ke BKN

Setelah proses BKD siap, petugas mencatat usulan dikirim ke BKN.

Transisi:

```text
DIUSULKAN_KE_BKD -> DIUSULKAN_KE_BKN
```

Gate validasi tetap diberlakukan.

### 26. Pengembalian dari BKN

Jika BKN mengembalikan usulan, petugas mencatat kategori, tanggal, subkategori, dokumen terkait, dan catatan.

Transisi:

```text
DIUSULKAN_KE_BKN -> PERBAIKAN_BKN
```

Setelah itu usulan dapat dikembalikan ke UKPD menjadi:

```text
PERLU_PERBAIKAN_UKPD
```

### 27. Persetujuan

Jika usulan disetujui, petugas mencatat persetujuan.

Transisi:

```text
DIUSULKAN_KE_BKD atau DIUSULKAN_KE_BKN -> DISETUJUI
```

Setelah status `DISETUJUI`, dokumen `SK_KP_TERBIT` dapat diunggah oleh verifikator sesuai kewenangan.

### 28. Upload SK Kenaikan Pangkat Terbit

Pada tahap `DISETUJUI`, dokumen `SK_KP_TERBIT` menjadi dokumen final yang harus diunggah dan diverifikasi.

Syarat aksi `Catat SK terbit`:

- Validasi masih terbaru.
- Tidak ada ERROR.
- Warning sudah di-acknowledge.
- Dokumen masih terverifikasi.
- Ada dokumen `SK_KP_TERBIT`.
- Dokumen `SK_KP_TERBIT` sudah diverifikasi.

Transisi:

```text
DISETUJUI -> SK_TERBIT
```

### 29. Selesai

Setelah SK terbit dicatat, petugas menyelesaikan usulan.

Transisi:

```text
SK_TERBIT -> SELESAI
```

Status ini menandai akhir proses normal.

### 30. Penolakan

Verifikator dapat menolak usulan pada tahap tertentu:

- `SMART_VALIDATION`
- `DIUSULKAN_KE_BKD`
- `DIUSULKAN_KE_BKN`

Catatan alasan wajib diisi.

Transisi:

```text
DITOLAK
```

Status `DITOLAK` bersifat terminal.

## Ringkasan Transisi Aksi

| Aksi | Dari Status | Ke Status |
|---|---|---|
| submit | DRAFT, PERLU_PERBAIKAN_UKPD | MENUNGGU_VERIFIKASI_SUDIN / MENUNGGU_VERIFIKASI_DINKES |
| validate | tahap verifikasi dan lanjutan tertentu | SMART_VALIDATION atau tetap status berjalan |
| return | tahap verifikasi/perbaikan | PERLU_PERBAIKAN_UKPD |
| approve | SMART_VALIDATION | DIVERIFIKASI_SUDIN / DIVERIFIKASI_DINKES |
| ready | DIVERIFIKASI_SUDIN / DIVERIFIKASI_DINKES | SIAP_DIUSULKAN |
| recap | SIAP_DIUSULKAN | MASUK_REKAP_PERIODE |
| send_bkd | MASUK_REKAP_PERIODE | DIUSULKAN_KE_BKD |
| send_bkn | DIUSULKAN_KE_BKD | DIUSULKAN_KE_BKN |
| return_bkd | DIUSULKAN_KE_BKD | PERBAIKAN_BKD |
| return_bkn | DIUSULKAN_KE_BKN | PERBAIKAN_BKN |
| accept | DIUSULKAN_KE_BKD / DIUSULKAN_KE_BKN | DISETUJUI |
| issue_sk | DISETUJUI | SK_TERBIT |
| finish | SK_TERBIT | SELESAI |
| reject | SMART_VALIDATION / DIUSULKAN_KE_BKD / DIUSULKAN_KE_BKN | DITOLAK |

## Checklist Admin UKPD

Sebelum membuat usulan:

- Pastikan periode sudah `OPEN`.
- Pastikan pegawai berstatus PNS.
- Pastikan pegawai berada di UKPD sendiri.
- Pastikan pangkat dan TMT pangkat terakhir terisi.
- Pastikan jabatan pegawai benar.
- Pastikan dokumen persyaratan tersedia dalam PDF.

Saat membuat usulan:

- Cari pegawai.
- Pilih periode.
- Pilih jenis KP.
- Pilih pangkat usulan.
- Periksa Smart Check awal.
- Buat draft.
- Upload dokumen.
- Ajukan ke verifikator.

Jika dikembalikan:

- Baca catatan pengembalian.
- Perbaiki data/dokumen.
- Ganti dokumen bila perlu.
- Ajukan ulang sebelum deadline.

## Checklist Verifikator Sudin/Dinas

Saat menerima usulan:

- Pastikan usulan berada dalam wilayah/kewenangan.
- Buka detail usulan.
- Periksa profil pegawai dan pangkat usulan.
- Preview dokumen.
- Review manual bila ekstraksi belum meyakinkan.
- Verifikasi dokumen.
- Jalankan Smart Validation.
- Perbaiki atau kembalikan bila ada ERROR.
- Acknowledge WARNING bila dapat diterima dan beri alasan.
- Setujui verifikasi.
- Tandai siap diusulkan.
- Masukkan ke rekap batch/periode.

Saat proses eksternal:

- Export rekap dan paket dokumen.
- Catat pengiriman ke BKD.
- Catat pengiriman ke BKN.
- Catat pengembalian BKD/BKN bila ada.
- Catat persetujuan.
- Upload dan verifikasi SK KP terbit.
- Catat SK terbit.
- Selesaikan usulan.

## Checklist Super Admin

Sebelum periode dibuka:

- Jalankan migration di database yang benar.
- Pastikan storage dokumen KP terpasang.
- Pastikan scanner lokal tersedia.
- Pastikan OCR tool tersedia bila dokumen scan perlu dibaca.
- Konfigurasi organisasi dan authority.
- Konfigurasi periode dan deadline.
- Konfigurasi dokumen persyaratan.
- Konfigurasi jenis KP.
- Konfigurasi rule substantif.
- Konfigurasi angka kredit.
- Pastikan permission role sesuai kebijakan.

Saat periode berjalan:

- Monitor KPI pemeriksaan sistem.
- Monitor usulan error.
- Monitor pengembalian.
- Bantu koreksi konfigurasi jika rule masih `REQUIRES_POLICY_CONFIGURATION`.
- Hindari mengubah kebijakan tanpa meminta verifikator menjalankan validasi ulang.

## Kontrol Keamanan dan Audit

Kontrol akses:

- Modul hanya untuk `SUPER_ADMIN`, `ADMIN_WILAYAH`, dan `ADMIN_UKPD`.
- CPNS dan USER tidak diberi akses modul KP.
- Scope user dihitung di server, tidak dari input frontend.
- Detail usulan dicek dengan `canRead`.
- Edit dicek dengan `canEdit`.
- Verifikasi dicek dengan `canVerify`.
- Rekap dicek dengan `canRecap`.

Kontrol dokumen:

- PDF private.
- Tidak cached.
- Response dokumen memakai `Cache-Control: private, no-store`.
- Content Security Policy sandbox pada preview dokumen.
- `X-Content-Type-Options: nosniff`.
- File path dokumen divalidasi.
- Dokumen ditolak bila storage marker tidak tersedia.

Kontrol workflow:

- Transisi status ditentukan server.
- Action yang tidak sesuai tahap ditolak.
- Mutasi berjalan dalam transaksi.
- Submission dikunci `FOR UPDATE` saat mutasi.
- Race condition diminimalkan dengan revision dan lock.
- Perubahan data/dokumen membuat validasi stale.

Audit:

- Setiap aksi penting masuk `audit_logs`.
- Timeline workflow masuk `promotion_workflow_history`.
- Return BKD/BKN masuk `promotion_return_logs`.
- Validation run dan result disimpan.
- Rule version disnapshot agar keputusan dapat ditelusuri.

## Titik Gagal yang Umum

### Periode Tidak Muncul Saat Tambah Usulan

Kemungkinan:

- Belum ada periode `OPEN`.
- `submission_start` belum dimulai.
- `ukpd_deadline` atau `submission_end` sudah lewat.
- Deadline belum lengkap sehingga periode tidak valid untuk dibuka.

### Pegawai Tidak Muncul di Pencarian

Kemungkinan:

- Pegawai bukan PNS.
- Pegawai bukan milik UKPD user.
- Relasi UKPD pegawai belum cocok dengan master UKPD.
- Nama/NIP/NRK yang dicari tidak sesuai.

### Upload Ditolak

Kemungkinan:

- File bukan PDF.
- MIME bukan `application/pdf`.
- Signature bukan `%PDF-`.
- Ukuran lebih dari 10 MB.
- Storage marker tidak ada.
- Scanner lokal belum tersedia.
- Scanner menolak dokumen.

### Smart Validation Gagal

Kemungkinan:

- Dokumen wajib belum lengkap.
- Dokumen belum direview manual.
- Dokumen belum diverifikasi.
- NIP/TMT/jabatan/pangkat tidak sesuai database.
- Rule kebijakan masih `REQUIRES_POLICY_CONFIGURATION`.
- Angka kredit belum memenuhi rule.
- Periode PAK overlap.
- Data wilayah/UKPD pegawai berubah.

### Aksi Lanjutan Tidak Bisa Diklik atau Ditolak

Kemungkinan:

- Ada ERROR pada hasil validasi.
- Ada WARNING yang belum di-acknowledge.
- Validasi stale karena data/dokumen berubah.
- Dokumen belum diverifikasi.
- `verified_revision` tidak sama dengan revision saat ini.
- Deadline verifikasi Sudin/Dinas sudah lewat.
- User tidak punya kewenangan atas usulan.

## Catatan Kebijakan

Dokumen desain mencatat bahwa sejumlah substansi hukum perlu policy review, termasuk UU 20/2023, PP 11/2017 jo. PP 17/2020, PerBKN 2/2025, PerBKN 4/2025, surat Deputi BKN, SE BKD DKI, angka kredit JF, template nominatif BKD, klasifikasi organisasi/kelas RS/UPT, deadline internal, dan mapping jenjang jabatan.

Karena itu, modul membedakan antara:

- Pemeriksaan teknis yang dapat dilakukan sistem, seperti dokumen ada/tidak, NIP sama/tidak, TMT sama/tidak.
- Keputusan kebijakan yang harus dikonfigurasi dan disahkan pejabat.

Selama rule masih `REQUIRES_POLICY_CONFIGURATION`, sistem sengaja membuat hasil validasi ERROR agar usulan tidak dianggap sah berdasarkan asumsi yang belum ditetapkan.

## Ringkasan Singkat

Proses normal adalah:

```text
Konfigurasi -> Periode OPEN -> UKPD buat DRAFT -> upload dokumen -> submit
-> Verifikator review dokumen -> Smart Validation -> approve
-> siap diusulkan -> rekap -> kirim BKD -> kirim BKN
-> disetujui -> upload SK terbit -> SK_TERBIT -> SELESAI
```

Proses perbaikan adalah:

```text
Verifikator/BKD/BKN menemukan masalah -> catat alasan -> kembalikan
-> UKPD perbaiki -> submit ulang -> validasi ulang -> lanjut proses
```

Kunci keberhasilan proses adalah master data pegawai yang bersih, periode dan deadline yang benar, dokumen PDF yang lengkap, konfigurasi rule yang sah, serta disiplin menjalankan validasi ulang setiap ada perubahan.
