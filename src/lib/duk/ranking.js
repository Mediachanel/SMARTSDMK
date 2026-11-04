const PANGKAT_CODES = [
  "IV/e", "IV/d", "IV/c", "IV/b", "IV/a", "III/d", "III/c", "III/b", "III/a",
  "II/d", "II/c", "II/b", "II/a", "I/d", "I/c", "I/b", "I/a"
];

const PANGKAT_NAMES = [
  ["pembina utama"], ["pembina utama madya"], ["pembina utama muda"],
  ["pembina tingkat i", "pembina tk.i", "pembina tk i"], ["pembina"],
  ["penata tingkat i", "penata tk.i", "penata tk i"], ["penata"],
  ["penata muda tingkat i", "penata muda tk.i", "penata muda tk i"], ["penata muda"],
  ["pengatur tingkat i", "pengatur tk.i", "pengatur tk i"], ["pengatur"],
  ["pengatur muda tingkat i", "pengatur muda tk.i", "pengatur muda tk i"], ["pengatur muda"],
  ["juru tingkat i", "juru tk.i", "juru tk i"], ["juru"],
  ["juru muda tingkat i", "juru muda tk.i", "juru muda tk i"], ["juru muda"]
];

const EDUCATION_RANK = {
  S3: 12, SPESIALIS: 11, S2: 10, PROFESI: 9, S1: 8, D4: 7, D3: 6, D2: 5, D1: 4,
  "SMA/SMK": 3, SMA: 3, SMK: 3, SLTA: 3, SMP: 2, SLTP: 2, SD: 1
};

export function parseDukDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}$/.test(text)) return new Date(Number(text), 0, 1);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return new Date(`${text.slice(0, 10)}T00:00:00`);
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dukPangkatRank(value) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  const codeIndex = PANGKAT_CODES.findIndex((code) => {
    const [group, level] = code.toLowerCase().split("/");
    return new RegExp(`(^|[^a-z0-9])${group}\\s*[/.]?\\s*${level}([^a-z0-9]|$)`).test(text);
  });
  if (codeIndex >= 0) return codeIndex;
  const nameIndex = PANGKAT_NAMES.findIndex((names) => names.some((name) => text === name));
  return nameIndex >= 0 ? nameIndex : 999;
}

export function dukEducationRank(value) {
  const text = String(value || "").toUpperCase();
  const key = Object.keys(EDUCATION_RANK).find((item) => text.includes(item));
  return key ? EDUCATION_RANK[key] : 0;
}

export function dukJabatanRank(item) {
  const eselon = String(item?.eselon || "").toUpperCase().replace(/\s+/g, "");
  const match = eselon.match(/(?:ESELON)?(I{1,4})[/. -]?([AB])?/);
  if (match) {
    const level = { I: 1, II: 2, III: 3, IV: 4 }[match[1]] || 9;
    return level * 10 + (match[2] === "B" ? 2 : 1);
  }
  const type = String(item?.jenis_jabatan || "").toLowerCase();
  if (type.includes("pimpinan tinggi")) return 25;
  if (type.includes("administrator")) return 35;
  if (type.includes("pengawas")) return 45;
  return 99;
}

export function nipAppointmentDate(nip) {
  const digits = String(nip || "").replace(/\D/g, "");
  if (digits.length !== 18) return null;
  const year = Number(digits.slice(8, 12));
  const month = Number(digits.slice(12, 14));
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function dateOrder(value) {
  return parseDukDate(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

export function compareDuk(a, b) {
  return dukPangkatRank(a.pangkat_golongan) - dukPangkatRank(b.pangkat_golongan)
    || dateOrder(a.tmt_pangkat_terakhir) - dateOrder(b.tmt_pangkat_terakhir)
    || dukJabatanRank(a) - dukJabatanRank(b)
    || dateOrder(a.tmt_jabatan) - dateOrder(b.tmt_jabatan)
    || (nipAppointmentDate(a.nip)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (nipAppointmentDate(b.nip)?.getTime() ?? Number.MAX_SAFE_INTEGER)
    || Number(Boolean(b.nama_latihan_jabatan)) - Number(Boolean(a.nama_latihan_jabatan))
    || dateOrder(a.tanggal_lulus_latihan) - dateOrder(b.tanggal_lulus_latihan)
    || dukEducationRank(b.jenjang_pendidikan) - dukEducationRank(a.jenjang_pendidikan)
    || dateOrder(a.tanggal_lulus_pendidikan) - dateOrder(b.tanggal_lulus_pendidikan)
    || dateOrder(a.tanggal_lahir) - dateOrder(b.tanggal_lahir)
    || String(a.nip || "").localeCompare(String(b.nip || ""), "id");
}

export function getDukCompleteness(item) {
  const checks = [
    ["pangkat", item?.pangkat_golongan], ["TMT pangkat", parseDukDate(item?.tmt_pangkat_terakhir)],
    ["jabatan", item?.nama_jabatan_menpan || item?.nama_jabatan_orb], ["TMT jabatan", parseDukDate(item?.tmt_jabatan)],
    ["masa kerja", nipAppointmentDate(item?.nip)], ["pendidikan", item?.jenjang_pendidikan],
    ["tanggal lulus", parseDukDate(item?.tanggal_lulus_pendidikan)], ["tanggal lahir", parseDukDate(item?.tanggal_lahir)]
  ];
  const missing = checks.filter(([, value]) => !value).map(([label]) => label);
  return { complete: missing.length === 0, missing };
}
