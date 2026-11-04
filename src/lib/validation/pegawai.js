import { z } from "zod";

const nullableText = z.string().trim().max(255).nullable().optional().or(z.literal(""));

export const pegawaiPayloadSchema = z.object({
  nama: z.string().trim().min(3).max(180),
  nama_ukpd: z.string().trim().min(3).max(220),
  jenis_pegawai: z.string().trim().min(2).max(80),
  nama_jabatan_orb: nullableText,
  nama_jabatan_menpan: nullableText,
  status_rumpun: nullableText,
  nip: nullableText,
  nrk: nullableText,
  nik: nullableText,
  email: z.string().trim().email().max(180).nullable().optional().or(z.literal("")),
  jenis_kelamin: nullableText,
  kondisi: nullableText,
  tanggal_kondisi: nullableText,
  alamat: z.unknown().optional(),
  pasangan: z.unknown().optional(),
  anak: z.unknown().optional(),
  keluarga: z.unknown().optional(),
  riwayat_pendidikan: z.unknown().optional(),
  riwayat_jabatan: z.unknown().optional(),
  riwayat_gaji_pokok: z.unknown().optional(),
  riwayat_pangkat: z.unknown().optional(),
  riwayat_penghargaan: z.unknown().optional(),
  riwayat_skp: z.unknown().optional(),
  riwayat_hukuman_disiplin: z.unknown().optional(),
  riwayat_prestasi_pendidikan: z.unknown().optional(),
  riwayat_narasumber: z.unknown().optional(),
  riwayat_kegiatan_strategis: z.unknown().optional(),
  riwayat_keberhasilan: z.unknown().optional()
}).passthrough().superRefine((data, context) => {
  const kondisiWajibTanggal = ["TIDAK AKTIF", "RESIGN", "PENSIUN"].includes(String(data.kondisi || "").trim().toUpperCase());
  if (kondisiWajibTanggal && !String(data.tanggal_kondisi || "").trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["tanggal_kondisi"], message: "Tanggal efektif kondisi wajib diisi." });
  }
  if (String(data.jenis_pegawai || "").trim().toUpperCase() === "PJLP") return;
  for (const [field, message] of [
    ["nama_jabatan_orb", "Jabatan Pergub 1 Tahun 2017 wajib dipilih."],
    ["nama_jabatan_menpan", "Jabatan Kepmenpan 11 wajib dipilih."],
    ["status_rumpun", "Status rumpun wajib dipilih."]
  ]) {
    if (!String(data[field] || "").trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
  }
});

export function parsePositiveId(value) {
  const id = Number.parseInt(String(value || ""), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sanitizeText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>]/g, "")
    .trim();
}

export function sanitizeNestedText(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeNestedText);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizeNestedText(item)])
  );
}

export function sanitizePegawaiPayload(payload) {
  return sanitizeNestedText(payload);
}
