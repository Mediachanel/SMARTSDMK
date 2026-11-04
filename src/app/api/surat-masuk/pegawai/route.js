import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { findPegawai } from "@/lib/suratNotification";

export const runtime = "nodejs";

export async function GET(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;
  try {
    const search = new URL(request.url).searchParams.get("search") || "";
    return ok({ rows: await findPegawai(await getConnectedPool(), search) });
  } catch (error) {
    return fail(error.message || "Gagal mencari pegawai.", 500);
  }
}
