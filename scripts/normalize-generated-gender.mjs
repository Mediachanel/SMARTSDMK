import fs from "node:fs";
import path from "node:path";

const pegawaiPath = path.resolve("src/data/generated/pegawai.json");

function normalizeGender(value) {
  const text = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!text || text === "-") return "Tidak Diketahui";
  if (text === "P" || text === "PEREMPUAN" || text === "WANITA") return "Perempuan";
  if (text === "L" || text === "LAKI-LAKI" || text === "LAKI - LAKI" || text === "LAKI LAKI" || text === "PRIA") return "Laki-laki";
  return "Tidak Diketahui";
}

const pegawai = JSON.parse(fs.readFileSync(pegawaiPath, "utf8"));
let changed = 0;
const counts = {};

const updated = pegawai.map((item) => {
  const raw = item.jenis_kelamin_raw || item.jenis_kelamin;
  const normalized = normalizeGender(raw);
  if (normalized !== item.jenis_kelamin) changed += 1;
  counts[normalized] = (counts[normalized] || 0) + 1;
  return {
    ...item,
    jenis_kelamin: normalized,
    jenis_kelamin_raw: raw || ""
  };
});

fs.writeFileSync(pegawaiPath, JSON.stringify(updated));
fs.writeFileSync(path.resolve("src/data/generated/gender-summary.json"), JSON.stringify({
  normalized_at: new Date().toISOString(),
  total_rows: updated.length,
  changed_rows: changed,
  counts
}, null, 2));

console.log(`Changed rows: ${changed}`);
console.log(JSON.stringify(counts, null, 2));
