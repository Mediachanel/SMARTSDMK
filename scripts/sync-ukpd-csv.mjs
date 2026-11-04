import fs from "node:fs";
import path from "node:path";

const ukpdCsvPath = process.argv[2];
const generatedDir = path.resolve("src/data/generated");
const pegawaiPath = path.join(generatedDir, "pegawai.json");
const ukpdPath = path.join(generatedDir, "ukpd.json");
const summaryPath = path.join(generatedDir, "ukpd-sync-summary.json");

if (!ukpdCsvPath) {
  console.error("Usage: node scripts/sync-ukpd-csv.mjs <ukpd-csv-path>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeName(value) {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(rsud|rskd|upt)\b/g, (match) => match.toUpperCase())
    .replace(/\bpuskesmas\b/g, "puskesmas")
    .trim();
  const aliases = {
    "puskesmas mampang perapatan": "puskesmas mampang prapatan",
    "UPT pusdatin": "UPT pusat data dan informasi kesehatan",
    "UPT pusat pelatihan kesehatan daerah": "UPT pusat pelatihan pegawai"
  };
  return aliases[normalized] || normalized;
}

function roleFromJenis(jenis) {
  const normalized = clean(jenis).toLowerCase();
  if (normalized.includes("super")) return "SUPER_ADMIN";
  if (normalized.includes("dinkes")) return "SUPER_ADMIN";
  if (normalized.includes("sudinkes")) return "ADMIN_WILAYAH";
  return "ADMIN_UKPD";
}

const rows = parseCsv(fs.readFileSync(ukpdCsvPath, "utf8"));
const dataRows = rows.slice(1);
const officialUkpd = dataRows.map((row, index) => {
  const ukpdId = Number(clean(row[0]));
  return {
    id_ukpd: Number.isFinite(ukpdId) ? ukpdId : index + 1,
    ukpd_id: Number.isFinite(ukpdId) ? ukpdId : index + 1,
    nama_ukpd: clean(row[1]),
    password: "",
    jenis_ukpd: clean(row[2]),
    role: roleFromJenis(row[2]),
    wilayah: clean(row[3]),
    created_at: new Date().toISOString().slice(0, 10)
  };
}).filter((item) => item.nama_ukpd);

const pegawai = JSON.parse(fs.readFileSync(pegawaiPath, "utf8"));
const ukpdByName = new Map(officialUkpd.map((item) => [normalizeName(item.nama_ukpd), item]));
const unmatchedNames = new Map();
let matchedRows = 0;

const updatedPegawai = pegawai.map((item) => {
  const match = ukpdByName.get(normalizeName(item.nama_ukpd));
  if (!match) {
    unmatchedNames.set(item.nama_ukpd, (unmatchedNames.get(item.nama_ukpd) || 0) + 1);
    return { ...item, id_ukpd: null, ukpd_id: null };
  }
  matchedRows += 1;
  return {
    ...item,
    id_ukpd: match.id_ukpd,
    ukpd_id: match.ukpd_id,
    jenis_ukpd: match.jenis_ukpd || item.jenis_ukpd,
    wilayah: match.wilayah || item.wilayah
  };
});

fs.writeFileSync(ukpdPath, JSON.stringify(officialUkpd));
fs.writeFileSync(pegawaiPath, JSON.stringify(updatedPegawai));
fs.writeFileSync(summaryPath, JSON.stringify({
  source: ukpdCsvPath,
  synced_at: new Date().toISOString(),
  official_ukpd_count: officialUkpd.length,
  pegawai_rows: pegawai.length,
  matched_pegawai_rows: matchedRows,
  unmatched_pegawai_rows: pegawai.length - matchedRows,
  unmatched_ukpd_names: Object.fromEntries([...unmatchedNames.entries()].sort((a, b) => b[1] - a[1]))
}, null, 2));

console.log(`Official UKPD: ${officialUkpd.length}`);
console.log(`Matched pegawai rows: ${matchedRows}/${pegawai.length}`);
console.log(`Unmatched UKPD names: ${unmatchedNames.size}`);
