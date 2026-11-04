import bcrypt from "bcryptjs";
import { getConnectedPool } from "@/lib/db/postgres";
import { verifyStoredPassword } from "@/lib/auth/passwordVerifier";
import { validatePasswordPolicy } from "@/lib/auth/passwordPolicy";
import { ensurePasswordRotationSchema } from "@/lib/auth/passwordRotation";
import { ensureCpnsAuthSchema } from "@/lib/auth/cpnsActivation";

function isMissingAppUsersTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01"
    || message.includes('relation "app_users" does not exist')
    || message.includes("relation 'app_users' does not exist");
}

function normalizeText(value) {
  return String(value || "").trim();
}

async function findAppUserRecord(pool, user) {
  try {
    const [rows] = await pool.query(
      `SELECT \`id\`, \`username\`, \`password_hash\`, \`role_code\`, \`nama_ukpd\`
       FROM \`app_users\`
       WHERE LOWER(\`username\`) = LOWER(?)
         AND \`is_active\` = TRUE
       LIMIT 1`,
      [normalizeText(user?.username)]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      table: "app_users",
      id: Number(row.id),
      username: row.username,
      namaUkpd: row.nama_ukpd,
      role: row.role_code,
      passwordHash: row.password_hash
    };
  } catch (error) {
    if (isMissingAppUsersTable(error) || String(error?.message || "").includes("app_users")) return null;
    throw error;
  }
}

async function findUkpdRecord(pool, user) {
  const username = normalizeText(user?.username);
  const namaUkpd = normalizeText(user?.nama_ukpd);
  const [rows] = await pool.query(
    `SELECT \`id_ukpd\`, \`ukpd_id\`, \`nama_ukpd\`, \`password\`, \`role\`
     FROM \`ukpd\`
     WHERE \`id_ukpd\` = ?
        OR CAST(\`ukpd_id\` AS CHAR) = ?
        OR LOWER(\`nama_ukpd\`) = LOWER(?)
        OR LOWER(\`nama_ukpd\`) = LOWER(?)
     LIMIT 1`,
    [Number(user?.id) || 0, username, username, namaUkpd]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    table: "ukpd",
    id: Number(row.id_ukpd),
    username: String(row.ukpd_id || row.id_ukpd),
    namaUkpd: row.nama_ukpd,
    role: row.role,
    passwordHash: row.password
  };
}

async function findCurrentPasswordRecord(pool, user) {
  if (user?.auth_source === "cpns" || user?.role === "CPNS") return null;
  if (user?.auth_source === "app_users") return findAppUserRecord(pool, user);
  if (user?.auth_source === "ukpd") return findUkpdRecord(pool, user);
  return await findAppUserRecord(pool, user) || await findUkpdRecord(pool, user);
}

async function updatePasswordHash(pool, record, passwordHash) {
  await ensurePasswordRotationSchema();
  if (record.table === "app_users") {
    await pool.query(
      `UPDATE \`app_users\`
       SET \`password_hash\` = ?, \`password_changed_at\` = CURRENT_TIMESTAMP, \`updated_at\` = CURRENT_TIMESTAMP
       WHERE \`id\` = ?`,
      [passwordHash, record.id]
    );
    return;
  }

  await pool.query(
    `UPDATE \`ukpd\`
     SET \`password\` = ?, \`password_changed_at\` = CURRENT_TIMESTAMP
     WHERE \`id_ukpd\` = ?`,
    [passwordHash, record.id]
  );
}

export async function changeCurrentUserPassword({ user, currentPassword, newPassword }) {
  const pool = await getConnectedPool();
  const record = await findCurrentPasswordRecord(pool, user);
  if (!record) {
    return { ok: false, status: 404, message: "Akun tidak ditemukan." };
  }

  const currentValid = await verifyStoredPassword(currentPassword, record.passwordHash);
  if (!currentValid) {
    return { ok: false, status: 401, message: "Password lama tidak sesuai." };
  }

  if (await verifyStoredPassword(newPassword, record.passwordHash)) {
    return { ok: false, status: 422, message: "Password baru tidak boleh sama dengan password lama." };
  }

  const policy = validatePasswordPolicy(newPassword, {
    username: record.username || user?.username,
    namaUkpd: record.namaUkpd || user?.nama_ukpd
  });
  if (!policy.valid) {
    return { ok: false, status: 422, message: "Password baru belum memenuhi aturan.", errors: policy.errors };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await updatePasswordHash(pool, record, passwordHash);
  return { ok: true, record: { table: record.table, id: record.id, username: record.username, namaUkpd: record.namaUkpd } };
}

export async function listUkpdPasswordTargets() {
  const pool = await getConnectedPool();
  const [rows] = await pool.query(
    `SELECT \`id_ukpd\`, \`ukpd_id\`, \`nama_ukpd\`, \`wilayah\`, \`role\`
     FROM \`ukpd\`
     ORDER BY \`nama_ukpd\` ASC`
  );
  return rows.map((row) => ({
    id_ukpd: Number(row.id_ukpd),
    ukpd_id: row.ukpd_id,
    nama_ukpd: row.nama_ukpd,
    wilayah: row.wilayah,
    role: row.role
  }));
}

export async function resetUkpdPasswordToDefault(ukpdId) {
  const defaultPassword = process.env.UKPD_DEFAULT_PASSWORD || "";
  const pool = await getConnectedPool();
  const [rows] = await pool.query(
    `SELECT \`id_ukpd\`, \`ukpd_id\`, \`nama_ukpd\`
     FROM \`ukpd\`
     WHERE \`id_ukpd\` = ?
     LIMIT 1`,
    [Number(ukpdId)]
  );
  const target = rows[0];
  if (!target) {
    return { ok: false, status: 404, message: "UKPD tidak ditemukan." };
  }

  const policy = validatePasswordPolicy(defaultPassword, {
    username: String(target.ukpd_id || target.id_ukpd),
    namaUkpd: target.nama_ukpd
  });
  if (!policy.valid) {
    return {
      ok: false,
      status: 422,
      message: "UKPD_DEFAULT_PASSWORD belum memenuhi aturan password.",
      errors: policy.errors
    };
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 12);
  await pool.query(
    `UPDATE \`ukpd\`
     SET \`password\` = ?, \`password_changed_at\` = NULL
     WHERE \`id_ukpd\` = ?`,
    [passwordHash, Number(ukpdId)]
  );

  return {
    ok: true,
    target: {
      id_ukpd: Number(target.id_ukpd),
      ukpd_id: target.ukpd_id,
      nama_ukpd: target.nama_ukpd
    }
  };
}

function cpnsDefaultPasswordConfig() {
  if (process.env.CPNS_DEFAULT_PASSWORD) {
    return {
      value: process.env.CPNS_DEFAULT_PASSWORD,
      envName: "CPNS_DEFAULT_PASSWORD"
    };
  }
  return {
    value: process.env.UKPD_DEFAULT_PASSWORD || "",
    envName: "UKPD_DEFAULT_PASSWORD"
  };
}

export async function listCpnsPasswordTargets() {
  const pool = await getConnectedPool();
  await ensureCpnsAuthSchema(pool);
  const [rows] = await pool.query(
    `SELECT p.\`id_pegawai\`, BTRIM(COALESCE(p.\`nrk\`, '')) AS \`nrk\`, p.\`nama\`, p.\`nama_ukpd\`, p.\`wilayah\`, p.\`email\`,
            CASE WHEN a.\`id_pegawai\` IS NOT NULL THEN TRUE ELSE FALSE END AS \`activated\`,
            a.\`activated_at\`
     FROM \`pegawai\` p
     LEFT JOIN \`cpns_auth\` a
       ON a.\`id_pegawai\` = p.\`id_pegawai\`
      AND BTRIM(COALESCE(a.\`nrk\`, '')) = BTRIM(COALESCE(p.\`nrk\`, ''))
     WHERE LOWER(COALESCE(p.\`jenis_pegawai\`, '')) = 'cpns'
       AND LOWER(COALESCE(p.\`kondisi\`, 'aktif')) = 'aktif'
       AND BTRIM(COALESCE(p.\`nrk\`, '')) <> ''
     ORDER BY p.\`nama\` ASC`
  );
  return rows.map((row) => ({
    id_pegawai: Number(row.id_pegawai),
    nrk: row.nrk,
    nama: row.nama,
    nama_ukpd: row.nama_ukpd,
    wilayah: row.wilayah,
    email: row.email,
    activated: Boolean(row.activated),
    activated_at: row.activated_at || null
  }));
}

export async function resetCpnsPasswordToDefault(nrk) {
  const normalizedNrk = String(nrk || "").trim();
  const defaultPassword = cpnsDefaultPasswordConfig();
  const pool = await getConnectedPool();
  await ensureCpnsAuthSchema(pool);

  const [rows] = await pool.query(
    `SELECT \`id_pegawai\`, BTRIM(COALESCE(\`nrk\`, '')) AS \`nrk\`, \`nama\`, \`nama_ukpd\`, \`wilayah\`
     FROM \`pegawai\`
     WHERE LOWER(COALESCE(\`jenis_pegawai\`, '')) = 'cpns'
       AND LOWER(COALESCE(\`kondisi\`, 'aktif')) = 'aktif'
       AND BTRIM(COALESCE(\`nrk\`, '')) = ?
       AND (SELECT COUNT(*) FROM \`pegawai\` p2 WHERE LOWER(COALESCE(p2.\`jenis_pegawai\`, '')) = 'cpns' AND LOWER(COALESCE(p2.\`kondisi\`, 'aktif')) = 'aktif' AND BTRIM(COALESCE(p2.\`nrk\`, '')) = ?) = 1
     LIMIT 1`,
    [normalizedNrk, normalizedNrk]
  );
  const target = rows[0];
  if (!target) {
    return { ok: false, status: 404, message: "CPNS aktif dengan NRK tersebut tidak ditemukan." };
  }

  const policy = validatePasswordPolicy(defaultPassword.value, {
    username: target.nrk,
    namaUkpd: `${target.nama || ""} ${target.nama_ukpd || ""}`
  });
  if (!policy.valid) {
    return {
      ok: false,
      status: 422,
      message: `${defaultPassword.envName} belum memenuhi aturan password.`,
      errors: policy.errors
    };
  }

  const passwordHash = await bcrypt.hash(defaultPassword.value, 12);
  await pool.query(
    `INSERT INTO \`cpns_auth\` (\`id_pegawai\`, \`nrk\`, \`password_hash\`, \`activated_at\`, \`updated_at\`)
     VALUES (?, ?, ?, NOW(), NOW())
     ON CONFLICT (\`id_pegawai\`) DO UPDATE SET \`nrk\` = EXCLUDED.\`nrk\`, \`password_hash\` = EXCLUDED.\`password_hash\`, \`updated_at\` = NOW()
     RETURNING \`id_pegawai\``,
    [Number(target.id_pegawai), target.nrk, passwordHash]
  );
  await pool.query("DELETE FROM `cpns_activation_otp` WHERE `nrk` = ?", [target.nrk]);

  return {
    ok: true,
    defaultEnv: defaultPassword.envName,
    target: {
      id_pegawai: Number(target.id_pegawai),
      nrk: target.nrk,
      nama: target.nama,
      nama_ukpd: target.nama_ukpd,
      wilayah: target.wilayah
    }
  };
}
