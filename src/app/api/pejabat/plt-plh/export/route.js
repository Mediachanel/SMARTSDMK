import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { buildPltPlhExportWorkbook, getPltPlhExportData } from "@/lib/export/pltPlhExport";
import { auditSecurityEvent } from "@/lib/security/auditLog";
import { enforceRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function GET(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  const rateLimitError = enforceRateLimit(request, {
    namespace: "pejabat-plt-plh-export",
    limit: 20,
    windowMs: 15 * 60 * 1000,
    key: user.username
  });
  if (rateLimitError) {
    auditSecurityEvent(request, "pejabat_plt_plh_export_rate_limited", { username: user.username, role: user.role });
    return rateLimitError;
  }

  const { searchParams } = new URL(request.url);
  const jenis = String(searchParams.get("jenis") || "").trim().toUpperCase();
  const { rows } = await getPltPlhExportData({
    jenis,
    wilayah: searchParams.get("wilayah") || "",
    jenisUkpd: searchParams.get("jenisUkpd") || searchParams.get("jenis_ukpd") || "",
    ukpd: searchParams.get("ukpd") || "",
    rumpun: searchParams.get("rumpun") || "",
    periodeMulai: searchParams.get("periodeMulai") || searchParams.get("periode_mulai") || "",
    periodeAkhir: searchParams.get("periodeAkhir") || searchParams.get("periode_akhir") || "",
    q: searchParams.get("q") || ""
  });
  const buffer = await buildPltPlhExportWorkbook({ rows, jenis });
  const date = new Date().toISOString().slice(0, 10);
  const label = jenis === "PLT" || jenis === "PLH" ? jenis.toLowerCase() : "plt-plh";
  auditSecurityEvent(request, "pejabat_plt_plh_export_success", { username: user.username, role: user.role, jenis, rows: rows.length });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="data-${label}-${date}.xlsx"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
