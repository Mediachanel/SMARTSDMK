# Dokumentasi SI-SDMK Dinas Kesehatan DKI Jakarta

Dokumentasi ini menjadi pegangan teknis untuk menjalankan, merawat, dan mengembangkan aplikasi Sistem Informasi SDM Kesehatan.

## Ringkasan Aplikasi

SI-SDMK adalah aplikasi web berbasis Next.js untuk pengelolaan data SDM kesehatan, termasuk data pegawai, pejabat, Daftar Urut Kepangkatan, import data, usulan kepegawaian, autentikasi, passkey, RBAC, dan audit log.

## Stack Teknologi

| Komponen | Teknologi |
| --- | --- |
| Frontend dan backend | Next.js App Router |
| UI | React, Tailwind CSS, lucide-react |
| Validasi form/data | react-hook-form, yup, zod |
| Database | PostgreSQL |
| ORM/migration inti | Prisma |
| Autentikasi | JWT cookie, bcryptjs, jose |
| Passkey | WebAuthn helper internal |
| Chart | Chart.js dan react-chartjs-2 |
| Test | Node.js test runner |
| Deploy | Docker Compose, script CasaOS |

## Modul Utama

| Modul | Route halaman | Role yang dapat mengakses |
| --- | --- | --- |
| Dashboard | `/dashboard` | `SUPER_ADMIN`, `ADMIN_WILAYAH`, `ADMIN_UKPD` |
| Data Pegawai | `/pegawai` | `SUPER_ADMIN`, `ADMIN_WILAYAH`, `ADMIN_UKPD` |
| Data Pejabat | `/pejabat` | `SUPER_ADMIN` |
| Master Jabatan Menpan | `/master-jabatan/menpan` | `SUPER_ADMIN` |
| Master Jabatan ORB | `/master-jabatan/orb` | `SUPER_ADMIN` |
| Usulan Mutasi | `/usulan/mutasi` | `SUPER_ADMIN`, `ADMIN_WILAYAH`, `ADMIN_UKPD` |
| Usulan Putus JF | `/usulan/putus-jf` | `SUPER_ADMIN`, `ADMIN_WILAYAH`, `ADMIN_UKPD` |
| Import Excel Pegawai | `/import-pegawai` | `SUPER_ADMIN`, `ADMIN_UKPD` |
| Import DRH | `/import-drh` | `SUPER_ADMIN`, `ADMIN_UKPD` |
| Daftar Urut Kepangkatan | `/duk` | `SUPER_ADMIN`, `ADMIN_WILAYAH`, `ADMIN_UKPD` |
| Pengaturan profil | `/profil` | `SUPER_ADMIN`, `ADMIN_WILAYAH`, `ADMIN_UKPD` |

## Struktur Direktori

| Path | Fungsi |
| --- | --- |
| `src/app` | Halaman Next.js dan API route. |
| `src/components` | Komponen UI, layout, form, tabel, chart, profil, dan state tampilan. |
| `src/data` | Data menu, mock, dan referensi generated. |
| `src/lib` | Logika aplikasi: auth, database, import, export, RBAC, security, dan usulan. |
| `prisma` | Schema Prisma dan migration RBAC/audit log. |
| `scripts` | Script migration, seed, deploy, import, backup, dan normalisasi data. |
| `templates` | Template aturan import. |
| `storage` | Penyimpanan lokal dokumen usulan. |
| `tests` | Test auth, RBAC, security hardening, dan utilitas terkait. |
| `public` | Aset statis. |

## Dokumentasi Lanjutan

- [Operasional dan Deployment](./operasional.md)
- [API dan Route](./api.md)
- [Database, RBAC, dan Keamanan](./database-keamanan.md)
- [Panduan Pengembangan](./pengembangan.md)

## Catatan Server Aktif

Deployment server Armbian menggunakan database PostgreSQL `sisdmk2026` pada host Docker bridge `172.17.0.1`, aplikasi pada container `sisdmk2-app-nextjs`, dan Adminer pada `http://192.168.1.15:8081`. Detail operasionalnya ada di [Operasional dan Deployment](./operasional.md).
