# Panduan Pengembangan

Dokumen ini ditujukan untuk pengembang yang akan menambah fitur, memperbaiki bug, atau melakukan maintenance kode.

## Alur Kerja Lokal

1. Pastikan dependency terpasang:

```bash
npm install
```

2. Jalankan database PostgreSQL.

3. Isi `.env.local`.

4. Verifikasi database:

```bash
npm run check:postgres
```

5. Jalankan aplikasi:

```bash
npm run dev
```

## Verifikasi Sebelum Merge atau Deploy

```bash
npm run lint
npm run test
npm run build
```

Jika perubahan menyentuh database, jalankan juga:

```bash
npm run check:postgres
```

## Catatan Perubahan Pegawai Terbaru

Beberapa area penting untuk modul pegawai:

- `src/components/forms/MultiStepForm.jsx`: wrapper step form dan padding bawah untuk footer fixed.
- `src/components/forms/PegawaiForm.jsx`: form tambah/edit pegawai, footer fixed, tombol step, validasi, draft, dan submit.
- `src/app/api/pegawai/[id]/route.js`: endpoint detail, update, dan hapus pegawai.
- `src/app/api/pegawai/[id]/photo/route.js`: endpoint upload dan preview foto profil pegawai.
- `src/lib/data/pegawaiStore.js`: transaksi create/update/delete pegawai serta relasi alamat/keluarga.
- `src/lib/db/postgres.js`: pool koneksi PostgreSQL dan retry koneksi.
- `src/lib/db/ensureDrhSchema.js`: pelengkap schema DRH/keluarga/riwayat agar database lama tetap kompatibel.
- `src/lib/db/ensurePegawaiPhotoSchema.js`: memastikan kolom metadata foto profil pegawai tersedia.

Jika mengubah form pegawai, uji minimal:

- Buka tambah pegawai dan edit pegawai.
- Pindah antar step; footer `Lanjut`/`Simpan` harus tetap di posisi yang sama.
- Simpan perubahan pegawai.
- Upload foto profil maksimal 200 KB dengan format JPG, PNG, atau WEBP.
- Jika upload foto gagal, form harus tetap di step identitas dan menampilkan pesan error detail.
- Buka detail pegawai; foto harus tampil menggantikan inisial dan bisa diklik untuk popup preview.
- Cek console browser untuk error API.
- Cek log server jika API 500.

## Fitur Foto Profil Pegawai

Alur foto profil:

1. User memilih foto pada step `Identitas Pribadi` di form tambah/edit pegawai.
2. Frontend memvalidasi format `JPG`, `PNG`, atau `WEBP` dan ukuran maksimal `200 KB`.
3. Data pegawai disimpan lebih dulu melalui endpoint create/update pegawai.
4. Setelah data pegawai sukses, frontend mengirim file ke:

```text
/api/pegawai/{id_pegawai}/photo
```

5. Endpoint menyimpan file ke storage lokal:

```text
storage/pegawai-photos/{id_pegawai}/profile-*.jpg|png|webp
```

6. Metadata foto disimpan di tabel `pegawai`.
7. Halaman detail pegawai membaca `foto_profil_url` dan menampilkan foto sebagai avatar. Jika foto gagal dimuat, fallback tetap berupa inisial nama.

Catatan implementasi:

- Jangan menyimpan binary foto di PostgreSQL.
- Endpoint foto memakai validasi MIME dan signature sederhana untuk JPG/PNG/WEBP.
- Jika upload foto gagal setelah data pegawai tersimpan, form tidak boleh langsung redirect ke detail pegawai. Form harus menampilkan error detail di step identitas.
- Foto profil di detail pegawai dapat diklik untuk popup preview.

Status terakhir:

- Fitur sudah lulus `npm run lint`, `npm run test`, dan `npm run build` secara lokal.
- Fitur sudah dikirim dan rebuild ke server.
- Masalah terbuka: pada server upload/simpan foto profil masih perlu diagnosis dari response endpoint `/api/pegawai/{id}/photo`.

## Pola Direktori Kode

| Area | Lokasi | Catatan |
| --- | --- | --- |
| Halaman aplikasi | `src/app/(app)` | UI halaman yang membutuhkan login. |
| Halaman publik | `src/app/login`, `src/app/page.jsx` | Login dan landing/redirect awal. |
| API route | `src/app/api` | Backend route Next.js. |
| Komponen layout | `src/components/layout` | Shell aplikasi, sidebar, topbar, navigasi mobile. |
| Komponen form | `src/components/forms` | Form pegawai dan komponen form umum. |
| Komponen tabel | `src/components/tables` | Tabel data. |
| Komponen UI | `src/components/ui` | Empty state, modal, badge, drawer, error state. |
| Auth | `src/lib/auth` | Sesi, password, passkey, guard, ownership. |
| Database | `src/lib/db` | Koneksi PostgreSQL dan helper ensure schema. |
| Import/export | `src/lib/import`, `src/lib/export` | Parser import dan pembuat file export. |
| Security | `src/lib/security` | Audit, CSV safety, rate limit, request identity. |
| RBAC | `src/lib/rbac`, `src/lib/constants/roles.js` | Scope dan konstanta role. |

## Menambah Menu atau Halaman

1. Buat halaman di `src/app/(app)/nama-modul/page.jsx`.
2. Tambahkan menu di `src/data/menu/sidebarMenu.js`.
3. Tentukan role yang boleh mengakses menu.
4. Jika route perlu pembatasan khusus, tambahkan rule di `middleware.js`.
5. Tambahkan API route di `src/app/api/nama-modul/route.js` bila dibutuhkan.
6. Tambahkan helper domain di `src/lib` agar API route tetap ringkas.

## Menambah API

Praktik yang disarankan:

- Validasi input di awal handler.
- Gunakan helper response yang sudah ada jika sesuai.
- Terapkan `requireAuth` atau guard role sesuai kebutuhan endpoint.
- Catat aktivitas penting ke audit log.
- Hindari mengembalikan data sensitif seperti hash password, secret, atau token.
- Pastikan operasi file menggunakan path storage yang dikontrol konfigurasi.

## Menambah Akses Role

Saat mengubah akses:

1. Perbarui konstanta/menu di `src/data/menu/sidebarMenu.js`.
2. Perbarui rule middleware jika route-level guard diperlukan.
3. Periksa helper scope di `src/lib/rbac`.
4. Tambahkan atau sesuaikan test RBAC di `tests`.

## Menambah Kolom atau Tabel

1. Tambahkan migration SQL di folder `prisma/migrations` atau script migration yang sesuai.
2. Jika model dikelola Prisma, perbarui `prisma/schema.prisma`.
3. Sesuaikan query di `src/lib/db` atau helper domain terkait.
4. Tambahkan fallback/ensure schema bila pola modul terkait sudah memakainya.
5. Jalankan test dan build.

## Import Data

Script import dan normalisasi berada di `scripts`.

| Script | Fungsi |
| --- | --- |
| `generate-master-pegawai-import-sql.py` | Generate SQL import master pegawai. |
| `generate-pegawai-sql-per-ukpd.mjs` | Generate SQL pegawai per UKPD. |
| `generate-pegawai-ukpd-sql.mjs` | Generate SQL pegawai UKPD. |
| `generate-ukpd-password-sql.mjs` | Generate SQL password UKPD default. |
| `import-master-pegawai.mjs` | Import master pegawai. |
| `import-mariadb-dump-postgres.mjs` | Import dump MariaDB ke PostgreSQL. |
| `import-usulan-postgres.mjs` | Import usulan ke PostgreSQL. |
| `import-usulan-sql.mjs` | Import usulan dari SQL. |
| `import-monitoring-plt-plh.mjs` | Import monitoring PLT/PLH. |
| `parse_drh_pdf.py` | Parse dokumen DRH PDF. |
| `parse-kemendagri-wilayah.py` | Parse referensi wilayah Kemendagri. |

## Catatan Keamanan Pengembangan

- Jangan commit `.env.local`, file secret, dump database, atau dokumen upload produksi.
- Gunakan password dummy yang tetap memenuhi policy saat testing.
- Jangan menonaktifkan validasi origin untuk produksi.
- Jalankan export CSV melalui helper keamanan agar formula injection dicegah.
- Pastikan endpoint mutasi data mencatat audit log untuk operasi penting.
