import crypto from "node:crypto";
import path from "node:path";

export const SURAT_FIELDS = [
  "id_dokumen", "tanggal_terima", "jam_terima", "sumber", "pengirim_wa", "asal_surat",
  "nomor_surat", "tanggal_surat", "perihal", "nama_pegawai_subjek", "nip_nrk",
  "kategori_layanan", "sifat", "prioritas", "tujuan_disposisi", "pelaksana", "status",
  "batas_waktu", "tanggal_disposisi_arsip", "catatan", "tindak_lanjut", "tanggal_selesai",
  "nomor_eoffice", "nomor_surat_kabid", "nomor_surat_umum", "dokumen_link", "ringkasan",
  "confidence", "created_at_source", "updated_at_source"
];

export const SURAT_LABELS = [
  "ID Dokumen", "Tanggal Terima", "Jam Terima", "Sumber", "Pengirim WA", "Asal Surat",
  "Nomor Surat", "Tanggal Surat", "Perihal", "Nama Pegawai/Subjek", "NIP/NRK",
  "Kategori Layanan", "Sifat", "Prioritas", "Tujuan Disposisi", "Pelaksana", "Status",
  "Batas Waktu", "Tanggal Disposisi/Arsip", "Catatan", "Tindak Lanjut", "Tanggal Selesai",
  "Nomor E-Office", "Nomor Surat Kabid", "Nomor Surat Umum", "Link Dokumen", "Ringkasan",
  "Confidence", "Created At", "Updated At"
];

export function cleanText(value, max = 10000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, max);
}

export function rowToRecord(row = []) {
  return Object.fromEntries(SURAT_FIELDS.map((field, index) => [field, cleanText(row[index])]));
}

export function safeFileName(value) {
  const name = path.basename(cleanText(value, 180) || "surat.pdf")
    .normalize("NFKD").replace(/[^a-zA-Z0-9._ -]/g, "").replace(/\s+/g, "-");
  return name || "surat.pdf";
}

export function createDocumentKey(fileName) {
  const extension = path.extname(fileName).slice(0, 12).toLowerCase();
  return `${new Date().toISOString().slice(0, 7).replace("-", "/")}/${Date.now()}-${crypto.randomUUID()}${extension}`;
}
