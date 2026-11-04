import { getCurrentUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/helpers/response";
import { getPasswordRotationStatus } from "@/lib/auth/passwordRotation";
import { getConnectedPool } from "@/lib/db/postgres";
import { ROLES } from "@/lib/constants/roles";

async function getCpnsVerificationNotification(user) {
  if (user.role !== ROLES.ADMIN_UKPD || !user.nama_ukpd) return null;
  try {
    const pool = await getConnectedPool();
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS pending, MAX(\`updated_at\`) AS latest_at
       FROM \`usulan_cpns_pns\`
       WHERE \`nama_ukpd\` = ? AND \`status\` = 'Diajukan ke Admin UKPD'`,
      [user.nama_ukpd],
    );
    const pending = Number(rows[0]?.pending || 0);
    return { pending, latestAt: rows[0]?.latest_at || null, href: "/usulan/cpns-pns" };
  } catch {
    return { pending: 0, latestAt: null, href: "/usulan/cpns-pns" };
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("Belum login.", 401);
  const [passwordRotation, cpnsVerificationNotification] = await Promise.all([
    getPasswordRotationStatus(user),
    getCpnsVerificationNotification(user),
  ]);
  return ok({ ...user, passwordRotation, cpnsVerificationNotification });
}
