import { getConnectedPool } from "@/lib/db/postgres";

export const PASSWORD_ROTATION_START_AT = "2026-08-24T00:00:00+07:00";
export const PASSWORD_ROTATION_MONTHS = 3;

let schemaPromise;

export function ensurePasswordRotationSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const pool = await getConnectedPool();
      await pool.query("ALTER TABLE `app_users` ADD COLUMN IF NOT EXISTS `password_changed_at` TIMESTAMPTZ NULL");
      await pool.query("ALTER TABLE `ukpd` ADD COLUMN IF NOT EXISTS `password_changed_at` TIMESTAMPTZ NULL");
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function addCalendarMonths(value, months) {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const finalDay = Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate());
  date.setUTCDate(finalDay);
  return date;
}

async function findRotationRecord(pool, user) {
  const username = String(user?.username || "").trim();
  const namaUkpd = String(user?.nama_ukpd || "").trim();

  if (user?.auth_source === "cpns" || user?.role === "CPNS") return null;

  const [appRows] = user?.auth_source === "ukpd" ? [[]] : await pool.query(
    `SELECT \`password_changed_at\`
     FROM \`app_users\`
     WHERE LOWER(\`username\`) = LOWER(?)
       AND \`is_active\` = TRUE
     LIMIT 1`,
    [username]
  );
  if (appRows[0]) return { source: "app_users", changedAt: appRows[0].password_changed_at || null };

  const [ukpdRows] = user?.auth_source === "app_users" ? [[]] : await pool.query(
    `SELECT \`password_changed_at\`
     FROM \`ukpd\`
     WHERE \`id_ukpd\` = ?
        OR CAST(\`ukpd_id\` AS CHAR) = ?
        OR LOWER(\`nama_ukpd\`) = LOWER(?)
        OR LOWER(\`nama_ukpd\`) = LOWER(?)
     LIMIT 1`,
    [Number(user?.id) || 0, username, username, namaUkpd]
  );
  if (ukpdRows[0]) return { source: "ukpd", changedAt: ukpdRows[0].password_changed_at || null };
  return null;
}

export async function getPasswordRotationStatus(user, now = new Date()) {
  await ensurePasswordRotationSchema();
  const pool = await getConnectedPool();
  const record = await findRotationRecord(pool, user);
  if (!record) {
    return { supported: false, required: false, startsAt: PASSWORD_ROTATION_START_AT, intervalMonths: PASSWORD_ROTATION_MONTHS };
  }

  const startsAt = new Date(PASSWORD_ROTATION_START_AT);
  const changedAt = record.changedAt ? new Date(record.changedAt) : null;
  const dueAt = changedAt ? addCalendarMonths(changedAt, PASSWORD_ROTATION_MONTHS) : startsAt;
  return {
    supported: true,
    required: now >= startsAt && now >= dueAt,
    reason: changedAt ? "PASSWORD_EXPIRED" : "PASSWORD_NOT_CHANGED",
    startsAt: startsAt.toISOString(),
    changedAt: changedAt?.toISOString() || null,
    dueAt: dueAt.toISOString(),
    intervalMonths: PASSWORD_ROTATION_MONTHS,
    source: record.source
  };
}
