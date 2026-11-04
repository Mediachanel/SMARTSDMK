import fs from "node:fs";
import path from "node:path";

const pegawaiPath = path.resolve("src/data/generated/pegawai.json");
const ukpdPath = path.resolve("src/data/generated/ukpd.json");
const outputDir = path.resolve("sql/per-ukpd");

const pegawai = JSON.parse(fs.readFileSync(pegawaiPath, "utf8"));
const ukpd = JSON.parse(fs.readFileSync(ukpdPath, "utf8"));

const ukpdColumns = [
  "id_ukpd",
  "ukpd_id",
  "nama_ukpd",
  "password",
  "jenis_ukpd",
  "role",
  "wilayah",
  "created_at"
];

const pegawaiColumns = [
  "id_pegawai",
  "nama",
  "jenis_kelamin",
  "tempat_lahir",
  "tanggal_lahir",
  "nik",
  "agama",
  "nama_ukpd",
  "jenis_ukpd",
  "wilayah",
  "jenis_pegawai",
  "status_rumpun",
  "jenis_kontrak",
  "nrk",
  "nip",
  "nama_jabatan_orb",
  "nama_jabatan_menpan",
  "struktur_atasan_langsung",
  "pangkat_golongan",
  "tmt_pangkat_terakhir",
  "jenjang_pendidikan",
  "program_studi",
  "nama_universitas",
  "no_hp_pegawai",
  "email",
  "no_bpjs",
  "kondisi",
  "status_perkawinan",
  "gelar_depan",
  "gelar_belakang",
  "tmt_kerja_ukpd",
  "created_at",
  "id_ukpd",
  "ukpd_id",
  "jenjang_pendidikan_raw",
  "status_rumpun_raw",
  "nama_jabatan_menpan_raw",
  "jenis_kelamin_raw"
];

const schemaSql = `CREATE TABLE IF NOT EXISTS "ukpd" (
  "id_ukpd" INT NOT NULL,
  "ukpd_id" INT NULL,
  "nama_ukpd" VARCHAR(255) NOT NULL,
  "password" VARCHAR(255) NULL,
  "jenis_ukpd" VARCHAR(100) NULL,
  "role" VARCHAR(50) NULL,
  "wilayah" VARCHAR(100) NULL,
  "created_at" DATE NULL,
  PRIMARY KEY ("id_ukpd")
);

CREATE TABLE IF NOT EXISTS "pegawai" (
  "id_pegawai" INT NOT NULL,
  "nama" VARCHAR(255) NOT NULL,
  "jenis_kelamin" VARCHAR(30) NULL,
  "tempat_lahir" VARCHAR(150) NULL,
  "tanggal_lahir" VARCHAR(30) NULL,
  "nik" VARCHAR(64) NULL,
  "agama" VARCHAR(50) NULL,
  "nama_ukpd" VARCHAR(255) NULL,
  "jenis_ukpd" VARCHAR(100) NULL,
  "wilayah" VARCHAR(100) NULL,
  "jenis_pegawai" VARCHAR(80) NULL,
  "status_rumpun" VARCHAR(255) NULL,
  "jenis_kontrak" VARCHAR(80) NULL,
  "nrk" VARCHAR(64) NULL,
  "nip" VARCHAR(64) NULL,
  "nama_jabatan_orb" VARCHAR(255) NULL,
  "nama_jabatan_menpan" VARCHAR(255) NULL,
  "struktur_atasan_langsung" VARCHAR(255) NULL,
  "pangkat_golongan" VARCHAR(120) NULL,
  "tmt_pangkat_terakhir" VARCHAR(30) NULL,
  "jenjang_pendidikan" VARCHAR(80) NULL,
  "program_studi" VARCHAR(255) NULL,
  "nama_universitas" VARCHAR(255) NULL,
  "no_hp_pegawai" VARCHAR(64) NULL,
  "email" VARCHAR(255) NULL,
  "no_bpjs" VARCHAR(100) NULL,
  "kondisi" VARCHAR(50) NULL,
  "status_perkawinan" VARCHAR(50) NULL,
  "gelar_depan" VARCHAR(120) NULL,
  "gelar_belakang" VARCHAR(255) NULL,
  "tmt_kerja_ukpd" VARCHAR(30) NULL,
  "created_at" DATE NULL,
  "id_ukpd" INT NULL,
  "ukpd_id" INT NULL,
  "jenjang_pendidikan_raw" VARCHAR(80) NULL,
  "status_rumpun_raw" VARCHAR(255) NULL,
  "nama_jabatan_menpan_raw" VARCHAR(255) NULL,
  "jenis_kelamin_raw" VARCHAR(80) NULL,
  PRIMARY KEY ("id_pegawai"),
  CONSTRAINT "fk_pegawai_ukpd" FOREIGN KEY ("id_ukpd") REFERENCES "ukpd" ("id_ukpd") ON DELETE SET NULL ON UPDATE CASCADE
);`;

const perUkpdCompatibilitySql = "";

function escapeSqlString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\u0000/g, "");
}

function toSqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  const text = String(value).trim();
  if (!text) return "NULL";
  return `'${escapeSqlString(text)}'`;
}

function sqlIdentifier(name) {
  return `"${name}"`;
}

function buildInsert(tableName, rows, columns, chunkSize = 1000) {
  if (!rows.length) return "";
  const statements = [];
  const updateColumns = columns.filter((column) => !column.startsWith("id_"));
  const conflictColumn = tableName === "ukpd" ? "id_ukpd" : "id_pegawai";
  const updateClause = updateColumns
    .map((column) => `${sqlIdentifier(column)} = EXCLUDED.${sqlIdentifier(column)}`)
    .join(", ");

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk
      .map((row) => {
        const tuple = columns.map((col) => toSqlValue(row[col])).join(", ");
        return `(${tuple})`;
      })
      .join(",\n");
    statements.push(`INSERT INTO ${sqlIdentifier(tableName)} (${columns.map(sqlIdentifier).join(", ")}) VALUES
${values}
ON CONFLICT (${sqlIdentifier(conflictColumn)}) DO UPDATE SET ${updateClause};`);
  }
  return statements.join("\n\n");
}

function safeFilename(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const byUkpdId = new Map();
for (const p of pegawai) {
  const key = Number(p.id_ukpd) || Number(p.ukpd_id);
  if (!key) continue;
  if (!byUkpdId.has(key)) byUkpdId.set(key, []);
  byUkpdId.get(key).push(p);
}

fs.mkdirSync(outputDir, { recursive: true });

const generated = [];
for (const u of ukpd) {
  const key = Number(u.id_ukpd);
  const rows = byUkpdId.get(key) || [];
  if (!rows.length) continue;

  const fileName = `${String(u.id_ukpd).padStart(6, "0")}_${safeFilename(u.nama_ukpd)}.sql`;
  const filePath = path.join(outputDir, fileName);

  const sql = `-- Auto generated on ${new Date().toISOString()}
-- UKPD: ${u.nama_ukpd} (id_ukpd=${u.id_ukpd})
${schemaSql}
${perUkpdCompatibilitySql}

${buildInsert("ukpd", [u], ukpdColumns, 1)}

${buildInsert("pegawai", rows, pegawaiColumns, 500)}

`;

  fs.writeFileSync(filePath, sql, "utf8");
  generated.push({ file: fileName, id_ukpd: u.id_ukpd, nama_ukpd: u.nama_ukpd, rows: rows.length });
}

const manifestPath = path.join(outputDir, "_manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  total_files: generated.length,
  total_pegawai_rows: generated.reduce((sum, item) => sum + item.rows, 0),
  files: generated
}, null, 2), "utf8");

console.log(`Generated ${generated.length} file(s) at ${outputDir}`);
console.log(`Total pegawai rows: ${generated.reduce((sum, item) => sum + item.rows, 0)}`);
