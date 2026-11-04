# Database, RBAC, dan Keamanan

Dokumen ini merangkum database inti, role akses, autentikasi, dan praktik keamanan yang digunakan aplikasi.

## Database

Database utama adalah PostgreSQL. Schema Prisma saat ini mendefinisikan tabel inti:

| Model Prisma | Tabel | Fungsi |
| --- | --- | --- |
| `Role` | `roles` | Master role aplikasi. |
| `AppUser` | `app_users` | Akun pengguna aplikasi. |
| `AuditLog` | `audit_logs` | Catatan aktivitas dan kejadian keamanan. |

Beberapa modul data domain dikelola lewat query PostgreSQL dan script migration/helper di `src/lib/db` serta `scripts`.

## Migration

Migration inti dijalankan dengan:

```bash
npm run migrate:phase1
```

File migration berada di `prisma/migrations`. Migration lama bertema AI masih ada di folder migration, tetapi README menyatakan modul aktif aplikasi saat ini berfokus pada SDM kesehatan, RBAC, dan audit log.

## Seed Akun Awal

Seed role dan akun super admin:

```bash
npm run seed:phase1
```

Variabel yang dipakai:

```env
SEED_SUPER_ADMIN_USERNAME="superadmin"
SEED_SUPER_ADMIN_PASSWORD="PasswordSuperAdmin#2026"
```

Pada deployment container, login web tidak memakai username/password PostgreSQL. Login web memakai tabel `app_users` atau fallback data `ukpd`.

Untuk reset akun Super Admin pada server Armbian:

```bash
docker exec \
  -e DATABASE_URL='' \
  -e POSTGRES_HOST='172.17.0.1' \
  -e POSTGRES_DATABASE='sisdmk2026' \
  -e SEED_SUPER_ADMIN_USERNAME='superadmin' \
  -e SEED_SUPER_ADMIN_PASSWORD='PasswordSuperAdmin#2026' \
  sisdmk2-app-nextjs npm run seed:phase1
```

Validasi dari Adminer atau `psql`:

```sql
SELECT username, role_code, is_active
FROM app_users;
```

## RBAC

Role yang dikenal aplikasi:

| Role | Keterangan |
| --- | --- |
| `SUPER_ADMIN` | Akses penuh ke modul administrasi, pejabat, master jabatan, import, usulan, DUK, dan pengaturan. |
| `ADMIN_WILAYAH` | Akses data sesuai wilayah, dashboard, pegawai, usulan, DUK, dan pengaturan. |
| `ADMIN_UKPD` | Akses data sesuai UKPD, dashboard, pegawai, import, usulan, DUK, dan pengaturan. |
| `USER` | Role tersedia di konstanta, tetapi tidak muncul pada menu aktif. |

Middleware memberi pembatasan khusus:

| Prefix route | Role yang diizinkan |
| --- | --- |
| `/pejabat` | `SUPER_ADMIN` |
| `/import-pegawai` | `SUPER_ADMIN`, `ADMIN_UKPD` |
| `/import-drh` | `SUPER_ADMIN`, `ADMIN_UKPD` |
| `/usulan` | `SUPER_ADMIN`, `ADMIN_WILAYAH`, `ADMIN_UKPD` |

## Autentikasi Sesi

- Login memakai username dan password.
- Password diverifikasi dengan hash bcrypt.
- Sesi disimpan pada cookie `sdm_session`.
- Token sesi diverifikasi dengan JWT secret melalui `jose`.
- Route aplikasi dilindungi middleware dan akan redirect ke `/login` jika sesi tidak valid.

## Passkey

Modul passkey tersedia melalui endpoint:

- `/api/auth/passkey/register/options`
- `/api/auth/passkey/register/verify`
- `/api/auth/passkey/login/options`
- `/api/auth/passkey/login/verify`
- `/api/auth/passkey/credentials`

Pastikan `APP_URL`, `APP_ORIGIN`, dan konfigurasi HTTPS/secure cookie sesuai lingkungan produksi agar WebAuthn berjalan stabil.

## Aturan Password

Password harus:

- Minimal 12 karakter.
- Memuat huruf besar, huruf kecil, angka, dan simbol.
- Tidak memakai spasi.
- Tidak memakai password umum.
- Tidak mengandung username atau nama UKPD.

Super Admin dapat mereset password UKPD melalui halaman `Pengaturan > Reset Password UKPD`.

## CSRF dan Origin

Middleware memvalidasi origin untuk request API dengan method non-aman seperti `POST`, `PUT`, `PATCH`, dan `DELETE`.

Origin yang diizinkan berasal dari:

- Origin request aplikasi.
- `APP_ORIGIN`.
- `ALLOWED_ORIGINS`.

Jika aplikasi berada di balik reverse proxy atau domain produksi, pastikan nilai origin konsisten dengan URL yang dipakai pengguna.

## Audit Log

Audit log menyimpan:

- ID aktor.
- Role aktor.
- Action.
- Entity type dan entity ID.
- IP address.
- User agent.
- Metadata JSON.
- Waktu kejadian.

Gunakan audit log untuk menelusuri aktivitas penting seperti login, perubahan data, reset password, dan operasi administratif.

## Penyimpanan Dokumen

Dokumen upload usulan menggunakan storage lokal:

```env
STORAGE_PROVIDER="local"
STORAGE_LOCAL_PATH="./storage"
```

Pada deployment container, arahkan path ini ke volume persistent agar dokumen tidak hilang saat container dibuat ulang.

## Foto Profil Pegawai

Foto profil pegawai memakai pola yang sama dengan upload dokumen: file fisik disimpan di storage lokal, sedangkan PostgreSQL hanya menyimpan metadata/path.

Kolom metadata pada tabel `pegawai`:

```sql
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS foto_profil_url TEXT NULL;
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS foto_profil_path TEXT NULL;
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS foto_profil_content_type VARCHAR(80) NULL;
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS foto_profil_size INTEGER NULL;
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS foto_profil_updated_at TIMESTAMP NULL;
```

Validasi kolom:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pegawai'
  AND column_name LIKE 'foto_profil%'
ORDER BY column_name;
```

File foto disimpan di dalam container pada:

```text
/app/storage/pegawai-photos/{id_pegawai}/
```

Pada server Armbian saat ini, compose memetakan `/app/storage` ke host:

```text
/media/devmon/Local Disk/projects/uploads/si-kepegawaian
```

Sehingga file foto profil berada di host:

```text
/media/devmon/Local Disk/projects/uploads/si-kepegawaian/pegawai-photos/
```

Batas upload:

- Maksimal `200 KB`.
- Format `image/jpeg`, `image/png`, atau `image/webp`.
- Endpoint upload/preview: `/api/pegawai/{id_pegawai}/photo`.
- Endpoint memakai `requireAuth`, RBAC pegawai, rate limit, validasi signature file, dan audit security event.

Jika upload foto gagal:

1. Cek response request `/api/pegawai/{id_pegawai}/photo` di DevTools Network.
2. Cek permission folder storage.
3. Cek apakah kolom `foto_profil_*` sudah tersedia.
4. Cek log:

```bash
docker logs sisdmk2-app-nextjs --tail 150
```

## Koneksi PostgreSQL dan Retry

Aplikasi memakai pool PostgreSQL dari `src/lib/db/postgres.js`. Timeout koneksi, DNS failure container, dan koneksi tertutup diperlakukan sebagai koneksi rusak agar pool dapat di-reset dan dicoba ulang.

Pada server Armbian, nilai env yang disarankan:

```env
POSTGRES_HOST=172.17.0.1
POSTGRES_HOSTS=172.17.0.1
POSTGRES_DATABASE=sisdmk2026
POSTGRES_DATABASES=sisdmk2026
POSTGRES_CONNECT_TIMEOUT_MS=10000
POSTGRES_POOL_MAX=20
```

Untuk error simpan pegawai:

```bash
docker logs sisdmk2-app-nextjs --tail 150
```

Jika muncul `timeout exceeded when trying to connect`, cek beban PostgreSQL, pastikan host DB benar, naikkan timeout/pool, lalu rebuild container aplikasi.
