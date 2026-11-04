import bcrypt from "bcryptjs";
import pg from "pg";
import { loadDefaultEnv } from "./env.mjs";

const { Pool } = pg;

loadDefaultEnv(process.env.SEED_ENV_FILE);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} wajib diset.`);
  return value;
}

function databaseUrlConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return {
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || "postgres",
    password: required("POSTGRES_PASSWORD"),
    database: process.env.POSTGRES_DATABASE || "si_data"
  };
}

const adminPassword = required("SEED_SUPER_ADMIN_PASSWORD");
if (adminPassword.length < 12) {
  throw new Error("SEED_SUPER_ADMIN_PASSWORD minimal 12 karakter.");
}

const pool = new Pool(databaseUrlConfig());

try {
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await pool.query(`
    INSERT INTO roles (code, name, description)
    VALUES
      ('SUPER_ADMIN', 'Super Admin', 'Akses penuh seluruh data dan konfigurasi SI SDMK.'),
      ('ADMIN_WILAYAH', 'Admin Wilayah', 'Akses data pegawai sesuai wilayah administrasi.'),
      ('ADMIN_UKPD', 'Admin UKPD', 'Akses data pegawai pada UKPD sendiri.')
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description
  `);

  await pool.query(
    `INSERT INTO app_users (username, password_hash, role_code, is_active)
     VALUES ($1, $2, 'SUPER_ADMIN', TRUE)
     ON CONFLICT (username) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         role_code = 'SUPER_ADMIN',
         is_active = TRUE,
         updated_at = CURRENT_TIMESTAMP`,
    [process.env.SEED_SUPER_ADMIN_USERNAME || "superadmin", passwordHash]
  );

  console.log("Seed Phase 1 RBAC selesai.");
} finally {
  await pool.end();
}
