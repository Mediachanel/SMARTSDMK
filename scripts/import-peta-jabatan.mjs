import fs from "node:fs";
import pg from "pg";
import { loadEnvFile } from "./env.mjs";

const { Pool } = pg;
loadEnvFile(process.env.PETA_ENV_FILE || ".env.local");

const inputPath = process.argv[2] || "generated/peta-jabatan-import.json";
const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"))
  .filter((row) => String(row.template_ukpd || "").trim().toUpperCase() !== "RSUD ADHYAKSA");
const pool = new Pool({
  host: process.env.POSTGRES_HOST || "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "",
  database: process.env.POSTGRES_DATABASE || "si_data"
});

const schema = `
  CREATE TABLE IF NOT EXISTS peta_jabatan (
    id BIGSERIAL PRIMARY KEY,
    source_key VARCHAR(120) NOT NULL UNIQUE,
    source_sheet VARCHAR(120) NOT NULL,
    source_row INTEGER NOT NULL,
    template_ukpd VARCHAR(120) NOT NULL,
    nama_ukpd_source VARCHAR(255),
    nama_jabatan_orb TEXT,
    kelas_jabatan_orb VARCHAR(30),
    nama_jabatan_menpan TEXT,
    kelas_jabatan_menpan VARCHAR(30),
    atasan_langsung TEXT,
    rumpun_jabatan TEXT,
    kebutuhan_asn INTEGER NOT NULL DEFAULT 0 CHECK (kebutuhan_asn >= 0),
    kebutuhan_non_asn INTEGER NOT NULL DEFAULT 0 CHECK (kebutuhan_non_asn >= 0),
    urutan INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_peta_jabatan_template ON peta_jabatan (template_ukpd, urutan);
  CREATE INDEX IF NOT EXISTS idx_peta_jabatan_menpan ON peta_jabatan (lower(nama_jabatan_menpan));
  CREATE INDEX IF NOT EXISTS idx_peta_jabatan_orb ON peta_jabatan (lower(nama_jabatan_orb));
  CREATE INDEX IF NOT EXISTS idx_peta_jabatan_atasan ON peta_jabatan (lower(atasan_langsung));
  ALTER TABLE peta_jabatan ADD COLUMN IF NOT EXISTS nama_ukpd_source VARCHAR(255);
  CREATE TABLE IF NOT EXISTS peta_jabatan_kebutuhan_override (
    id BIGSERIAL PRIMARY KEY,
    peta_jabatan_id BIGINT NOT NULL REFERENCES peta_jabatan(id) ON DELETE CASCADE,
    nama_ukpd VARCHAR(255) NOT NULL,
    kebutuhan_asn INTEGER NOT NULL DEFAULT 0 CHECK (kebutuhan_asn >= 0),
    kebutuhan_non_asn INTEGER NOT NULL DEFAULT 0 CHECK (kebutuhan_non_asn >= 0),
    updated_by VARCHAR(120),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (peta_jabatan_id, nama_ukpd)
  );
  CREATE INDEX IF NOT EXISTS idx_peta_kebutuhan_override_ukpd ON peta_jabatan_kebutuhan_override (lower(nama_ukpd));
`;

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(schema);
  await client.query("TRUNCATE TABLE peta_jabatan_kebutuhan_override, peta_jabatan RESTART IDENTITY");
  for (const row of rows) {
    await client.query(
      `INSERT INTO peta_jabatan (
         source_key, source_sheet, source_row, template_ukpd, nama_ukpd_source,
         nama_jabatan_orb, kelas_jabatan_orb, nama_jabatan_menpan,
         kelas_jabatan_menpan, atasan_langsung, rumpun_jabatan,
         kebutuhan_asn, kebutuhan_non_asn, urutan
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (source_key) DO UPDATE SET
         source_sheet=EXCLUDED.source_sheet, source_row=EXCLUDED.source_row,
         template_ukpd=EXCLUDED.template_ukpd, nama_ukpd_source=EXCLUDED.nama_ukpd_source, nama_jabatan_orb=EXCLUDED.nama_jabatan_orb,
         kelas_jabatan_orb=EXCLUDED.kelas_jabatan_orb, nama_jabatan_menpan=EXCLUDED.nama_jabatan_menpan,
         kelas_jabatan_menpan=EXCLUDED.kelas_jabatan_menpan, atasan_langsung=EXCLUDED.atasan_langsung,
         rumpun_jabatan=EXCLUDED.rumpun_jabatan, kebutuhan_asn=EXCLUDED.kebutuhan_asn,
         kebutuhan_non_asn=EXCLUDED.kebutuhan_non_asn, urutan=EXCLUDED.urutan,
         updated_at=CURRENT_TIMESTAMP`,
      [row.source_key, row.source_sheet, row.source_row, row.template_ukpd, row.nama_ukpd_source,
       row.nama_jabatan_orb, row.kelas_jabatan_orb, row.nama_jabatan_menpan,
       row.kelas_jabatan_menpan, row.atasan_langsung, row.rumpun_jabatan,
       row.kebutuhan_asn, row.kebutuhan_non_asn, row.urutan]
    );
  }
  await client.query("COMMIT");
  console.log(`Import peta jabatan selesai: ${rows.length} baris.`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
