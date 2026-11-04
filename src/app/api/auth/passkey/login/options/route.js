import { z } from "zod";
import { checkLoginRateLimit, recordFailedLogin } from "@/lib/auth/loginRateLimit";
import { findLoginUser } from "@/lib/auth/passwords";
import {
  createLoginOptions,
  createPasskeyChallengeToken,
  getWebAuthnRequestContext,
  listPasskeysForUser,
  passkeyChallengeCookieName,
  randomChallenge
} from "@/lib/auth/passkeys";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { getSessionCookieOptions } from "@/lib/auth/sessionConfig";
import { fail, ok } from "@/lib/helpers/response";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().trim().min(1)
});

export async function POST(request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Payload login passkey tidak valid.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Username / UKPD ID wajib diisi.", 422, parsed.error.flatten());

  const username = parsed.data.username;
  const limit = checkLoginRateLimit(request, username);
  if (!limit.allowed) {
    return fail(`Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(limit.retryAfter / 60)} menit.`, 429);
  }

  let user;
  try {
    user = await findLoginUser(username);
  } catch (error) {
    console.error("Passkey login lookup error:", error.message);
    return fail("Layanan login sedang tidak tersedia. Hubungi administrator.", 503);
  }

  if (!user) {
    recordFailedLogin(request, username);
    return fail("Akun tidak ditemukan.", 404);
  }

  const passkeys = await listPasskeysForUser(user.id);
  if (!passkeys.length) {
    return fail("Akun ini belum memiliki passkey. Masuk dengan password lalu daftarkan passkey di Profil Akun.", 404);
  }

  const context = getWebAuthnRequestContext(request);
  const challenge = randomChallenge();
  const options = createLoginOptions({
    challenge,
    rpId: context.rpId,
    credentials: passkeys
  });

  const token = await createPasskeyChallengeToken({
    purpose: "login",
    challenge,
    userId: String(user.id),
    username: user.username,
    origin: context.origin,
    rpId: context.rpId
  });

  const response = ok({ options }, "Opsi login passkey dibuat.");
  response.cookies.set(passkeyChallengeCookieName(), token, getSessionCookieOptions({
    maxAge: 5 * 60
  }));
  return response;
}
