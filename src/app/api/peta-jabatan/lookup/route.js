import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { fail, ok } from "@/lib/helpers/response";
import { getPetaJabatanLookup } from "@/lib/petaJabatan";

export async function GET(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD]);
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const data = await getPetaJabatanLookup({
      user,
      requestedUkpd: searchParams.get("ukpd"),
      requestedJabatan: searchParams.get("jabatan")
    });
    return ok(data);
  } catch (error) {
    return fail(error.message || "Ringkasan peta jabatan gagal dimuat.", error.status || 500);
  }
}
