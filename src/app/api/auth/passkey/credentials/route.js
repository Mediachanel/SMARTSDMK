import { requireAuth } from "@/lib/auth/requireAuth";
import { listPasskeysForUser } from "@/lib/auth/passkeys";
import { ok } from "@/lib/helpers/response";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireAuth([], request);
  if (auth.error) return auth.error;

  const passkeys = await listPasskeysForUser(auth.user.id);
  return ok({ passkeys }, "Daftar passkey berhasil dimuat.");
}
