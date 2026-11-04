import { z } from "zod";
import { requireAuth } from "@/lib/auth/requireAuth";
import {
  passkeyChallengeCookieName,
  savePasskey,
  verifyPasskeyChallengeToken,
  verifyRegistrationCredential,
} from "@/lib/auth/passkeys";
import { getSessionCookieOptions } from "@/lib/auth/sessionConfig";
import { fail, ok } from "@/lib/helpers/response";
import { writeAuditLog } from "@/lib/security/auditLog";

export const runtime = "nodejs";

const credentialSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string().min(1),
    attestationObject: z.string().min(1),
    transports: z.array(z.string()).optional(),
  }),
});

const schema = z.object({
  credential: credentialSchema,
  label: z.string().trim().max(120).optional(),
});

export async function POST(request) {
  const auth = await requireAuth([], request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Payload verifikasi passkey tidak valid.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return fail(
      "Payload verifikasi passkey tidak valid.",
      422,
      parsed.error.flatten(),
    );

  const challengePayload = await verifyPasskeyChallengeToken(
    request.cookies.get(passkeyChallengeCookieName())?.value,
  );
  if (
    !challengePayload ||
    challengePayload.purpose !== "register" ||
    String(challengePayload.userId) !== String(auth.user.id)
  ) {
    return fail("Sesi pendaftaran passkey sudah kedaluwarsa. Coba lagi.", 400);
  }

  try {
    const verified = verifyRegistrationCredential({
      credential: parsed.data.credential,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: challengePayload.origin,
      rpId: challengePayload.rpId,
    });

    await savePasskey({
      userId: auth.user.id,
      credentialId: verified.credentialId,
      publicKeyCose: verified.publicKeyCose,
      counter: verified.counter,
      transports: verified.transports,
      label: parsed.data.label || challengePayload.label || "Passkey perangkat",
    });

    await writeAuditLog({
      request,
      user: auth.user,
      action: "auth.passkey.register",
      entityType: "passkey",
      entityId: verified.credentialId,
      metadata: {
        username: auth.user.username,
        label:
          parsed.data.label || challengePayload.label || "Passkey perangkat",
      },
    });

    const response = ok(
      { credential_id: verified.credentialId },
      "Passkey berhasil didaftarkan.",
    );
    response.cookies.set(
      passkeyChallengeCookieName(),
      "",
      getSessionCookieOptions({ maxAge: 0 }),
    );
    return response;
  } catch (error) {
    console.error("Passkey registration verification error:", error);
    return fail("Passkey belum dapat diverifikasi.", 400);
  }
}
