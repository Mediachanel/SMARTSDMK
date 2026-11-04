import pg from "pg";
import { loadDefaultEnv } from "./env.mjs";

function numberPort(value) {
  const port = Number(value || 5432);
  return Number.isFinite(port) ? port : 5432;
}

loadDefaultEnv();

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || process.env.PGHOST || "localhost",
  port: numberPort(process.env.POSTGRES_PORT || process.env.PGPORT),
  user: process.env.POSTGRES_USER || process.env.PGUSER || "postgres",
  password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "",
  database: process.env.POSTGRES_DATABASE || process.env.PGDATABASE || "si_data",
  connectionTimeoutMillis: numberPort(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 1500)
});

try {
  const result = await pool.query("SELECT current_database() AS database, current_user AS user");
  const row = result.rows[0];
  console.log(`PostgreSQL tersambung: database=${row.database}, user=${row.user}`);
} finally {
  await pool.end();
}
