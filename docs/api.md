# API dan Route

Aplikasi memakai Next.js App Router. API berada di `src/app/api/**/route.js`.

## Konvensi Response

Sebagian besar API menggunakan pola response JSON:

```json
{
  "success": true,
  "message": "Pesan operasi",
  "data": {}
}
```

Untuk error, response umumnya berisi:

```json
{
  "success": false,
  "message": "Pesan error",
  "errors": null
}
```

## Autentikasi

| Endpoint | Fungsi |
| --- | --- |
| `POST /api/auth/login` | Login dan membuat cookie sesi `sdm_session`. |
| `GET /api/auth/logout` | Logout dan menghapus sesi. |
| `GET /api/auth/me` | Mengambil data user aktif. |
| `POST /api/auth/change-password` | Mengubah password user aktif. |
| `GET /api/auth/passkey/credentials` | Mengambil daftar kredensial passkey user. |
| `POST /api/auth/passkey/register/options` | Membuat opsi registrasi passkey. |
| `POST /api/auth/passkey/register/verify` | Verifikasi registrasi passkey. |
| `POST /api/auth/passkey/login/options` | Membuat opsi login passkey. |
| `POST /api/auth/passkey/login/verify` | Verifikasi login passkey. |

## Admin

| Endpoint | Fungsi |
| --- | --- |
| `/api/admin/password-reset/ukpd` | Reset password akun UKPD ke `UKPD_DEFAULT_PASSWORD`. |
| `/api/audit-logs` | Mengambil audit log aktivitas dan keamanan. |

## Dashboard

| Endpoint | Fungsi |
| --- | --- |
| `/api/dashboard` | Ringkasan statistik dashboard. |
| `/api/dashboard/drilldown` | Data drilldown dashboard. |
| `/api/dashboard/pivot-tree` | Data pivot/tree dashboard. |

## Pegawai

| Endpoint | Fungsi |
| --- | --- |
| `/api/pegawai` | Daftar, tambah, atau operasi koleksi pegawai. |
| `/api/pegawai/[id]` | Detail, ubah, atau hapus pegawai tertentu. |
| `/api/pegawai/export` | Export data pegawai. |
| `/api/pegawai/form-options` | Opsi referensi untuk form pegawai. |
| `/api/reference/address` | Referensi alamat/wilayah. |

## DUK

| Endpoint | Fungsi |
| --- | --- |
| `/api/duk` | Daftar Urut Kepangkatan dengan filter, paging, dan export. |

## Import

| Endpoint | Fungsi |
| --- | --- |
| `/api/import-pegawai` | Import Excel pegawai. |
| `/api/import-pegawai/template` | Download template import pegawai. |
| `/api/import-drh` | Import DRH. |

## Master Jabatan

| Endpoint | Fungsi |
| --- | --- |
| `/api/master-jabatan` | Data master jabatan Menpan dan ORB. |

## Pejabat dan PLT/PLH

| Endpoint | Fungsi |
| --- | --- |
| `/api/pejabat` | Data pejabat. |
| `/api/pejabat/export` | Export data pejabat. |
| `/api/pejabat/plt-plh` | Data PLT/PLH. |
| `/api/pejabat/plt-plh/export` | Export data PLT/PLH. |

## Usulan

| Endpoint | Fungsi |
| --- | --- |
| `/api/usulan/dokumen` | Upload atau akses dokumen usulan. |
| `/api/usulan/mutasi` | Data usulan mutasi. |
| `/api/usulan/mutasi/pertimbangan` | Dokumen atau data pertimbangan mutasi. |
| `/api/usulan/putus-jf` | Data usulan putus JF. |
| `/api/usulan/putus-jf/docx` | Generate dokumen DOCX usulan putus JF. |

## Health Check

| Endpoint | Fungsi |
| --- | --- |
| `/api/health` | Health check aplikasi dan koneksi dasar. |

## Proteksi Route

Middleware melindungi route berikut:

- `/dashboard`
- `/pegawai`
- `/pejabat`
- `/usulan`
- `/import-pegawai`
- `/import-drh`
- `/duk`
- `/profil`

API non-GET juga divalidasi origin-nya. Pastikan `APP_ORIGIN` dan `ALLOWED_ORIGINS` sesuai domain aplikasi agar request sah tidak ditolak.

