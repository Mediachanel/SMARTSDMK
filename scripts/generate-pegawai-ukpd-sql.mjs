import fs from "node:fs";
import path from "node:path";

const pegawaiPath = path.resolve("src/data/generated/pegawai.json");
const ukpdPath = path.resolve("src/data/generated/ukpd.json");
const outputPath = path.resolve("sql/export_pegawai_ukpd.sql");

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

function buildInsertRows(rows, columns, chunkSize = 1000) {
  const statements = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk
      .map((row) => {
        const tuple = columns.map((col) => toSqlValue(row[col])).join(", ");
        return `(${tuple})`;
      })
      .join(",\n");
    statements.push(
      `INSERT INTO ${sqlIdentifier(columns === ukpdColumns ? "ukpd" : "pegawai")} (${columns.map(sqlIdentifier).join(", ")}) VALUES\n${values};`
    );
  }
  return statements.join("\n\n");
}

const sql = `-- Auto generated on ${new Date().toISOString()}


DROP TABLE IF EXISTS "pegawai";
DROP TABLE IF EXISTS "ukpd";

CREATE TABLE "ukpd" (
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

CREATE TABLE "pegawai" (
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
);

${buildInsertRows(ukpd, ukpdColumns, 500)}

${buildInsertRows(pegawai, pegawaiColumns, 500)}

`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, sql, "utf8");

console.log(`SQL generated: ${outputPath}`);
console.log(`Rows: ukpd=${ukpd.length}, pegawai=${pegawai.length}`);
