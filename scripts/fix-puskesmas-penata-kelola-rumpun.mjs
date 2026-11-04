import pg from "pg";
import { loadEnvFile } from "./env.mjs";

const { Pool } = pg;

const APPLY = process.argv.includes("--apply");
const TARGET_MENPAN = "Penata Kelola Sistem dan Teknologi Informasi";
const TARGET_RUMPUN = "Jabatan Pelaksana Teknis Tingkat Ahli";
const TEMPLATE = "PUSKESMAS";

loadEnvFile(process.env.PETA_ENV_FILE || ".env.deploy")
  || loadEnvFile(".env.local")
  || loadEnvFile(".env");

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "",
  database: process.env.POSTGRES_DATABASE || "si_data",
  application_name: "fix-puskesmas-penata-kelola-rumpun"
});

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function printRows(label, rows, limit = 12) {
  console.log(`\n${label}: ${rows.length}`);
  for (const row of rows.slice(0, limit)) {
    console.log(`- ${[
      row.id || row.id_pegawai || "",
      row.nama_ukpd_source || row.nama_ukpd || "",
      row.nama || "",
      row.nrk || "",
      row.nama_jabatan_orb || "",
      row.nama_jabatan_menpan || "",
      row.rumpun_jabatan || row.status_rumpun || ""
    ].map(text).filter(Boolean).join(" | ")}`);
  }
  if (rows.length > limit) console.log(`... ${rows.length - limit} baris lain`);
}

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const { rows: petaBefore } = await client.query(
    `SELECT id, nama_ukpd_source, nama_jabatan_orb, nama_jabatan_menpan, atasan_langsung, rumpun_jabatan
       FROM peta_jabatan
      WHERE upper(btrim(coalesce(template_ukpd, ''))) = $1
        AND lower(btrim(coalesce(nama_jabatan_menpan, ''))) = lower($2)
      ORDER BY nama_ukpd_source NULLS LAST, nama_jabatan_orb, atasan_langsung, id`,
    [TEMPLATE, TARGET_MENPAN]
  );

  const { rows: pegawaiBefore } = await client.query(
    `WITH puskesmas_ukpd AS (
       SELECT lower(btrim(nama_ukpd)) AS nama_ukpd
         FROM ukpd
        WHERE upper(concat_ws(' ', coalesce(jenis_ukpd, ''), coalesce(nama_ukpd, ''))) LIKE '%PUSKESMAS%'
           OR upper(concat_ws(' ', coalesce(jenis_ukpd, ''), coalesce(nama_ukpd, ''))) LIKE '%PUSAT KESEHATAN MASYARAKAT%'
     )
     SELECT p.id_pegawai, p.nama_ukpd, p.nama, p.nrk, p.nip, p.nama_jabatan_orb, p.nama_jabatan_menpan, p.status_rumpun
       FROM pegawai p
      WHERE lower(btrim(coalesce(p.nama_jabatan_menpan, ''))) = lower($1)
        AND (
          lower(btrim(coalesce(p.nama_ukpd, ''))) IN (SELECT nama_ukpd FROM puskesmas_ukpd)
          OR upper(coalesce(p.nama_ukpd, '')) LIKE 'PUSKESMAS%'
          OR upper(coalesce(p.nama_ukpd, '')) LIKE '%PUSAT KESEHATAN MASYARAKAT%'
        )
      ORDER BY p.nama_ukpd, p.nama, p.id_pegawai`,
    [TARGET_MENPAN]
  );

  printRows("Peta Puskesmas ditemukan sebelum update", petaBefore);
  printRows("Pegawai Puskesmas ditemukan sebelum update", pegawaiBefore);

  const { rows: updatedPeta } = await client.query(
    `UPDATE peta_jabatan
        SET rumpun_jabatan = $1,
            updated_at = CURRENT_TIMESTAMP
      WHERE upper(btrim(coalesce(template_ukpd, ''))) = $2
        AND lower(btrim(coalesce(nama_jabatan_menpan, ''))) = lower($3)
        AND lower(btrim(coalesce(rumpun_jabatan, ''))) <> lower($1)
      RETURNING id, nama_ukpd_source, nama_jabatan_orb, nama_jabatan_menpan, atasan_langsung, rumpun_jabatan`,
    [TARGET_RUMPUN, TEMPLATE, TARGET_MENPAN]
  );

  const { rows: updatedPegawai } = await client.query(
    `WITH puskesmas_ukpd AS (
       SELECT lower(btrim(nama_ukpd)) AS nama_ukpd
         FROM ukpd
        WHERE upper(concat_ws(' ', coalesce(jenis_ukpd, ''), coalesce(nama_ukpd, ''))) LIKE '%PUSKESMAS%'
           OR upper(concat_ws(' ', coalesce(jenis_ukpd, ''), coalesce(nama_ukpd, ''))) LIKE '%PUSAT KESEHATAN MASYARAKAT%'
     )
     UPDATE pegawai p
        SET status_rumpun = $1,
            status_rumpun_raw = $1,
            updated_at = CURRENT_TIMESTAMP
      WHERE lower(btrim(coalesce(p.nama_jabatan_menpan, ''))) = lower($2)
        AND (
          lower(btrim(coalesce(p.nama_ukpd, ''))) IN (SELECT nama_ukpd FROM puskesmas_ukpd)
          OR upper(coalesce(p.nama_ukpd, '')) LIKE 'PUSKESMAS%'
          OR upper(coalesce(p.nama_ukpd, '')) LIKE '%PUSAT KESEHATAN MASYARAKAT%'
        )
        AND (
          lower(btrim(coalesce(p.status_rumpun, ''))) <> lower($1)
          OR lower(btrim(coalesce(p.status_rumpun_raw, ''))) <> lower($1)
        )
      RETURNING p.id_pegawai, p.nama_ukpd, p.nama, p.nrk, p.nip, p.nama_jabatan_orb, p.nama_jabatan_menpan, p.status_rumpun`,
    [TARGET_RUMPUN, TARGET_MENPAN]
  );

  printRows("Peta yang akan/berhasil diubah", updatedPeta);
  printRows("Pegawai yang akan/berhasil diubah", updatedPegawai);

  if (APPLY) {
    await client.query("COMMIT");
    console.log("\nCOMMIT selesai.");
  } else {
    await client.query("ROLLBACK");
    console.log("\nDry-run selesai. Jalankan dengan --apply untuk commit.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
