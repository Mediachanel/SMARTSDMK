import { requireAuth } from "@/lib/auth/requireAuth";
import { getPegawaiExportData } from "@/lib/export/pegawaiExport";
import { buildPegawaiExportWorkbook } from "@/lib/import/pegawaiExcel";
import { auditSecurityEvent } from "@/lib/security/auditLog";
import { enforceRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function GET(request) {
  const { user, error } = await requireAuth([], request);
  if (error) return error;
  const rateLimitError = enforceRateLimit(request, {
    namespace: "pegawai-export",
    limit: 20,
    windowMs: 15 * 60 * 1000,
    key: user.username
  });
  if (rateLimitError) {
    auditSecurityEvent(request, "pegawai_export_rate_limited", { username: user.username, role: user.role });
    return rateLimitError;
  }

  const { searchParams } = new URL(request.url);
  const rows = await getPegawaiExportData({
    user,
    q: searchParams.get("q") || "",
    status: searchParams.get("status") || "",
    wilayah: searchParams.get("wilayah") || "",
    jenisUkpd: searchParams.get("jenisUkpd") || searchParams.get("jenis_ukpd") || "",
    ukpd: searchParams.get("ukpd") || "",
    jabatan: searchParams.get("jabatan") || "",
    rumpun: searchParams.get("rumpun") || ""
  });
  const buffer = await buildPegawaiExportWorkbook({ rows });
  const date = new Date().toISOString().slice(0, 10);
  auditSecurityEvent(request, "pegawai_export_success", { username: user.username, role: user.role, rows: rows.length });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="data-pegawai-${date}.xlsx"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
