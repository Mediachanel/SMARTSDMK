import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

// Explicit environment only: never auto-load production .env.deploy.
if (!process.env.DATABASE_URL && !process.env.POSTGRES_HOST) throw new Error('Set DATABASE_URL atau POSTGRES_HOST dan kredensial target secara eksplisit.');
const sql = await fs.readFile(new URL('../prisma/migrations/202609110001_promotion/migration.sql', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DATABASE
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(20260911,1)");
  await client.query('CREATE TABLE IF NOT EXISTS promotion_migrations (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const { rows } = await client.query('SELECT checksum FROM promotion_migrations WHERE name=$1', ['202609110001_promotion']);
  if (rows.length && rows[0].checksum !== checksum) throw new Error('Checksum migration berubah setelah diterapkan. Buat migration baru.');
  if (!rows.length) {
    await client.query(sql);
    await client.query('INSERT INTO promotion_migrations(name,checksum) VALUES($1,$2)', ['202609110001_promotion',checksum]);
  }
  await client.query('COMMIT');
  console.log(rows.length ? 'Migration KP sudah diterapkan.' : 'Migration KP selesai; master kebijakan masih perlu dikonfigurasi.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { client.release(); await pool.end(); }
