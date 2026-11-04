# Penghapusan SMART SDMK dari indeks mesin pencari

## Tahap 1 — aktif sekarang

1. Semua respons aplikasi mengirim `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`.
2. Semua halaman HTML mengirim meta robots dengan nilai yang sama.
3. `robots.txt` tetap mengizinkan crawler (`Allow: /`) agar Google dan Bing dapat membaca instruksi `noindex`.
4. Sitemap dan referensi sitemap tidak disediakan.
5. Ajukan penghapusan sementara URL/prefix melalui Google Search Console dan Bing Webmaster Tools, lalu tunggu perayapan ulang sampai seluruh URL hilang dari hasil pencarian.

Jangan menerapkan `Disallow: /` pada tahap ini. Jika crawler diblokir terlalu dini, mesin pencari tidak dapat membaca `noindex` dan URL lama dapat bertahan dalam indeks.

## Tahap 2 — hanya setelah hasil pencarian sudah bersih

Ganti isi `public/robots.txt` dengan isi `docs/robots.final.txt`, deploy ulang, lalu periksa kembali `https://smart.sdmk.org/robots.txt`.

Header dan meta robots harus tetap dipertahankan sebagai perlindungan berlapis. Penghapusan hasil pencarian tidak berlangsung seketika; waktunya bergantung pada perayapan ulang masing-masing mesin pencari. Yahoo pada umumnya menggunakan indeks Bing.

## Catatan Cloudflare

Cloudflare Managed `robots.txt`/Content Signals dapat menggantikan file dari origin. Pastikan fitur tersebut dinonaktifkan atau dikonfigurasi agar respons production sesuai dengan tahap yang sedang dijalankan. Verifikasi selalu pada domain publik, bukan hanya port origin.
