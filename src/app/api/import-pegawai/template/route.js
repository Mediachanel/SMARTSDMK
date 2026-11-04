import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getUkpdData } from "@/lib/data/pegawaiStore";
import { buildPegawaiImportTemplate } from "@/lib/import/pegawaiExcel";

export const runtime = "nodejs";

export async function GET() {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_UKPD]);
  if (error) return error;

  const allUkpdRows = await getUkpdData();
  const ukpdRows = user.role === ROLES.ADMIN_UKPD
    ? allUkpdRows.filter((row) => row.nama_ukpd === user.nama_ukpd)
    : allUkpdRows;
  const buffer = await buildPegawaiImportTemplate({ ukpdRows });
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-import-pegawai.xlsx"',
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
