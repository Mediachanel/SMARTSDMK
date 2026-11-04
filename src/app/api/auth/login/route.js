import { z } from "zod";
import { findLoginUser, verifyLoginPassword } from "@/lib/auth/passwords";
import { sessionCookieName, signSession } from "@/lib/auth/session";
import { checkLoginRateLimit, clearLoginRateLimit, recordFailedLogin } from "@/lib/auth/loginRateLimit";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { getSessionCookieOptions } from "@/lib/auth/sessionConfig";
import { fail, ok } from "@/lib/helpers/response";
import { auditSecurityEvent } from "@/lib/security/auditLog";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

export async function POST(request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Payload login tidak valid.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Username dan password wajib diisi dengan benar.", 422, parsed.error.flatten());

  const { username, password } = parsed.data;
  const limit = checkLoginRateLimit(request, username);
  if (!limit.allowed) {
    auditSecurityEvent(request, "login_rate_limited", { username });
    return fail(`Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(limit.retryAfter / 60)} menit.`, 429);
  }

  let user;
  try {
    user = await findLoginUser(username);
  } catch (error) {
    console.error("Login PostgreSQL error:", error.message);
    return fail("Layanan login sedang tidak tersedia. Hubungi administrator.", 503);
  }
  if (!user) {
    recordFailedLogin(request, username);
    auditSecurityEvent(request, "login_failed", { username, reason: "user_not_found" });
    return fail("Kredensial tidak valid.", 401);
  }

  const valid = await verifyLoginPassword(password, user);
  if (!valid) {
    recordFailedLogin(request, username);
    auditSecurityEvent(request, "login_failed", { username, reason: "invalid_password" });
    return fail("Kredensial tidak valid.", 401);
  }

  const token = await signSession(user);
  clearLoginRateLimit(request, username);
  auditSecurityEvent(request, "login_success", { username: user.username, role: user.role });
  const response = ok({ id: user.id, username: user.username, nama: user.nama, role: user.role, wilayah: user.wilayah, nama_ukpd: user.nama_ukpd }, "Login berhasil");
  response.cookies.set(sessionCookieName(), token, getSessionCookieOptions());
  return response;
}
