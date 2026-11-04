import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getPejabatData } from "@/lib/export/pejabatExport";
import { ok } from "@/lib/helpers/response";

function numberParam(value, fallback, min, max) {
  const number = Number.parseInt(value || "", 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export async function GET(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const wilayah = searchParams.get("wilayah") || "";
  const jenisUkpd = searchParams.get("jenisUkpd") || searchParams.get("jenis_ukpd") || "";
  const ukpd = searchParams.get("ukpd") || "";
  const rumpun = searchParams.get("rumpun") || "";
  const page = numberParam(searchParams.get("page"), 1, 1, 100000);
  const pageSize = numberParam(searchParams.get("pageSize"), 10, 10, 100);

  return ok(await getPejabatData({
    wilayah,
    jenisUkpd,
    ukpd,
    rumpun,
    page,
    pageSize
  }));
}
