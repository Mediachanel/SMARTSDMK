import { z } from "zod";
import { requireAuth } from "@/lib/auth/requireAuth";
import {
  createPasskeyChallengeToken,
  createRegistrationOptions,
  getWebAuthnRequestContext,
  listPasskeysForUser,
  passkeyChallengeCookieName,
  randomChallenge
} from "@/lib/auth/passkeys";
import { getSessionCookieOptions } from "@/lib/auth/sessionConfig";
import { fail, ok } from "@/lib/helpers/response";

export const runtime = "nodejs";

const schema = z.object({
  label: z.string().trim().max(120).optional()
});

export async function POST(request) {
  const auth = await requireAuth([], request);
  if (auth.error) return auth.error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Payload passkey tidak valid.", 422, parsed.error.flatten());

  const context = getWebAuthnRequestContext(request);
  const challenge = randomChallenge();
  const passkeys = await listPasskeysForUser(auth.user.id);
  const options = createRegistrationOptions({
    user: auth.user,
    challenge,
    rpId: context.rpId,
    rpName: context.rpName,
    excludeCredentials: passkeys
  });

  const token = await createPasskeyChallengeToken({
    purpose: "register",
    challenge,
    userId: String(auth.user.id),
    origin: context.origin,
    rpId: context.rpId,
    label: parsed.data.label || ""
  });

  const response = ok({ options }, "Opsi pendaftaran passkey dibuat.");
  response.cookies.set(passkeyChallengeCookieName(), token, getSessionCookieOptions({
    maxAge: 5 * 60
  }));
  return response;
}
