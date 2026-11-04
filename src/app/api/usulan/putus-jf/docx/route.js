import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { buildPutusJfDocx, PUTUS_JF_DOCX_CONTENT_TYPE } from "@/lib/usulan/putusJfDocx";

export const runtime = "nodejs";

function normalizeDownloadFileName(value) {
  return String(value || "Putus_JF.docx").replace(/["\\\r\n]/g, "_");
}

export async function GET(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN]);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id") || 0);
  if (!Number.isInteger(id) || id <= 0) {
    return fail("Parameter usulan putus JF tidak valid.", 422);
  }

  const pool = await getConnectedPool();
  const [[item]] = await pool.query("SELECT * FROM `usulan_pjf_stop` WHERE `id` = ? LIMIT 1", [id]);
  if (!item) {
    return fail("Usulan putus JF tidak ditemukan.", 404);
  }

  try {
    const { buffer, fileName } = await buildPutusJfDocx(item);
    return new Response(buffer, {
      headers: {
        "Content-Type": PUTUS_JF_DOCX_CONTENT_TYPE,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${normalizeDownloadFileName(fileName)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Cetak usulan putus JF error:", error);
    return fail("Cetak usulan putus JF gagal dibuat.", 500);
  }
}
