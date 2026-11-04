import { z } from "zod";
import { findActivatedCpns } from "@/lib/auth/cpnsActivation";
import { verifyPassword } from "@/lib/auth/passwords";
import { sessionCookieName, signSession } from "@/lib/auth/session";
import { getSessionCookieOptions } from "@/lib/auth/sessionConfig";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordFailedLogin,
} from "@/lib/auth/loginRateLimit";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { fail, ok } from "@/lib/helpers/response";
import { auditSecurityEvent } from "@/lib/security/auditLog";

const schema = z.object({
  nrk: z
    .string()
    .trim()
    .regex(/^\d{4,20}$/),
  password: z.string().min(1).max(72),
});

export async function POST(request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("NRK dan password wajib diisi.", 422);
  const { nrk, password } = parsed.data;
  const limit = checkLoginRateLimit(request, `cpns:${nrk}`);
  if (!limit.allowed) {
    auditSecurityEvent(request, "login_rate_limited", {
      nrk,
      username: nrk,
      portal: "cpns",
    });
    return fail(
      `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(limit.retryAfter / 60)} menit.`,
      429,
    );
  }
  try {
    const user = await findActivatedCpns(nrk);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      recordFailedLogin(request, `cpns:${nrk}`);
      auditSecurityEvent(request, "login_failed", {
        nrk,
        username: nrk,
        portal: "cpns",
        reason: user ? "invalid_password" : "not_activated_or_not_found",
      });
      return fail(
        "NRK atau password tidak valid. Jika belum pernah membuat password, lakukan aktivasi WhatsApp.",
        401,
      );
    }
    const token = await signSession(user);
    clearLoginRateLimit(request, `cpns:${nrk}`);
    auditSecurityEvent(request, "login_success", {
      nrk,
      username: nrk,
      role: "CPNS",
    });
    const response = ok({ role: "CPNS" }, "Login berhasil.");
    response.cookies.set(sessionCookieName(), token, getSessionCookieOptions());
    return response;
  } catch (error) {
    console.error("CPNS dedicated login error:", error.message);
    return fail("Layanan login sedang tidak tersedia.", 503);
  }
}
