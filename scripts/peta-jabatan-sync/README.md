# Integrasi Spreadsheet Peta Jabatan

## Alur yang Dipakai: Tarik Langsung dari Spreadsheet

Gunakan **`google-sheets-langsung.js`**. Alur ini tidak membutuhkan login
aplikasi, Playwright, Docker, atau exporter baru. Spreadsheet membaca manifest
dan CSV dari endpoint lama menggunakan `PETA_JABATAN_EXPORT_TOKEN` yang sama.

1. Tambahkan file `google-sheets-langsung.js` sebagai file baru di project Apps
   Script spreadsheet. Biarkan script lama tetap ada.
2. Aktifkan **Google Sheets API** di menu **Services** Apps Script.
3. Pastikan Script Property `PETA_JABATAN_EXPORT_TOKEN` sudah terisi.
4. Jalankan `pasangPetaLangsung` sekali dan izinkan akses Google yang diminta.
5. Pilih **Peta Langsung > Update dari server**.

Ini membuat tab PETA dan MATRIKS terpisah untuk ASN/PNS dan Non-ASN. Bagan
digabung per jenis UKPD, dan matriks memisahkan kolom B/K/S masing-masing
kelompok. Update disimpan per batch dan dilanjutkan otomatis setiap lima menit.
Gunakan **Lanjutkan update** setelah memperbaiki error. Data mengikuti snapshot
CSV export server yang tersedia, bukan menjalankan pembaruan database baru.

Renderer langsung mempertahankan hubungan atasan dan semua data jabatan,
dengan tabel fungsional/pelaksana dan garis penghubung. Tata letak ini merupakan
adaptasi spreadsheet berbasis relasi, **belum identik dengan layout khusus
RSUD/Puskesmas/UPT di aplikasi**. Angka dan tampilan akhir di Google Sheets perlu
diverifikasi setelah pemasangan. Tidak ada klaim bahwa spreadsheet tujuan sudah
berubah hanya dengan menambahkan file ini di repo.

**Bagian berikut merupakan dokumentasi pendekatan exporter browser sebelumnya.
Tidak perlu diikuti untuk alur tarik langsung di atas.**

Integrasi ini berdiri sendiri. Tidak perlu mengubah atau redeploy aplikasi,
endpoint export, komponen peta/matriks, maupun `google-sheets-peta-jabatan-menu.js`.
File Apps Script baru dipasang berdampingan dengan script lama.

## Hasil

Setiap jenis UKPD mendapatkan empat tab baru:

- `PETA ASN - RSUD B`
- `PETA NON ASN - RSUD B`
- `MATRIKS ASN - RSUD B`
- `MATRIKS NON ASN - RSUD B`

Nama di atas merupakan contoh untuk RSUD B. ASN/PNS mengikuti kelompok sistem
(PNS, CPNS, PPPK); Non-ASN mengikuti kelompok sistem (PPPK Paruh Waktu dan
Non PNS/ASN). Data peta merupakan gabungan jenis UKPD yang dipilih di sistem.
Matriks mempertahankan kolom per UKPD dan total jenisnya. Tab rekap dan tab lama
tidak disentuh oleh integrasi baru.

## Cara Kerja

1. `export-system.mjs` membuka sistem menggunakan sesi login pemilik akun,
   memilih jenis UKPD dan kedua kelompok pegawai, lalu menekan **Export Excel**
   bawaan untuk bagan. Kode penyusun bagan sistem tidak disalin atau diganti.
2. Matriks dibaca dari tabel halaman sistem, termasuk header bertingkat,
   sel gabungan, warna, ukuran kolom, ringkasan dan angka B/K/S.
3. Workbook bagan dikonversi ke permintaan Google Sheets dengan mempertahankan
   posisi sel, garis, warna dan merge. Kolom bagan berukuran 8 px dan baris 11 px,
   mengikuti grid exporter sistem. Nilai ditulis sebagai angka atau teks literal.
4. Hasil disimpan sebagai file baru `peta-layout-v2*.csv` pada direktori export
   server. Ekstensi `.csv` diperlukan karena endpoint lama hanya melayani nama
   tersebut. **Isinya JSON layout**, bukan CSV data, dan dibaca khusus oleh script v2.
   `manifest.json` dan semua CSV lama tetap utuh.
5. Apps Script menulis bertahap ke tab penampung, menyimpan posisi terakhir,
   dan melanjutkan otomatis. Setelah satu tab selesai, isinya dipublikasikan.
   Tab hasil sebelumnya tetap terlihat bila proses di tengah jalan gagal.
   Update berikutnya mempertahankan `gid` tab v2 yang sudah ada.

## Export Pertama

Exporter membutuhkan sesi login sistem yang sah. Export token CSV saja tidak
memberikan akses ke halaman peta/matriks. Tidak ada password atau token akun yang
ditanam dalam file ini.

Pada komputer dengan Node.js 20+ dan browser desktop, buka folder ini:

```sh
npm ci
npx playwright install chromium
node export-system.mjs --login --session /path/private/peta-session.json
```

Login melalui jendela browser yang muncul, kemudian buka halaman **Peta Jabatan**
jika setelah login diarahkan ke beranda. Browser akan menutup setelah sesi
tersimpan. File sesi hanya digunakan lokal oleh exporter; jangan masukkan ke
Apps Script. Gunakan origin yang sama untuk login dan export (default
`https://smart.sdmk.org`).

Untuk server ini yang menjalankan aplikasi di Docker, tersedia image pendamping:

```sh
docker build -t peta-layout-sync scripts/peta-jabatan-sync
docker run --rm --init \
  -v /path/private/peta-session.json:/session.json:ro \
  -v /DATA/AppData/sistem-informasi/storage/exports/peta-jabatan:/exports \
  peta-layout-sync --session /session.json --out /exports
```

File sesi hasil login desktop harus tersedia pada path private yang digunakan
di server. Ini container terpisah; container aplikasi tidak perlu dihentikan.
Untuk uji pertama, tambahkan `--templates "RSUD B"`. Jalankan tanpa `--templates`
setelahnya untuk menghasilkan seluruh jenis UKPD yang dapat dibaca akun tersebut.

Alternatif jika Node.js dan dependensi Chromium tersedia langsung di server:

```sh
node export-system.mjs \
  --session /path/private/peta-session.json \
  --out /DATA/AppData/sistem-informasi/storage/exports/peta-jabatan
```

Exporter tidak memanggil endpoint perubahan data. Bila login kedaluwarsa,
jalankan login awal lagi. Manifest baru baru diterbitkan setelah seluruh jenis
yang diminta berhasil diekspor; export gagal tidak mengganti generasi sebelumnya.

## Pasang di Spreadsheet

1. Di project Apps Script milik spreadsheet, tambahkan **file baru** bernama
   `google-sheets-peta-sistem`, berisi file `google-sheets-peta-sistem.js` dari
   folder ini. Biarkan file lama tetap ada. Tidak ada `onOpen` yang bertabrakan.
2. Di **Services**, aktifkan **Google Sheets API**. Untuk project Google Cloud
   standar, aktifkan Sheets API di project itu juga bila belum aktif.
3. Gunakan Script Property `PETA_JABATAN_EXPORT_TOKEN` yang sudah dipakai
   integrasi lama. Integrasi baru mengirimkannya lewat header `x-export-token`.
4. Jalankan `pasangPetaSistem` sekali dan selesaikan otorisasi. Menu baru
   **Peta Sistem** akan muncul dan otomatis dipasang saat spreadsheet dibuka.
5. Setelah export pertama berhasil, pilih **Peta Sistem > Update bagan dan matriks**.

Jangan memakai **Update Data > Update sekarang** untuk menguji integrasi ini;
menu tersebut tetap menjalankan renderer CSV lama pada tab lama.

Jika waktu eksekusi mendekati batas, script akan melanjutkan dengan trigger
per menit. Bila terjadi error, tab penampung dipertahankan dan trigger berhenti;
perbaiki penyebabnya lalu pilih **Lanjutkan update**. Proses akan tetap membaca
generasi export yang sama walaupun server telah menerbitkan generasi baru.

Jika sudah ada tab dengan nama hasil v2 tetapi tidak memiliki metadata integrasi,
script menolak menimpanya. Ubah nama tab tersebut terlebih dahulu.

## Update Harian

Menu **Pasang update jam 12 WIB** menjadwalkan impor Google Sheets pada rentang
jam 12 Asia/Jakarta. Agar angka ikut terbaru, jalankan exporter server sebelum
jadwal impor, misalnya dengan scheduler terpisah milik administrator. Trigger
Google Sheets **tidak** menjalankan browser exporter di server.

Tanggal export sumber dan impor terakhir disimpan pada Script Property
`PETA_SISTEM_V2_LAST_SUCCESS`. Menu harian lama tetap seperti sebelumnya.

Jangan hapus file generasi lama selama masih ada proses update yang dijeda.
File `layout-v2-artifacts/<generation>/` menyimpan workbook sumber untuk pemeriksaan.

## Verifikasi

```sh
npm test
PETA_FIXTURE_DIR=/path/export-csv \
PETA_VERIFY_OUT=/tmp/peta-layout-verification \
node verify-browser.mjs
```

Pengujian browser menggunakan komponen React dan exporter Excel asli dari repo
secara baca-saja dengan snapshot CSV lokal sebagai fixture. Ia membandingkan
nilai, koordinat dan jumlah merge hasil konversi; ini bukan pengujian login live
atau pengujian render Google Sheets. Jenis dengan fixture kosong dilaporkan SKIP.
Screenshot pemeriksaan dan workbook fixture tersimpan di `PETA_VERIFY_OUT`.

Google Sheets membulatkan ukuran font ke poin bulat dan dapat merender teks
sedikit berbeda dari Excel. Struktur/koordinat berasal dari ekspor sistem;
kesamaan piksel akhir tetap harus diperiksa setelah impor nyata.

Dokumentasi Google:
- [Advanced Sheets Service](https://developers.google.com/apps-script/advanced/sheets)
- [Batch requests](https://developers.google.com/workspace/sheets/api/guides/batch)

## Status Instalasi

File pendamping dapat diuji tanpa menjalankan aplikasi. Login exporter,
publikasi layout di server, pemasangan Apps Script, dan impor ke spreadsheet
merupakan langkah aktivasi terpisah. Penambahan folder ini sendiri belum
mengubah spreadsheet yang sedang dipakai.
