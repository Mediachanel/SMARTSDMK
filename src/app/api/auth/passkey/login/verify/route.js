import { z } from "zod";
import { clearLoginRateLimit, recordFailedLogin } from "@/lib/auth/loginRateLimit";
import {
  findPasskeyByCredentialId,
  findPasskeyUserById,
  passkeyChallengeCookieName,
  updatePasskeyUsage,
  verifyLoginCredential,
  verifyPasskeyChallengeToken
} from "@/lib/auth/passkeys";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { sessionCookieName, signSession } from "@/lib/auth/session";
import { getSessionCookieOptions } from "@/lib/auth/sessionConfig";
import { fail, ok } from "@/lib/helpers/response";
import { auditSecurityEvent } from "@/lib/security/auditLog";

export const runtime = "nodejs";

const credentialSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string().min(1),
    authenticatorData: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().optional()
  })
});

const schema = z.object({
  credential: credentialSchema
});

export async function POST(request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Payload verifikasi passkey tidak valid.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Payload verifikasi passkey tidak valid.", 422, parsed.error.flatten());

  const challengePayload = await verifyPasskeyChallengeToken(request.cookies.get(passkeyChallengeCookieName())?.value);
  if (!challengePayload || challengePayload.purpose !== "login") {
    return fail("Sesi login passkey sudah kedaluwarsa. Coba lagi.", 400);
  }

  const credentialId = parsed.data.credential.rawId || parsed.data.credential.id;
  const passkey = await findPasskeyByCredentialId(credentialId);
  if (!passkey || String(passkey.ukpd_id) !== String(challengePayload.userId)) {
    recordFailedLogin(request, challengePayload.username || credentialId);
    return fail("Passkey tidak terdaftar untuk akun ini.", 401);
  }

  try {
    const verified = verifyLoginCredential({
      credential: parsed.data.credential,
      passkey,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: challengePayload.origin,
      rpId: challengePayload.rpId
    });

    const user = await findPasskeyUserById(passkey.ukpd_id);
    if (!user) return fail("Akun passkey tidak ditemukan.", 404);

    await updatePasskeyUsage(verified.credentialId, verified.counter);
    clearLoginRateLimit(request, challengePayload.username || user.username);

    const token = await signSession(user);
    auditSecurityEvent(request, "passkey_login_success", { username: user.username, role: user.role });
    const response = ok({ id: user.id, username: user.username, role: user.role, wilayah: user.wilayah, nama_ukpd: user.nama_ukpd }, "Login passkey berhasil.");
    response.cookies.set(sessionCookieName(), token, getSessionCookieOptions());
    response.cookies.set(passkeyChallengeCookieName(), "", getSessionCookieOptions({ maxAge: 0 }));
    return response;
  } catch (error) {
    console.error("Passkey login verification error:", error);
    recordFailedLogin(request, challengePayload.username || credentialId);
    auditSecurityEvent(request, "passkey_login_failed", { username: challengePayload.username || "", reason: "verification_failed" });
    return fail("Passkey belum dapat diverifikasi.", 401);
  }
}
