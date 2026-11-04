import { normalizeJabatanStandarOption } from "@/lib/jabatanStandar";

export const AGAMA_OPTIONS = [
  "Islam",
  "Kristen Protestan",
  "Kristen Katolik",
  "Hindu",
  "Buddha",
  "Konghucu",
  "Kepercayaan"
];

export const JENIS_KONTRAK_OPTIONS = ["Tetap", "Kontrak", "Dokter Spesialis Mitra"];

export const PANGKAT_GOLONGAN_OPTIONS = [
  "Juru Muda - I/a",
  "Juru Muda Tingkat I - I/b",
  "Juru - I/c",
  "Juru Tingkat I - I/d",
  "Pengatur Muda - II/a",
  "Pengatur Muda Tingkat I - II/b",
  "Pengatur - II/c",
  "Pengatur Tingkat I - II/d",
  "Penata Muda - III/a",
  "Penata Muda Tingkat I - III/b",
  "Penata - III/c",
  "Penata Tingkat I - III/d",
  "Pembina - IV/a",
  "Pembina Tingkat I - IV/b",
  "Pembina Utama Muda - IV/c",
  "Pembina Utama Madya - IV/d",
  "Pembina Utama - IV/e",
  "Golongan I",
  "Golongan II",
  "Golongan III",
  "Golongan IV",
  "Golongan V",
  "Golongan VI",
  "Golongan VII",
  "Golongan VIII",
  "Golongan IX",
  "Golongan X",
  "Golongan XI",
  "Golongan XII",
  "Golongan XIII",
  "Golongan XIV",
  "Golongan XV",
  "Golongan XVI",
  "Golongan XVII"
];

const PANGKAT_BY_CODE = {
  "I/a": "Juru Muda - I/a",
  "I/b": "Juru Muda Tingkat I - I/b",
  "I/c": "Juru - I/c",
  "I/d": "Juru Tingkat I - I/d",
  "II/a": "Pengatur Muda - II/a",
  "II/b": "Pengatur Muda Tingkat I - II/b",
  "II/c": "Pengatur - II/c",
  "II/d": "Pengatur Tingkat I - II/d",
  "III/a": "Penata Muda - III/a",
  "III/b": "Penata Muda Tingkat I - III/b",
  "III/c": "Penata - III/c",
  "III/d": "Penata Tingkat I - III/d",
  "IV/a": "Pembina - IV/a",
  "IV/b": "Pembina Tingkat I - IV/b",
  "IV/c": "Pembina Utama Muda - IV/c",
  "IV/d": "Pembina Utama Madya - IV/d",
  "IV/e": "Pembina Utama - IV/e"
};

const PANGKAT_BY_NAME_KEY = {
  JURUMUDA: "Juru Muda - I/a",
  JURUMUDATINGKATI: "Juru Muda Tingkat I - I/b",
  JURU: "Juru - I/c",
  JURUTINGKATI: "Juru Tingkat I - I/d",
  PENGATURMUDA: "Pengatur Muda - II/a",
  PENGATURMUDATINGKATI: "Pengatur Muda Tingkat I - II/b",
  PENGATUR: "Pengatur - II/c",
  PENGATURTINGKATI: "Pengatur Tingkat I - II/d",
  PENATAMUDA: "Penata Muda - III/a",
  PENATAMUDATINGKATI: "Penata Muda Tingkat I - III/b",
  PENATA: "Penata - III/c",
  PENATATINGKATI: "Penata Tingkat I - III/d",
  PEMBINA: "Pembina - IV/a",
  PEMBINATINGKATI: "Pembina Tingkat I - IV/b",
  PEMBINAUTAMAMUDA: "Pembina Utama Muda - IV/c",
  PEMBINAUTAMAMADYA: "Pembina Utama Madya - IV/d",
  PEMBINAUTAMA: "Pembina Utama - IV/e"
};

function normalizeText(value) {
  return String(value || "").trim();
}

function compactKey(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export function normalizeAgamaOption(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const key = compactKey(text);
  if (key === "ISLAM") return "Islam";
  if (key.includes("KATHOLIK") || key.includes("KATOLIK") || key === "CATHOLIC") return "Kristen Katolik";
  if (key.includes("PROTESTAN") || key === "KRISTEN" || key === "PROTESTANT") return "Kristen Protestan";
  if (key === "HINDU") return "Hindu";
  if (key === "BUDHA" || key === "BUDDHA") return "Buddha";
  if (key.includes("KONGHUCU") || key.includes("KHONGHUCU")) return "Konghucu";
  if (key.includes("KEPERCAYAAN")) return "Kepercayaan";
  return text;
}

export function normalizeJenisKontrakOption(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const key = compactKey(text);
  if (!key || key === "-" || key === "TIDAKADA" || key === "NULL" || key === "NA") return "";
  if (key.includes("DOKTERSPESIALISMITRA")) return "Dokter Spesialis Mitra";
  if (key.includes("KONTRAK")) return "Kontrak";
  if (key.includes("TETAP")) return "Tetap";
  return text;
}

function normalizePangkatNameKey(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/\bTK\.?\s*(?:I|1)\b/g, "TINGKAT I")
    .replace(/\bTINGKAT\s*1\b/g, "TINGKAT I")
    .replace(/(?:IV|III|II|I)\s*[\/.\-]?\s*[A-E]\b/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

function extractPangkatCode(value) {
  const compact = normalizeText(value).toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/(IV|III|II|I)[\/.\-]?(A|B|C|D|E)(?![A-Z])/);
  if (!match) return "";
  return `${match[1]}/${match[2].toLowerCase()}`;
}

export function normalizePangkatGolonganOption(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const code = extractPangkatCode(text);
  if (PANGKAT_BY_CODE[code]) return PANGKAT_BY_CODE[code];

  const nameKey = normalizePangkatNameKey(text);
  return PANGKAT_BY_NAME_KEY[nameKey] || text;
}

export function normalizeJenjangPendidikanOption(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const key = compactKey(text);
  if (["D1", "DI"].includes(key)) return "D1";
  if (["D2", "DII"].includes(key)) return "D2";
  if (["D3", "DIII"].includes(key)) return "D3";
  if (["D4", "DIV"].includes(key)) return "D4";
  if (["SMA", "SMK", "SLTA", "STM", "PAKETC", "SMASMK"].includes(key)) return "SMA/SMK";
  if (key === "PROFESI") return "PROFESI";
  if (key === "SPESIALIS") return "SPESIALIS";
  if (["SUBSPESIALIS", "SUBSPESIALISASI"].includes(key)) return "SUBSPESIALIS";
  return ["SD", "SMP", "S1", "S2", "S3"].includes(key) ? key : text;
}

export function normalizeStatusPerkawinanOption(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const key = compactKey(text);
  if (["KAWIN", "MENIKAH", "NIKAH", "KAWIN1ISTRISUAMI"].includes(key)) return "Kawin";
  if (["BELUMKAWIN", "BELUMMENIKAH"].includes(key)) return "Belum Kawin";
  if (key === "CERAIHIDUP") return "Cerai Hidup";
  if (key === "CERAIMATI") return "Cerai Mati";
  return text;
}

export function normalizePegawaiReferenceValue(field, value) {
  if (field === "agama") return normalizeAgamaOption(value);
  if (field === "jenis_kontrak") return normalizeJenisKontrakOption(value);
  if (field === "pangkat_golongan") return normalizePangkatGolonganOption(value);
  if (field === "jenjang_pendidikan") return normalizeJenjangPendidikanOption(value);
  if (field === "status_perkawinan") return normalizeStatusPerkawinanOption(value);
  if (field === "nama_jabatan_menpan" || field === "jabatan_standar") return normalizeJabatanStandarOption(value);
  return value ?? "";
}

export function coercePegawaiReferenceValue(field, value) {
  const normalized = normalizePegawaiReferenceValue(field, value);
  if (field === "agama") return AGAMA_OPTIONS.includes(normalized) ? normalized : "";
  if (field === "jenis_kontrak") return JENIS_KONTRAK_OPTIONS.includes(normalized) ? normalized : "";
  if (field === "pangkat_golongan") return PANGKAT_GOLONGAN_OPTIONS.includes(normalized) ? normalized : "";
  return normalized;
}

export function normalizePegawaiReferencePayload(payload = {}) {
  const normalized = { ...payload };

  for (const field of ["agama", "jenis_kontrak", "pangkat_golongan", "nama_jabatan_menpan", "jenjang_pendidikan", "status_perkawinan"]) {
    if (field in normalized) {
      normalized[field] = normalizePegawaiReferenceValue(field, normalized[field]);
    }
  }

  for (const section of ["riwayat_jabatan", "riwayat_pangkat", "riwayat_gaji_pokok"]) {
    if (!Array.isArray(normalized[section])) continue;
    normalized[section] = normalized[section].map((row) => ({
      ...row,
      nama_jabatan_menpan: normalizeJabatanStandarOption(row?.nama_jabatan_menpan),
      pangkat_golongan: normalizePangkatGolonganOption(row?.pangkat_golongan)
    }));
  }

  for (const section of ["riwayat_pendidikan", "riwayat_prestasi_pendidikan"]) {
    if (!Array.isArray(normalized[section])) continue;
    normalized[section] = normalized[section].map((row) => ({
      ...row,
      jenjang_pendidikan: normalizeJenjangPendidikanOption(row?.jenjang_pendidikan)
    }));
  }

  return normalized;
}
