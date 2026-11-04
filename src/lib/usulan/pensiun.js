export const PENSION_DOCUMENT_LABELS = {
  surat_pengantar: "Surat pengantar usulan dari UKPD/Perangkat Daerah",
  permohonan: "Surat permohonan pensiun dari PNS atau ahli waris",
  dpcp: "DPCP/Data Perorangan Calon Penerima Pensiun yang sudah ditandatangani",
  sk_cpns: "SK CPNS",
  sk_pns: "SK PNS",
  sk_pangkat: "SK pangkat terakhir",
  sk_jabatan: "SK jabatan terakhir atau surat keterangan jabatan",
  ba_pelantikan_ahli_utama: "BA Pelantikan untuk Jabatan Ahli Utama",
  skp: "SKP/penilaian kinerja 2 tahun terakhir",
  hukdis: "Surat pernyataan tidak sedang/pernah dijatuhi hukuman disiplin sedang/berat",
  kk: "Kartu Keluarga",
  ktp_npwp: "KTP dan NPWP",
  cover_buku_tabungan: "Cover Buku Tabungan",
  akta_nikah: "Akta nikah atau akta cerai",
  akta_anak: "Akta kelahiran anak yang masih ditanggung",
  pas_foto: "Pas foto sesuai ketentuan pemberi layanan",
  surat_kematian: "Surat kematian",
  keterangan_janda_duda: "Surat keterangan janda/duda dan data ahli waris"
};
export const PENSION_DOCUMENT_RULES = {
  surat_pengantar: "Wajib", permohonan: "Sesuai jenis", dpcp: "Wajib", sk_cpns: "Wajib", sk_pns: "Wajib", sk_pangkat: "Wajib",
  sk_jabatan: "Wajib bila menjabat", ba_pelantikan_ahli_utama: "Untuk Jabatan Ahli Utama", skp: "Wajib 2 tahun terakhir", hukdis: "Wajib", kk: "Wajib", ktp_npwp: "Wajib", cover_buku_tabungan: "Wajib", akta_nikah: "Jika ada pasangan",
  akta_anak: "Jika ada tanggungan", pas_foto: "Wajib", surat_kematian: "Untuk pensiun janda/duda/tewas/wafat", keterangan_janda_duda: "Untuk pensiun ahli waris"
};
export const PENSION_STATUSES = ["Draft UKPD", "Verifikasi UKPD", "Perbaikan UKPD", "Validasi Dinkes", "Usul BKD/SIASN", "Selesai"];
export const PENSION_TYPES = { BUP: "Batas Usia Pensiun", APS: "Atas Permintaan Sendiri", JANDA_DUDA: "Janda/Duda/Ahli Waris", UZUR: "Tidak cakap jasmani/rohani" };
export const PENSION_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export function parseObject(value) { try { return value && typeof value === 'string' ? JSON.parse(value) : value && typeof value === 'object' ? value : {}; } catch { return {}; } }
export function emptyVerification() { return Object.fromEntries(Object.keys(PENSION_DOCUMENT_LABELS).map(key => [key, false])); }
export function normalizeVerification(value) { return { ...emptyVerification(), ...parseObject(value) }; }
export function documentProgress(dokumen, verifikasi) { const docs=parseObject(dokumen), ver=normalizeVerification(verifikasi), keys=Object.keys(PENSION_DOCUMENT_LABELS); return { total: keys.length, uploaded: keys.filter(k=>docs[k]?.path).length, verified: keys.filter(k=>docs[k]?.path && ver[k]).length }; }
export function normalizedDocumentName(key, nip, name) { return `${key}-${String(nip || name || 'pensiun').replace(/[^a-z0-9_-]+/gi,'-')}.pdf`; }
