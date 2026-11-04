import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { validAutomationToken } from "@/lib/suratStorage";
import { findPegawai } from "@/lib/suratNotification";

export const runtime = "nodejs";

export async function POST(request) {
  if (!validAutomationToken(request)) return fail("Token otomatisasi tidak valid.", 401);
  try {
    const body = await request.json();
    return ok({ rows: await findPegawai(await getConnectedPool(), body.search || body.nama || body.nomor || "") });
  } catch (error) {
    return fail(error.message || "Gagal mencari pegawai.", 422);
  }
}
