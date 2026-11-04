import fs from "node:fs";
import path from "node:path";

const pegawaiPath = path.resolve("src/data/generated/pegawai.json");

function clean(value) {
  return String(value || "").trim();
}

function normalizeEducation(value) {
  const raw = clean(value);
  if (!raw || raw === "#N/A") return "Tidak Diketahui";
  const text = raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[._]/g, " ")
    .trim();

  if (/\bS5\b/.test(text)) return "Tidak Diketahui";
  if (/\bS\s*3\b|\bS-3\b|\bDOKTOR\b/.test(text)) return "S3";
  if (/SPESIALIS|\bSP\s*1\b|DOKTER SPESIALIS|DR\.?\s*SPESIALIS/.test(text)) return "Spesialis";
  if (/\bS\s*2\b|\bS-2\b|MAGISTER/.test(text)) return "S2";
  if (/PROFESI|NERS|APOTEKER|\bDR\.?\b|DOKTER/.test(text)) return "Profesi";
  if (/\bS\s*1\b|\bS-1\b|\bSI\b|\bSI-1\b|SARJANA/.test(text)) return "S1";
  if (/\bD\s*4\b|\bD-4\b|\bD-IV\b|\bDIV\b/.test(text)) return "D4";
  if (/\bD\s*3\b|\bD-3\b|\bDIII\b|\bD III\b|DIPLOMA III|DIPLOMA 3/.test(text)) return "D3";
  if (/\bD\s*2\b|\bD-2\b/.test(text)) return "D2";
  if (/\bD\s*1\b|\bD-1\b|\bDI\b/.test(text)) return "D1";
  if (/SMA|SMK|SLTA|SMU|STM|SMEA|MA\b|MADRASAH ALIYAH|PAKET C|SPK|SMF|SMAN|STMN/.test(text)) return "SMA/SMK";
  if (/SMP|SLTP/.test(text)) return "SMP";
  if (/\bSD\b/.test(text)) return "SD";
  return "Tidak Diketahui";
}

const pegawai = JSON.parse(fs.readFileSync(pegawaiPath, "utf8"));
const counts = {};
const updated = pegawai.map((item) => {
  const raw = item.jenjang_pendidikan_raw || item.jenjang_pendidikan;
  const normalized = normalizeEducation(raw);
  counts[normalized] = (counts[normalized] || 0) + 1;
  return {
    ...item,
    jenjang_pendidikan: normalized,
    jenjang_pendidikan_raw: raw
  };
});

fs.writeFileSync(pegawaiPath, JSON.stringify(updated));
fs.writeFileSync(path.resolve("src/data/generated/education-summary.json"), JSON.stringify({
  normalized_at: new Date().toISOString(),
  total_rows: updated.length,
  counts
}, null, 2));

console.log(JSON.stringify(counts, null, 2));
