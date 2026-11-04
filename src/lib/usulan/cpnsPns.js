export const CPNS_PNS_DOCUMENT_MAX_BYTES = 1024 * 1024;
export const CPNS_PNS_DOCUMENT_MAX_MB = 1;

export const CPNS_PNS_STAGE_ONE_CLOSES_AT = new Date("2026-09-04T00:00:00+07:00");
export const CPNS_PNS_STAGE_TWO_OPENS_AT = new Date("2026-09-08T00:00:00+07:00");

export function isCpnsPnsStageOpen(stage, now = new Date()) {
  const value = Number(stage);
  if (value === 1) return now < CPNS_PNS_STAGE_ONE_CLOSES_AT;
  if (value === 2) return now >= CPNS_PNS_STAGE_TWO_OPENS_AT;
  return false;
}

export function activeCpnsPnsStage(now = new Date()) {
  if (now < CPNS_PNS_STAGE_ONE_CLOSES_AT) return 1;
  if (now >= CPNS_PNS_STAGE_TWO_OPENS_AT) return 2;
  return null;
}

export const CPNS_PNS_DOCUMENT_LABELS = {
  usul: "Surat usulan Kepala Perangkat Daerah",
  sk: "SK Pengangkatan CPNS",
  spmt: "Surat Perintah Melaksanakan Tugas (SPMT)",
  sttpl: "STTPL Pelatihan Dasar (dua halaman)",
  suket: "Surat sehat jasmani, rohani, dan tes narkoba",
  skp: "Evaluasi kinerja dua tahun terakhir",
  ijazah: "Ijazah",
  transkrip: "Transkrip nilai"
};

export const CPNS_PNS_FILE_PREFIXES = {
  usul: "USUL",
  sk: "SK",
  spmt: "SPMT",
  sttpl: "STTPL",
  suket: "SUKETSEHAT",
  skp: "SKP",
  ijazah: "IJAZAH",
  transkrip: "TRANSKRIP"
};

export const CPNS_PNS_STATUSES = [
  "Draft CPNS",
  "Diajukan ke Admin UKPD",
  "Dikembalikan ke CPNS",
  "Terverifikasi Admin UKPD",
  "Direkap Dinkes",
  "Diusulkan ke BKD",
  "Selesai"
];

export function parseObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function emptyVerification() {
  return Object.fromEntries(Object.keys(CPNS_PNS_DOCUMENT_LABELS).map((key) => [key, false]));
}

export function normalizeVerification(value) {
  const parsed = parseObject(value);
  return Object.fromEntries(Object.keys(CPNS_PNS_DOCUMENT_LABELS).map((key) => [key, Boolean(parsed[key])]));
}

export function documentProgress(documentsValue, verificationValue) {
  const documents = parseObject(documentsValue);
  const verification = normalizeVerification(verificationValue);
  const keys = Object.keys(CPNS_PNS_DOCUMENT_LABELS);
  const uploaded = keys.filter((key) => documents[key]?.path).length;
  const verified = keys.filter((key) => documents[key]?.path && verification[key]).length;
  return { uploaded, verified, total: keys.length };
}

export function safeFilePart(value, fallback = "TANPA_NAMA") {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 100);
  return clean || fallback;
}

export function normalizedDocumentName(key, nip, nama) {
  return `${CPNS_PNS_FILE_PREFIXES[key] || safeFilePart(key)}_${safeFilePart(nip, "TANPA_NIP")}_${safeFilePart(nama)}.pdf`;
}
