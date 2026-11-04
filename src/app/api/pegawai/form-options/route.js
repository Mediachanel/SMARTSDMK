import { requireAuth } from "@/lib/auth/requireAuth";
import { ok } from "@/lib/helpers/response";
import { getPegawaiFormOptions } from "@/lib/pegawaiFormOptions";

export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const context = request.nextUrl.searchParams.get("context") || "pegawai";
  return ok(await getPegawaiFormOptions({ user, context }));
}
