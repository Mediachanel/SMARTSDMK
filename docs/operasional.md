# Operasional dan Deployment

Dokumen ini menjelaskan cara menjalankan aplikasi secara lokal, menjalankan database, melakukan seed akun awal, serta men-deploy aplikasi dengan Docker atau CasaOS.

## Kebutuhan

- Node.js 20 atau lebih baru.
- npm.
- PostgreSQL 16.
- Docker dan Docker Compose untuk deployment container.

## Setup Lokal

1. Salin file environment:

```bash
cp .env.example .env.local
```

2. Isi minimal konfigurasi berikut:

```env
DATABASE_URL="postgresql://sisdmk2_user:CHANGE_ME@127.0.0.1:5432/si_data?schema=public"
JWT_SECRET="ganti-dengan-secret-panjang"
NEXTAUTH_SECRET="ganti-dengan-secret-panjang"
APP_URL="http://localhost:3000"
APP_ORIGIN="http://localhost:3000"
POSTGRES_HOST="127.0.0.1"
POSTGRES_PORT="5432"
POSTGRES_USER="sisdmk2_user"
POSTGRES_PASSWORD="password-db"
POSTGRES_DATABASE="si_data"
STORAGE_PROVIDER="local"
STORAGE_LOCAL_PATH="./storage"
UKPD_DEFAULT_PASSWORD="GANTI_PASSWORD_LOKAL_ANDA"
SEED_SUPER_ADMIN_USERNAME="superadmin"
SEED_SUPER_ADMIN_PASSWORD="PasswordSuperAdmin#2026"
```

3. Install dependency:

```bash
npm install
```

4. Cek koneksi PostgreSQL:

```bash
npm run check:postgres
```

5. Jalankan migration dan seed:

```bash
npm run migrate:phase1
npm run seed:phase1
```

6. Jalankan aplikasi:

```bash
npm run dev
```

7. Buka `http://localhost:3000`.

## Environment

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | URL koneksi Prisma ke PostgreSQL. |
| `JWT_SECRET` | Secret untuk verifikasi dan penandatanganan sesi JWT. Wajib kuat dan rahasia. |
| `NEXTAUTH_SECRET` | Secret tambahan untuk integrasi auth. |
| `APP_URL` | URL publik aplikasi. |
| `APP_ORIGIN` | Origin utama yang diizinkan untuk request aplikasi. |
| `ALLOWED_ORIGINS` | Daftar origin tambahan dipisahkan koma. Dipakai validasi CSRF API. |
| `POSTGRES_HOST` | Host database untuk pool koneksi aplikasi. |
| `POSTGRES_PORT` | Port database. |
| `POSTGRES_USER` | User database. |
| `POSTGRES_PASSWORD` | Password database. |
| `POSTGRES_DATABASE` | Nama database. |
| `POSTGRES_CONNECT_TIMEOUT_MS` | Timeout koneksi PostgreSQL. |
| `POSTGRES_IDLE_TIMEOUT_MS` | Timeout idle pool PostgreSQL. |
| `POSTGRES_POOL_MAX` | Jumlah maksimum koneksi pool. |
| `POSTGRES_POOL_VERIFY_INTERVAL_MS` | Interval verifikasi pool. |
| `POSTGRES_APPLICATION_NAME` | Nama aplikasi pada koneksi PostgreSQL. |
| `DASHBOARD_CACHE_TTL_MS` | TTL cache data dashboard. |
| `DASHBOARD_DATA_CACHE_TTL_MS` | TTL cache dataset dashboard. |
| `STORAGE_PROVIDER` | Provider storage, saat ini `local`. |
| `STORAGE_LOCAL_PATH` | Folder penyimpanan dokumen upload. |
| `UKPD_DEFAULT_PASSWORD` | Password default untuk reset akun UKPD. |
| `SEED_SUPER_ADMIN_USERNAME` | Username super admin awal. |
| `SEED_SUPER_ADMIN_PASSWORD` | Password super admin awal. |

## Script NPM

| Script | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan Next.js dev server pada host `0.0.0.0`. |
| `npm run build` | Membuat production build. |
| `npm run start` | Menjalankan production server. |
| `npm run lint` | Menjalankan ESLint. |
| `npm run test` | Menjalankan test di `tests/*.test.mjs`. |
| `npm run migrate:phase1` | Menjalankan migration inti phase 1. |
| `npm run seed:phase1` | Membuat role dan akun awal sesuai konfigurasi seed. |
| `npm run check:postgres` | Mengecek koneksi PostgreSQL. |
| `npm run import:usulan` | Import data usulan dari SQL. |
| `npm run import:plt-plh` | Import monitoring PLT/PLH. |

## Docker Compose

Jalankan dari root proyek:

```bash
docker compose up -d --build
```

Sebelum menjalankan, pastikan `.env.local` atau env container sudah berisi secret, konfigurasi database, dan path storage yang benar.

## Deploy CasaOS

Deploy dari source lokal:

```bash
sh scripts/deploy-casaos.sh \
  --app-origin http://IP-SERVER:8091 \
  --postgres-password "PASSWORD_DB" \
  --ukpd-default-password "GANTI_PASSWORD_LOKAL_ANDA"
```

Deploy langsung dari GitHub:

```bash
sh scripts/deploy-casaos-github.sh \
  --install-deps \
  --force-env \
  --app-origin http://IP-SERVER:8091 \
  --postgres-password "PASSWORD_DB" \
  --ukpd-default-password "GANTI_PASSWORD_LOKAL_ANDA"
```

Konfigurasi contoh CasaOS tersedia di `.env.casaos.example`.

## Catatan Deployment Server Armbian

Pada server Armbian saat ini, source aplikasi berada di:

```bash
/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian
```

Adminer berjalan di:

```text
http://192.168.1.15:8081
```

PostgreSQL berjalan di host server pada port `5432`, sedangkan aplikasi berjalan di container Docker. Karena itu, dari dalam container aplikasi host PostgreSQL yang dipakai adalah:

```env
POSTGRES_HOST=172.17.0.1
POSTGRES_HOSTS=172.17.0.1
POSTGRES_DATABASE=sisdmk2026
POSTGRES_DATABASES=sisdmk2026
```

Nilai `POSTGRES_DATABASES` penting karena aplikasi mencoba daftar database dari variabel ini lebih dulu. Jika masih berisi `si_data`, aplikasi dapat tersambung ke database yang salah walaupun `POSTGRES_DATABASE` sudah benar.

Untuk domain production, gunakan:

```env
APP_URL=https://dinkes.kepegawaian.media
APP_ORIGIN=https://dinkes.kepegawaian.media
ALLOWED_ORIGINS=https://dinkes.kepegawaian.media,http://dinkes.kepegawaian.media,http://192.168.1.15:8091
COOKIE_SECURE=true
```

Jika perlu recreate container aplikasi saja, jalankan dari folder project:

```bash
docker compose up -d --no-deps --force-recreate app-nextjs
```

Gunakan `--no-deps` agar compose tidak ikut membuat container PostgreSQL. Pada server ini port host `5432` sudah dipakai PostgreSQL native, sehingga recreate service `postgres` dari compose akan gagal dengan error `address already in use`.

Setelah recreate, verifikasi env dan koneksi:

```bash
docker exec sisdmk2-app-nextjs sh -c 'echo POSTGRES_HOST=$POSTGRES_HOST; echo POSTGRES_DATABASE=$POSTGRES_DATABASE; echo POSTGRES_DATABASES=$POSTGRES_DATABASES'
docker exec sisdmk2-app-nextjs npm run check:postgres
```

Output koneksi yang benar:

```text
PostgreSQL tersambung: database=sisdmk2026, user=postgres
```

Untuk membuat atau reset akun Super Admin aplikasi:

```bash
docker exec \
  -e DATABASE_URL='' \
  -e POSTGRES_HOST='172.17.0.1' \
  -e POSTGRES_DATABASE='sisdmk2026' \
  -e SEED_SUPER_ADMIN_USERNAME='superadmin' \
  -e SEED_SUPER_ADMIN_PASSWORD='PasswordSuperAdmin#2026' \
  sisdmk2-app-nextjs npm run seed:phase1
```

Login aplikasi menggunakan akun pada tabel `app_users`, bukan username/password PostgreSQL:

```text
Username: superadmin
Password: PasswordSuperAdmin#2026
```

## Hotfix Dari Workspace Lokal ke Server

Jika perubahan dilakukan di workspace lokal Windows `D:\Sistem Informasi`, kirim file yang berubah ke server dengan PowerShell.

Contoh hotfix dashboard, form pegawai, API pegawai, dan koneksi PostgreSQL:

```powershell
cd "D:\Sistem Informasi"

scp "src\app\(app)\dashboard\page.jsx" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/app/(app)/dashboard/page.jsx"

scp "src\components\forms\MultiStepForm.jsx" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/components/forms/MultiStepForm.jsx"

scp "src\components\forms\PegawaiForm.jsx" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/components/forms/PegawaiForm.jsx"

scp "src\app\api\pegawai\[id]\route.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/app/api/pegawai/[id]/route.js"

scp "src\lib\data\pegawaiStore.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/lib/data/pegawaiStore.js"

scp "src\lib\db\postgres.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/lib/db/postgres.js"

scp "src\lib\db\ensureDrhSchema.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/lib/db/ensureDrhSchema.js"
```

Setelah file terkirim, rebuild dan recreate container aplikasi:

```bash
cd "/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian"
docker compose build app-nextjs
docker compose up -d --no-deps --force-recreate app-nextjs
```

Gunakan `--no-deps` agar service PostgreSQL compose tidak ikut dibuat ulang.

Setelah deploy, lakukan hard refresh browser dengan `Ctrl + F5`.

## Hotfix Foto Profil Pegawai

Fitur foto profil pegawai terdiri dari UI form, endpoint upload/preview, helper schema, dan tampilan detail profil.

File yang perlu dikirim ke server jika melakukan deploy manual:

```powershell
cd "D:\Sistem Informasi"

ssh root@192.168.1.15 "mkdir -p '/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/app/api/pegawai/[id]/photo'"

scp "src\components\forms\PegawaiForm.jsx" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/components/forms/PegawaiForm.jsx"
scp "src\app\api\pegawai\route.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/app/api/pegawai/route.js"
scp "src\app\api\pegawai\[id]\route.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/app/api/pegawai/[id]/route.js"
scp "src\app\api\pegawai\[id]\photo\route.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/app/api/pegawai/[id]/photo/route.js"
scp "src\lib\data\pegawaiStore.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/lib/data/pegawaiStore.js"
scp "src\lib\db\ensurePegawaiPhotoSchema.js" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/lib/db/ensurePegawaiPhotoSchema.js"
scp "src\app\(app)\pegawai\[id]\page.jsx" "root@192.168.1.15:/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian/src/app/(app)/pegawai/[id]/page.jsx"
```

Rebuild wajib memakai `--build` karena aplikasi berjalan sebagai Next.js production image:

```powershell
ssh root@192.168.1.15 "cd '/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian' && docker compose up -d --no-deps --build --force-recreate app-nextjs"
```

Jika koneksi SSH putus saat build, cek apakah patch sudah masuk container:

```powershell
ssh root@192.168.1.15 "docker exec sisdmk2-app-nextjs grep -n 'foto profil belum berhasil diunggah:' /app/src/components/forms/PegawaiForm.jsx"
```

Status terakhir pada 2026-06-01:

- Source foto profil sudah dikirim ke server dan image sudah berhasil rebuild.
- Container `sisdmk2-app-nextjs` sudah berjalan.
- UI upload foto muncul di step `Identitas Pribadi`.
- Halaman detail pegawai sudah menampilkan foto jika `foto_profil_url` tersedia; klik foto membuka popup preview.
- Masalah terbuka: upload/simpan foto profil masih belum tersimpan pada server. Patch terbaru membuat form tidak pindah halaman jika upload foto gagal dan harus menampilkan pesan detail.

Langkah diagnosis berikutnya setelah mencoba upload:

1. Buka DevTools browser tab `Network`.
2. Klik `Simpan Perubahan`.
3. Cari request:

```text
/api/pegawai/{id_pegawai}/photo
```

4. Catat `Status Code` dan isi tab `Response`.
5. Cek log server:

```powershell
ssh root@192.168.1.15 "docker logs sisdmk2-app-nextjs --tail 150"
```

Folder storage server sudah persistent melalui compose:

```yaml
- "${UPLOADS_DIR:-/media/devmon/Local Disk/projects/uploads/si-kepegawaian}:/app/storage"
```

Foto profil disimpan di host:

```text
/media/devmon/Local Disk/projects/uploads/si-kepegawaian/pegawai-photos/
```

Di container terbaca sebagai:

```text
/app/storage/pegawai-photos/
```

Database PostgreSQL hanya menyimpan metadata/path foto, bukan binary file.

## Tuning Koneksi PostgreSQL App

Jika log menunjukkan:

```text
Update pegawai API error: Error: timeout exceeded when trying to connect
```

naikkan timeout dan pool koneksi di `.env` server:

```bash
cd "/media/devmon/sda2-usb-External_USB3.0_/projects/si-kepegawaian"

grep -q '^POSTGRES_CONNECT_TIMEOUT_MS=' .env && sed -i 's|^POSTGRES_CONNECT_TIMEOUT_MS=.*|POSTGRES_CONNECT_TIMEOUT_MS=10000|' .env || echo 'POSTGRES_CONNECT_TIMEOUT_MS=10000' >> .env
grep -q '^POSTGRES_POOL_MAX=' .env && sed -i 's|^POSTGRES_POOL_MAX=.*|POSTGRES_POOL_MAX=20|' .env || echo 'POSTGRES_POOL_MAX=20' >> .env
```

Lalu rebuild dan recreate app:

```bash
docker compose build app-nextjs
docker compose up -d --no-deps --force-recreate app-nextjs
```

Untuk melihat error backend terbaru:

```bash
docker logs sisdmk2-app-nextjs --tail 150
```

## Backup dan Restore

Script PowerShell tersedia di:

```bash
scripts/backup-restore-postgres.ps1
```

Gunakan script ini untuk kebutuhan backup dan restore database PostgreSQL. Pastikan kredensial dan target database sudah benar sebelum restore.

## Checklist Sebelum Production

- `JWT_SECRET` dan `NEXTAUTH_SECRET` sudah kuat dan tidak kosong.
- `POSTGRES_PASSWORD` sudah terisi.
- `APP_URL`, `APP_ORIGIN`, dan `ALLOWED_ORIGINS` sesuai alamat produksi.
- `STORAGE_LOCAL_PATH` mengarah ke folder persistent.
- Folder storage dapat ditulis oleh user/container aplikasi.
- `COOKIE_SECURE` disesuaikan dengan penggunaan HTTPS.
- `npm run lint`, `npm run test`, dan `npm run build` berhasil.
- Health check `/api/health` mengembalikan status sehat.

## Troubleshooting

| Masalah | Langkah cek |
| --- | --- |
| Login 503 | Cek koneksi PostgreSQL, host, port, user, password, dan nama database. |
| Login 401 | Cek username, status akun, dan password/hash akun. |
| Login domain gagal tetapi IP berhasil | Cek `APP_URL`, `APP_ORIGIN`, `ALLOWED_ORIGINS`, `COOKIE_SECURE`, lalu recreate container app. |
| App tersambung ke database salah | Pastikan `POSTGRES_DATABASE` dan `POSTGRES_DATABASES` sama-sama mengarah ke database yang benar. |
| `host.docker.internal` tidak ditemukan | Pada server Linux/Armbian gunakan host bridge Docker, misalnya `172.17.0.1`. |
| Recreate app gagal karena port 5432 terpakai | Jalankan `docker compose up -d --no-deps --force-recreate app-nextjs`, bukan recreate semua service. |
| Simpan pegawai gagal 500 | Cek `docker logs sisdmk2-app-nextjs --tail 150`; jika timeout koneksi, naikkan `POSTGRES_CONNECT_TIMEOUT_MS` dan `POSTGRES_POOL_MAX`, lalu rebuild app. |
| Foto profil tidak tersimpan | Cek request `/api/pegawai/{id}/photo` di DevTools Network, pastikan status/response terlihat. Cek kolom `foto_profil_*`, folder `/app/storage/pegawai-photos`, dan permission volume storage. |
| Perubahan UI tidak muncul | Pastikan file sudah dikirim via `scp`, jalankan `docker compose build app-nextjs`, recreate container, lalu hard refresh browser. |
| Build gagal karena env | Pastikan secret dan env wajib sudah terisi. |
| Request API ditolak 403 | Cek `APP_ORIGIN` dan `ALLOWED_ORIGINS`. |
| Upload dokumen gagal | Cek `STORAGE_LOCAL_PATH` dan permission folder. |
| Reset password UKPD gagal | Pastikan `UKPD_DEFAULT_PASSWORD` memenuhi aturan password. |
| Dashboard lambat atau data lama | Cek TTL cache dashboard dan performa query PostgreSQL. |
