import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { buildPejabatExportWorkbook, getPejabatData } from "@/lib/export/pejabatExport";
import { auditSecurityEvent } from "@/lib/security/auditLog";
import { enforceRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function GET(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  const rateLimitError = enforceRateLimit(request, {
    namespace: "pejabat-export",
    limit: 20,
    windowMs: 15 * 60 * 1000,
    key: user.username
  });
  if (rateLimitError) {
    auditSecurityEvent(request, "pejabat_export_rate_limited", { username: user.username, role: user.role });
    return rateLimitError;
  }

  const { searchParams } = new URL(request.url);
  const { rows } = await getPejabatData({
    wilayah: searchParams.get("wilayah") || "",
    jenisUkpd: searchParams.get("jenisUkpd") || searchParams.get("jenis_ukpd") || "",
    ukpd: searchParams.get("ukpd") || "",
    rumpun: searchParams.get("rumpun") || "",
    exportAll: true
  });
  const buffer = await buildPejabatExportWorkbook({ rows });
  const date = new Date().toISOString().slice(0, 10);
  auditSecurityEvent(request, "pejabat_export_success", { username: user.username, role: user.role, rows: rows.length });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="data-pejabat-${date}.xlsx"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
