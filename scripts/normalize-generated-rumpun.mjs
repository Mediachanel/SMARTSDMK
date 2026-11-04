import fs from "node:fs";
import path from "node:path";

const pegawaiPath = path.resolve("src/data/generated/pegawai.json");

function clean(value) {
  return String(value || "").trim();
}

function isPjlpJenis(value) {
  return clean(value).toUpperCase() === "PJLP";
}

function normalizeRumpun(value, jenisPegawai) {
  const raw = clean(value);
  const text = raw.toUpperCase().replace(/\s+/g, " ");
  if (isPjlpJenis(jenisPegawai)) return "PJLP";
  if (text.startsWith("PJLP")) return "PJLP";
  if (text === "PETUGAS KEBERSIHAN" || text === "PETUGAS KEAMANAN") return "PJLP";
  const canonicalMap = {
    "JABATAN ADMINISTRATOR": "Jabatan Administrator",
    "JABATAN ADMINISTRATOR/ KEPALA PUSKESMAS": "Jabatan Administrator/ Kepala Puskesmas",
    "JABATAN ADMINISTRATOR / KEPALA PUSKESMAS": "Jabatan Administrator/ Kepala Puskesmas",
    "JABATAN FUNGSIONAL KEAHLIAN KESEHATAN": "Jabatan Fungsional Keahlian Kesehatan",
    "JABATAN FUNGSIONAL KEAHLIAN NON KESEHATAN": "Jabatan Fungsional Keahlian Non Kesehatan",
    "JABATAN FUNGSIONAL KETERAMPILAN KESEHATAN": "Jabatan Fungsional Keterampilan Kesehatan",
    "JABATAN FUNGSIONAL KETERAMPILAN NON KESEHATAN": "Jabatan Fungsional Keterampilan Non Kesehatan",
    "JABATAN PELAKSANA ADMINISTRASI TINGKAT AHLI": "Jabatan Pelaksana Administrasi Tingkat Ahli",
    "JABATAN PELAKSANA ADMINISTRASI TINGKAT TERAMPIL": "Jabatan Pelaksana Administrasi Tingkat Terampil",
    "JABATAN PELAKSANA ADMINISTRASI TINNGKAT TERAMPIL": "Jabatan Pelaksana Administrasi Tingkat Terampil",
    "JABATAN PELAKSANA OPERASIONAL TINGKAT AHLI": "Jabatan Pelaksana Operasional Tingkat Ahli",
    "JABATAN PELAKSANA OPERASIONAL TINGKAT TERAMPIL": "Jabatan Pelaksana Operasional Tingkat Terampil",
    "JABATAN PELAKSANA PELAYANAN TINGKAT TERAMPIL": "Jabatan Pelaksana Pelayanan Tingkat Terampil",
    "JABATAN PELAKSANA SATUAN": "Jabatan Pelaksana Satuan",
    "JABATAN PELAKSANA TEKNIS TINGKAT AHLI": "Jabatan Pelaksana Teknis Tingkat Ahli",
    "JABATAN PELAKSANA TEKNIS TINGKAT TERAMPIL": "Jabatan Pelaksana Teknis Tingkat Terampil",
    "JABATAN PENGAWAS": "Jabatan Pengawas",
    "JABATAN PIMPINAN TINGGI PRATAMA": "Jabatan Pimpinan Tinggi Pratama",
    "STAF": "Staf",
    "TIDAK DIKETAHUI": "Tidak Diketahui"
  };
  if (canonicalMap[text]) return canonicalMap[text];
  return raw || "Tidak Diketahui";
}

const pegawai = JSON.parse(fs.readFileSync(pegawaiPath, "utf8"));
let changed = 0;
const counts = {};

const updated = pegawai.map((item) => {
  const raw = item.status_rumpun_raw || item.status_rumpun;
  const normalized = normalizeRumpun(raw, item.jenis_pegawai);
  if (normalized !== item.status_rumpun) changed += 1;
  counts[normalized] = (counts[normalized] || 0) + 1;
  return {
    ...item,
    status_rumpun: normalized,
    status_rumpun_raw: raw
  };
});

fs.writeFileSync(pegawaiPath, JSON.stringify(updated));
fs.writeFileSync(path.resolve("src/data/generated/rumpun-summary.json"), JSON.stringify({
  normalized_at: new Date().toISOString(),
  total_rows: updated.length,
  changed_rows: changed,
  counts
}, null, 2));

console.log(`Changed rows: ${changed}`);
console.log(JSON.stringify(counts, null, 2));
