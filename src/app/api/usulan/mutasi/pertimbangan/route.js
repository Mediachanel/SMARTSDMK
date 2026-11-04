import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { buildMutasiPertimbanganDocx, MUTASI_PERTIMBANGAN_DOCX_CONTENT_TYPE } from "@/lib/usulan/mutasiPertimbanganDocx";

export const runtime = "nodejs";

function normalizeDownloadFileName(value) {
  return String(value || "Form_Pertimbangan_Mutasi.docx").replace(/["\\\r\n]/g, "_");
}

export async function GET(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN]);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id") || 0);
  if (!Number.isInteger(id) || id <= 0) {
    return fail("Parameter usulan mutasi tidak valid.", 422);
  }

  const pool = await getConnectedPool();
  const [[item]] = await pool.query("SELECT * FROM `usulan_mutasi` WHERE `id` = ? LIMIT 1", [id]);
  if (!item) {
    return fail("Usulan mutasi tidak ditemukan.", 404);
  }

  try {
    const { buffer, fileName } = await buildMutasiPertimbanganDocx(item);
    return new Response(buffer, {
      headers: {
        "Content-Type": MUTASI_PERTIMBANGAN_DOCX_CONTENT_TYPE,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${normalizeDownloadFileName(fileName)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Cetak form pertimbangan mutasi error:", error);
    return fail("Cetak form pertimbangan mutasi gagal dibuat.", 500);
  }
}
