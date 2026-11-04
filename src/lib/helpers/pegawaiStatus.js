export const JENIS_PEGAWAI_OPTIONS = [
  "PNS",
  "CPNS",
  "PPPK",
  "PPPK Paruh Waktu",
  "NON PNS",
  "PJLP"
];

export function normalizeJenisPegawai(value) {
  const text = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!text) return "Tidak Diketahui";
  if (text === "PNS") return "PNS";
  if (text === "CPNS") return "CPNS";
  if (text === "PJLP") return "PJLP";
  if (text.includes("PPPK") && text.includes("PARUH")) return "PPPK Paruh Waktu";
  if (text === "PPPK") return "PPPK";
  if (text.includes("NON") && text.includes("PNS")) return "NON PNS";
  return String(value || "").trim();
}

export function isJenisPegawai(item, category) {
  return normalizeJenisPegawai(item?.jenis_pegawai) === category;
}
