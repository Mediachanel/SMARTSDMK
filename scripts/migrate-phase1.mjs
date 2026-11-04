import fs from "node:fs";
import pg from "pg";
import { loadDefaultEnv } from "./env.mjs";

const { Pool } = pg;
const MIGRATION_PATH = "prisma/migrations/202605110001_phase1_core_rbac_audit/migration.sql";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} wajib diset.`);
  return value;
}

function databaseConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return {
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || "postgres",
    password: required("POSTGRES_PASSWORD"),
    database: process.env.POSTGRES_DATABASE || "si_data"
  };
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

loadDefaultEnv();

const migrationSql = fs.readFileSync(MIGRATION_PATH, "utf8");
const pool = new Pool(databaseConfig());
const client = await pool.connect();

try {
  await client.query("BEGIN");
  for (const statement of splitSqlStatements(migrationSql)) {
    await client.query(statement);
  }
  await client.query("COMMIT");
  console.log("Migration Phase 1 selesai.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
