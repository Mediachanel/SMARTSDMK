import fs from "node:fs";
import path from "node:path";

const generatedDir = path.resolve("src/data/generated");
const outputPath = path.resolve("sql/import_keluarga_generated.sql");
const partsDir = path.resolve("sql/import_keluarga_generated_parts");
const totalParts = 20;

const keluargaPath = path.join(generatedDir, "keluarga.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  const text = String(value ?? "").replace(/\u0000/g, "").trim();
  return text || null;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${month}-${day}`;
  }
  return text;
}

function sqlValue(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  const text = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
  return `'${text}'`;
}

function buildInsertLines(rows, commentLines) {
  const lines = [
    ...commentLines,
    "",
    'INSERT INTO "keluarga" ("id_pegawai", "hubungan", "hubungan_detail", "status_punya", "status_tunjangan", "urutan", "nama", "jenis_kelamin", "tempat_lahir", "tanggal_lahir", "no_tlp", "email", "pekerjaan", "sumber_tabel", "sumber_id", "created_at") VALUES'
  ];

  rows.forEach((item, index) => {
    const row = [
      item.id_pegawai,
      item.hubungan,
      item.hubungan_detail,
      item.status_punya,
      item.status_tunjangan,
      item.urutan,
      item.nama,
      item.jenis_kelamin,
      item.tempat_lahir,
      item.tanggal_lahir,
      item.no_tlp,
      item.email,
      item.pekerjaan,
      item.sumber_tabel,
      item.sumber_id,
      item.created_at
    ];
    lines.push(`(${row.map(sqlValue).join(", ")})${index === rows.length - 1 ? "" : ","}`);
  });

  lines.push(
    "",
    'ON CONFLICT ("sumber_tabel", "sumber_id") DO UPDATE SET',
    '  "id_pegawai" = EXCLUDED."id_pegawai",',
    '  "hubungan" = EXCLUDED."hubungan",',
    '  "hubungan_detail" = EXCLUDED."hubungan_detail",',
    '  "status_punya" = EXCLUDED."status_punya",',
    '  "status_tunjangan" = EXCLUDED."status_tunjangan",',
    '  "urutan" = EXCLUDED."urutan",',
    '  "nama" = EXCLUDED."nama",',
    '  "jenis_kelamin" = EXCLUDED."jenis_kelamin",',
    '  "tempat_lahir" = EXCLUDED."tempat_lahir",',
    '  "tanggal_lahir" = EXCLUDED."tanggal_lahir",',
    '  "no_tlp" = EXCLUDED."no_tlp",',
    '  "email" = EXCLUDED."email",',
    '  "pekerjaan" = EXCLUDED."pekerjaan",',
    '  "created_at" = EXCLUDED."created_at";'
  );

  return lines;
}

let keluarga;
let breakdown;
const sourceLabel = "src/data/generated/keluarga.json";

if (!fs.existsSync(keluargaPath)) {
  throw new Error(`File keluarga tidak ditemukan: ${keluargaPath}`);
}

const keluargaRaw = readJson(keluargaPath);
keluarga = keluargaRaw.map((item, index) => ({
  id_pegawai: Number(item.id_pegawai),
  hubungan: normalizeText(item.hubungan),
  hubungan_detail: normalizeText(item.hubungan_detail),
  status_punya: normalizeText(item.status_punya),
  status_tunjangan: normalizeText(item.status_tunjangan),
  urutan: item.urutan === "" || item.urutan === null || item.urutan === undefined ? null : Number(item.urutan),
  nama: normalizeText(item.nama),
  jenis_kelamin: normalizeText(item.jenis_kelamin),
  tempat_lahir: normalizeText(item.tempat_lahir),
  tanggal_lahir: normalizeDate(item.tanggal_lahir),
  no_tlp: normalizeText(item.no_tlp),
  email: normalizeText(item.email),
  pekerjaan: normalizeText(item.pekerjaan),
  sumber_tabel: normalizeText(item.sumber_tabel) || "keluarga",
  sumber_id: Number(item.sumber_id ?? item.id ?? index + 1),
  created_at: normalizeDate(item.created_at)
}));
breakdown = {
  pasangan: keluarga.filter((item) => item.hubungan === "pasangan").length,
  anak: keluarga.filter((item) => item.hubungan === "anak").length
};

keluarga = keluarga.sort((a, b) => {
  if (a.id_pegawai !== b.id_pegawai) return a.id_pegawai - b.id_pegawai;
  if (a.hubungan !== b.hubungan) return a.hubungan.localeCompare(b.hubungan);
  return (a.urutan || 0) - (b.urutan || 0);
});

const fullLines = buildInsertLines(keluarga, [
  `-- Import data keluarga dari ${sourceLabel}`,
  "-- Jalankan setelah tabel `keluarga` dibuat. Aman dijalankan berulang.",
  `-- Versi terpecah tersedia di ${path.relative(process.cwd(), partsDir).replace(/\\/g, "/")}.`
]);

fullLines.push(
  "",
  `SELECT ${keluarga.length} AS total_keluarga_generated, ${breakdown.pasangan} AS total_pasangan_generated, ${breakdown.anak} AS total_anak_generated;`,
  ""
);

fs.writeFileSync(outputPath, fullLines.join("\n"));

fs.rmSync(partsDir, { recursive: true, force: true });
fs.mkdirSync(partsDir, { recursive: true });

const partSize = Math.ceil(keluarga.length / totalParts);

for (let partIndex = 0; partIndex < totalParts; partIndex += 1) {
  const start = partIndex * partSize;
  const end = Math.min(start + partSize, keluarga.length);
  const rows = keluarga.slice(start, end);
  if (rows.length === 0) break;

  const filename = `import_keluarga_part_${String(partIndex + 1).padStart(2, "0")}.sql`;
  const partLines = buildInsertLines(rows, [
    `-- Import data keluarga dari ${sourceLabel}`,
    `-- Bagian ${partIndex + 1} dari ${totalParts}. Jalankan setelah tabel \`keluarga\` dibuat.`,
    "-- Aman dijalankan berulang."
  ]);
  partLines.push("");

  fs.writeFileSync(path.join(partsDir, filename), partLines.join("\n"));
}

console.log(
  `Generated ${outputPath} and ${totalParts} split files in ${partsDir} ` +
    `with ${keluarga.length} rows (${breakdown.pasangan} pasangan + ${breakdown.anak} anak).`
);
