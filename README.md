# SI-SDMK Dinas Kesehatan DKI Jakarta

Sistem Informasi SDM Kesehatan untuk pengelolaan data pegawai, DUK, pejabat, usulan kepegawaian, import data, autentikasi, passkey, dan audit log.

## Fitur Aktif

- Dashboard ringkasan pegawai dan visualisasi data.
- Data pegawai: daftar, detail, tambah, ubah, hapus, ekspor, dan riwayat pegawai.
- Data pejabat dan PLT/PLH untuk Super Admin.
- Master jabatan Menpan dan ORB.
- Usulan mutasi dan usulan putus JF beserta dokumen pendukung.
- Import Excel pegawai dan import DRH.
- Daftar Urut Kepangkatan (DUK) dengan filter, paging, dan export CSV.
- Pengaturan akun: ubah password, passkey, dan reset password UKPD oleh Super Admin.
- RBAC untuk `SUPER_ADMIN`, `ADMIN_WILAYAH`, dan `ADMIN_UKPD`.
- Audit log keamanan dan aktivitas penting.

Modul lama di luar daftar fitur aktif sudah dihapus agar kode lebih mudah dirawat.

## Kebutuhan

- Node.js 20 atau lebih baru.
- PostgreSQL 16.
- npm.
- Docker dan Docker Compose untuk deploy container.

## Setup Lokal

1. Salin env contoh:

```bash
cp .env.example .env.local
```

2. Isi minimal:

```env
JWT_SECRET="ganti-dengan-secret-panjang"
APP_URL="http://localhost:3000"
APP_ORIGIN="http://localhost:3000"
POSTGRES_HOST="127.0.0.1"
POSTGRES_PORT="5432"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="password-db"
POSTGRES_DATABASE="si_data"
STORAGE_LOCAL_PATH="./storage"
UKPD_DEFAULT_PASSWORD="GANTI_PASSWORD_LOKAL_ANDA"
SEED_SUPER_ADMIN_USERNAME="superadmin"
SEED_SUPER_ADMIN_PASSWORD="PasswordSuperAdmin#2026"
```

3. Install dependency dan jalankan aplikasi:

```bash
npm install
npm run dev
```

4. Buka `http://localhost:3000`.

## Database

Migration inti:

```bash
npm run migrate:phase1
```

Seed Super Admin:

```bash
SEED_SUPER_ADMIN_USERNAME="superadmin" SEED_SUPER_ADMIN_PASSWORD="PasswordSuperAdmin#2026" npm run seed:phase1
```

Password UKPD dapat dibuat dari data UKPD dengan:

```bash
UKPD_DEFAULT_PASSWORD="GANTI_PASSWORD_LOKAL_ANDA" node scripts/generate-ukpd-password-sql.mjs
```

Import SQL hasil generate ke database sesuai kebutuhan.

## Aturan Password

- Minimal 12 karakter.
- Memuat huruf besar, huruf kecil, angka, dan simbol.
- Tidak memakai spasi.
- Tidak memakai password umum.
- Tidak mengandung username atau nama UKPD.

Super Admin dapat membuka `Pengaturan > Reset Password UKPD`, memilih UKPD, lalu mengembalikan password ke nilai env `UKPD_DEFAULT_PASSWORD`.

## Script Utama

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run check:postgres
npm run import:usulan
npm run import:plt-plh
```

## Deploy Docker

Build dan jalankan:

```bash
docker compose up -d --build
```

Deploy CasaOS dari source lokal:

```bash
sh scripts/deploy-casaos.sh \
  --app-origin http://IP-SERVER:8091 \
  --postgres-password "PASSWORD_DB" \
  --ukpd-default-password "GANTI_PASSWORD_LOKAL_ANDA"
```

Deploy CasaOS langsung dari GitHub:

```bash
sh scripts/deploy-casaos-github.sh \
  --install-deps \
  --force-env \
  --app-origin http://IP-SERVER:8091 \
  --postgres-password "PASSWORD_DB" \
  --ukpd-default-password "GANTI_PASSWORD_LOKAL_ANDA"
```

## Struktur Folder

- `src/app`: halaman Next.js dan API route.
- `src/components`: komponen UI, layout, form, tabel, chart, dan profil.
- `src/lib`: helper database, auth, export, import, security, usulan, dan validasi.
- `src/data`: data menu dan mock pendukung.
- `scripts`: migration, seed, import, deploy, dan backup.
- `prisma`: schema RBAC dan audit log.
- `storage`: penyimpanan lokal dokumen usulan.
- `tests`: test auth, RBAC, dan hardening produksi.
- `templates`: template aturan import.

## Dokumentasi

Dokumentasi teknis dan operasional tersedia di folder `docs`:

- `docs/README.md`: ringkasan aplikasi, stack, modul, dan struktur proyek.
- `docs/operasional.md`: setup lokal, env, script, Docker, CasaOS, dan troubleshooting.
- `docs/api.md`: daftar route API dan proteksi route.
- `docs/database-keamanan.md`: database, RBAC, autentikasi, passkey, CSRF, dan audit log.
- `docs/pengembangan.md`: panduan pengembangan, penambahan modul, API, role, database, dan import data.

## Verifikasi

Sebelum deploy:

```bash
npm run lint
npm run test
npm run build
```

Health check:

```bash
curl http://localhost:3000/api/health
```

## Troubleshooting

- Login 503: aplikasi belum bisa terhubung ke PostgreSQL. Cek `POSTGRES_HOST`, `POSTGRES_PORT`, user, password, dan database.
- Login 401: akun ditemukan tetapi password salah atau hash belum sesuai.
- Reset password UKPD gagal: pastikan `UKPD_DEFAULT_PASSWORD` terisi dan memenuhi aturan password.
- Upload dokumen usulan gagal: cek permission folder `STORAGE_LOCAL_PATH`.
- Build gagal karena env kosong: isi `JWT_SECRET`, `POSTGRES_PASSWORD`, dan env wajib lain sebelum production build.
