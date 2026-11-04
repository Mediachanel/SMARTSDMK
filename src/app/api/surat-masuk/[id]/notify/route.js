import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureSuratMasukSchema } from "@/lib/db/ensureSuratMasukSchema";
import { sendSuratWhatsApp } from "@/lib/suratNotification";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;
  try {
    const { id } = await params;
    const pool = await getConnectedPool();
    await ensureSuratMasukSchema(pool);
    const [rows] = await pool.query("SELECT * FROM surat_masuk WHERE id = ? LIMIT 1", [id]);
    const surat = rows[0];
    if (!surat) return fail("Surat tidak ditemukan.", 404);
    if (!surat.pelaksana) return fail("Pelaksana belum dipilih.", 422);
    const sent = await sendSuratWhatsApp({ pool, request, surat });
    await pool.query("UPDATE surat_masuk SET notifikasi_wa_at=NOW(), notifikasi_wa_nomor=?, updated_at=NOW() WHERE id=?", [sent.phone, id]);
    return ok({ nama: sent.pegawai.nama, nomor: sent.phone });
  } catch (error) {
    return fail(error.message || "Gagal mengirim pemberitahuan WhatsApp.", 422);
  }
}
