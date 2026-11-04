import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { buildUsulanExportWorkbook, getUsulanExportData } from "@/lib/export/usulanExport";
import { auditSecurityEvent } from "@/lib/security/auditLog";
import { enforceRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function GET(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD], request);
  if (error) return error;

  const rateLimitError = enforceRateLimit(request, {
    namespace: "usulan-mutasi-export",
    limit: 20,
    windowMs: 15 * 60 * 1000,
    key: user.username
  });
  if (rateLimitError) return rateLimitError;

  const { searchParams } = new URL(request.url);
  const rows = await getUsulanExportData({
    type: "mutasi",
    user,
    status: searchParams.get("status") || "",
    stage: searchParams.get("stage") || ""
  });
  const buffer = await buildUsulanExportWorkbook({ type: "mutasi", rows });
  const date = new Date().toISOString().slice(0, 10);
  auditSecurityEvent(request, "usulan_mutasi_export_success", { username: user.username, role: user.role, rows: rows.length });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="usulan-mutasi-${date}.xlsx"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
