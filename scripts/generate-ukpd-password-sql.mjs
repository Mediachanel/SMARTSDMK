import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, "src", "data", "generated", "ukpd.json");
const outputPath = path.join(rootDir, "sql", process.env.UKPD_PASSWORD_SQL_FILE || "ukpd_password_generated.sql");
const DEFAULT_PASSWORD_LABEL = String(process.env.UKPD_DEFAULT_PASSWORD || "");
const BLOCKED_PASSWORDS = new Set(["admin123", "password123", "123456", "12345678"]);

if (DEFAULT_PASSWORD_LABEL.length < 12 || BLOCKED_PASSWORDS.has(DEFAULT_PASSWORD_LABEL)) {
  throw new Error("Set UKPD_DEFAULT_PASSWORD minimal 12 karakter dan jangan pakai password default/lemah.");
}

const DEFAULT_PASSWORD_HASH = await bcrypt.hash(DEFAULT_PASSWORD_LABEL, 12);

const columns = [
  "id_ukpd",
  "ukpd_id",
  "nama_ukpd",
  "password",
  "jenis_ukpd",
  "role",
  "wilayah",
  "created_at",
];

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function sqlIdentifier(name) {
  return `"${name}"`;
}

const rows = JSON.parse(await fs.readFile(sourcePath, "utf8"))
  .slice()
  .sort((left, right) => Number(left.id_ukpd) - Number(right.id_ukpd));

const columnSql = columns.map(sqlIdentifier).join(", ");
const valuesSql = rows
  .map((row) => {
    const values = [
      row.id_ukpd,
      row.ukpd_id,
      row.nama_ukpd,
      DEFAULT_PASSWORD_HASH,
      row.jenis_ukpd,
      row.role,
      row.wilayah,
      row.created_at,
    ];
    return `(${values.map(sqlValue).join(", ")})`;
  })
  .join(",\n");

const updateSql = columns
  .filter((column) => column !== "id_ukpd")
  .map((column) => `${sqlIdentifier(column)} = EXCLUDED.${sqlIdentifier(column)}`)
  .join(", ");

const sql = `-- Auto generated on ${new Date().toISOString()}
-- Seed lengkap tabel ukpd dengan password hash bcrypt untuk ${DEFAULT_PASSWORD_LABEL}

CREATE TABLE IF NOT EXISTS "ukpd" (
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

INSERT INTO "ukpd" (${columnSql}) VALUES
${valuesSql}
ON CONFLICT ("id_ukpd") DO UPDATE SET ${updateSql};
`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, sql);

console.log(`Generated ${path.relative(rootDir, outputPath)} with ${rows.length} ukpd rows.`);
