import { getCurrentUser } from "@/lib/auth/session";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { fail } from "@/lib/helpers/response";
import { auditSecurityEvent } from "@/lib/security/auditLog";

export async function requireAuth(allowedRoles = [], request = null) {
  const originError = validateSameOrigin(request);
  if (originError) return { error: originError };

  const user = await getCurrentUser();
  if (!user) {
    if (request) {
      auditSecurityEvent(request, "authorization_denied", {
        reason: "session_missing_or_invalid",
      });
    }
    return { error: fail("Sesi tidak valid. Silakan login kembali.", 401) };
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    if (request) {
      auditSecurityEvent(request, "authorization_denied", {
        username: user.username,
        role: user.role,
        reason: "role_not_allowed",
      });
    }
    return { error: fail("Anda tidak memiliki akses ke fitur ini.", 403) };
  }
  if (request) {
    const path = new URL(request.url).pathname;
    if (/\/(export|download)(\/|$)/.test(path)) {
      auditSecurityEvent(request, "sensitive_data_access", {
        username: user.username,
        role: user.role,
        reason: "export_or_download",
      });
    }
  }
  return { user };
}
