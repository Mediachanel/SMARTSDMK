import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ok } from "@/lib/helpers/response";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { listAuditLogs } from "@/lib/audit-log/repository";

export async function GET(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;
  const rateLimitError = enforceRateLimit(request, {
    namespace: "audit-log-read",
    limit: 120,
    windowMs: 15 * 60 * 1000,
    key: user.username || user.id
  });
  if (rateLimitError) return rateLimitError;

  const { searchParams } = new URL(request.url);
  const logs = await listAuditLogs({
    user: searchParams.get("user") || "",
    role: searchParams.get("role") || "",
    action: searchParams.get("action") || "",
    status: searchParams.get("status") || "",
    module: searchParams.get("module") || "",
    dateFrom: searchParams.get("dateFrom") || "",
    dateTo: searchParams.get("dateTo") || "",
    limit: searchParams.get("limit") || 100
  });
  return ok(logs);
}
