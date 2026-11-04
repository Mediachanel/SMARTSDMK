import { getConnectedPool } from "@/lib/db/postgres";
import { verifyStoredPassword } from "@/lib/auth/passwordVerifier";

export async function verifyPassword(password, passwordHash) {
  return verifyStoredPassword(password, passwordHash);
}

export async function verifyLoginPassword(password, user) {
  return verifyPassword(password, user?.passwordHash);
}

function normalizeLogin(value) {
  return String(value || "").trim();
}

function normalizeDbUser(row) {
  if (!row) return null;
  return {
    id: row.id_ukpd,
    username: String(row.ukpd_id ?? row.id_ukpd),
    nama_ukpd: row.nama_ukpd,
    role: row.role || "ADMIN_UKPD",
    wilayah: row.wilayah,
    passwordHash: row.password,
    auth_source: "ukpd",
  };
}

function normalizeAppUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nama_ukpd: row.nama_ukpd,
    role: row.role_code,
    wilayah: row.wilayah,
    passwordHash: row.password_hash,
    auth_source: "app_users",
  };
}

function shouldSkipAppUsersLookup() {
  return (
    globalThis.__sisdmkAuthAppUsersAvailable === false &&
    Date.now() < Number(globalThis.__sisdmkAuthAppUsersRetryAt || 0)
  );
}

function markAppUsersUnavailable() {
  globalThis.__sisdmkAuthAppUsersAvailable = false;
  globalThis.__sisdmkAuthAppUsersRetryAt = Date.now() + 60000;
}

function markAppUsersAvailable() {
  globalThis.__sisdmkAuthAppUsersAvailable = true;
  globalThis.__sisdmkAuthAppUsersRetryAt = 0;
}

function isMissingAppUsersTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    message.includes('relation "app_users" does not exist') ||
    message.includes("relation 'app_users' does not exist")
  );
}

async function findAppUser(pool, username) {
  if (shouldSkipAppUsersLookup()) return null;

  try {
    const [rows] = await pool.query(
      `SELECT \`id\`, \`username\`, \`password_hash\`, \`role_code\`, \`wilayah\`, \`nama_ukpd\`
       FROM \`app_users\`
       WHERE LOWER(\`username\`) = LOWER(?)
         AND \`is_active\` = TRUE
       LIMIT 1`,
      [username],
    );
    markAppUsersAvailable();
    return normalizeAppUser(rows[0]);
  } catch (error) {
    if (isMissingAppUsersTable(error)) {
      markAppUsersUnavailable();
      return null;
    }
    if (String(error?.message || "").includes("app_users")) return null;
    throw error;
  }
}

async function findCpnsUser(pool, username) {
  const [rows] = await pool.query(
    `SELECT p.\`id_pegawai\`, p.\`nrk\`, p.\`nip\`, p.\`nama\`, p.\`nama_ukpd\`,
            COALESCE(NULLIF(p.\`wilayah\`, ''), k.\`wilayah\`, '-') AS wilayah
     FROM \`pegawai\` p
     LEFT JOIN \`ukpd\` k ON LOWER(k.\`nama_ukpd\`) = LOWER(p.\`nama_ukpd\`)
     WHERE LOWER(COALESCE(p.\`jenis_pegawai\`, '')) = 'cpns'
       AND LOWER(COALESCE(p.\`kondisi\`, 'aktif')) = 'aktif'
       AND BTRIM(COALESCE(p.\`nrk\`, '')) = ?
       AND BTRIM(COALESCE(p.\`nip\`, '')) <> ''
       AND (
         SELECT COUNT(*)
         FROM \`pegawai\` p2
         WHERE LOWER(COALESCE(p2.\`jenis_pegawai\`, '')) = 'cpns'
           AND LOWER(COALESCE(p2.\`kondisi\`, 'aktif')) = 'aktif'
           AND BTRIM(COALESCE(p2.\`nrk\`, '')) = ?
       ) = 1
     LIMIT 1`,
    [username, username],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id_pegawai,
    id_pegawai: row.id_pegawai,
    username: String(row.nrk),
    nama: row.nama,
    nama_ukpd: row.nama_ukpd,
    role: "CPNS",
    wilayah: row.wilayah,
    passwordPlain: String(row.nip).trim(),
    auth_source: "cpns",
  };
}

export async function findLoginUser(login) {
  const username = normalizeLogin(login);

  const pool = await getConnectedPool();
  const appUser = await findAppUser(pool, username);
  if (appUser) return appUser;

  const [rows] = await pool.query(
    `SELECT \`id_ukpd\`, \`ukpd_id\`, \`nama_ukpd\`, \`password\`, \`role\`, \`wilayah\`
     FROM \`ukpd\`
     WHERE LOWER(\`nama_ukpd\`) = LOWER(?)
        OR CAST(\`id_ukpd\` AS CHAR) = ?
        OR CAST(\`ukpd_id\` AS CHAR) = ?
     LIMIT 1`,
    [username, username, username],
  );
  const dbUser = normalizeDbUser(rows[0]);
  if (dbUser) return dbUser;
  return null;
}
