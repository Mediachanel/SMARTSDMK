import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";

function numberParam(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export async function GET(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "update" ? "update" : "create";
  const action = `pegawai.${type}`;
  const q = String(searchParams.get("q") || "").trim();
  const page = numberParam(searchParams.get("page"), 1, 1, 100000);
  const pageSize = numberParam(searchParams.get("pageSize"), 10, 10, 100);
  const offset = (page - 1) * pageSize;
  const like = `%${q}%`;

  try {
    const pool = await getConnectedPool();
    const where = q
      ? `WHERE a.action = ? AND (
          COALESCE(p.nama, a.metadata->>'nama', '') ILIKE ?
          OR COALESCE(p.nip, a.metadata->>'nip', '') ILIKE ?
          OR COALESCE(p.nrk, a.metadata->>'nrk', '') ILIKE ?
          OR COALESCE(p.nama_ukpd, a.metadata->>'nama_ukpd', '') ILIKE ?
          OR COALESCE(p.nama_jabatan_menpan, p.nama_jabatan_orb, '') ILIKE ?
          OR COALESCE(p.jenis_pegawai, '') ILIKE ?
          OR COALESCE(a.actor_id, '') ILIKE ?
        )`
      : "WHERE a.action = ?";
    const filters = q ? [action, like, like, like, like, like, like, like] : [action];
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs a
       LEFT JOIN pegawai p ON CAST(p.id_pegawai AS TEXT) = a.entity_id
       ${where}`,
      filters
    );
    const [rows] = await pool.query(
      `SELECT a.id, a.actor_id, a.actor_role, a.entity_id, a.metadata,
              TO_CHAR(a.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00' AS created_at_local,
              p.created_at AS employee_created_at,
              p.nama, p.nip, p.nrk, p.nama_ukpd,
              p.nama_jabatan_menpan, p.nama_jabatan_orb, p.jenis_pegawai
       FROM audit_logs a
       LEFT JOIN pegawai p ON CAST(p.id_pegawai AS TEXT) = a.entity_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...filters, pageSize, offset]
    );

    return ok({
      rows: rows.map((row) => {
        const metadata = parseMetadata(row.metadata);
        return {
          id: Number(row.id),
          id_pegawai: Number(row.entity_id) || null,
          actor: row.actor_id || "-",
          actor_role: row.actor_role || "-",
          nama: row.nama || metadata.nama || "-",
          nip: row.nip || metadata.nip || "-",
          nrk: row.nrk || metadata.nrk || "-",
          nama_ukpd: row.nama_ukpd || metadata.nama_ukpd || "-",
          jabatan: row.nama_jabatan_menpan || row.nama_jabatan_orb || metadata.nama_jabatan_menpan || metadata.nama_jabatan_orb || "-",
          jenis_pegawai: row.jenis_pegawai || metadata.jenis_pegawai || "-",
          changes: metadata.changes || {},
          created_at: type === "create"
            ? (row.employee_created_at || row.created_at_local)
            : row.created_at_local
        };
      }),
      total: Number(countRows?.[0]?.total || 0),
      page,
      pageSize
    });
  } catch (routeError) {
    console.error("History pegawai API error:", routeError);
    return fail("Gagal memuat history pegawai.", 500);
  }
}
