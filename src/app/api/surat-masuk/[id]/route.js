import fs from "node:fs/promises";
import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureSuratMasukSchema } from "@/lib/db/ensureSuratMasukSchema";
import { cleanText, SURAT_FIELDS } from "@/lib/suratMasuk";
import { resolveDocumentPath, storeDocument } from "@/lib/suratStorage";

export const runtime = "nodejs";
const EDITABLE = SURAT_FIELDS.slice(1, 25);

export async function PATCH(request, { params }) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;
  let replacement;
  try {
    const { id } = await params;
    const form = await request.formData();
    const pool = await getConnectedPool();
    await ensureSuratMasukSchema(pool);
    const [currentRows] = await pool.query("SELECT * FROM surat_masuk WHERE id = ? LIMIT 1", [id]);
    const current = currentRows[0];
    if (!current) return fail("Surat tidak ditemukan.", 404);
    const file = form.get("file");
    if (file && typeof file.arrayBuffer === "function" && file.size) {
      replacement = await storeDocument({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, mime: file.type });
    }
    const values = EDITABLE.map((field) => cleanText(form.get(field)));
    if (!values[7]) return fail("Perihal wajib diisi.", 422);
    const fileSql = replacement ? ", dokumen_path=?, dokumen_nama=?, dokumen_mime=?, dokumen_ukuran=?" : "";
    const fileValues = replacement ? [replacement.key, replacement.name, replacement.mime, replacement.size] : [];
    await pool.query(`UPDATE surat_masuk SET ${EDITABLE.map((field) => `${field}=?`).join(",")}${fileSql}, updated_at=NOW() WHERE id=?`, [...values, ...fileValues, id]);
    if (replacement && current.dokumen_path) {
      const oldPath = resolveDocumentPath(current.dokumen_path);
      if (oldPath) await fs.unlink(oldPath).catch(() => {});
    }
    return ok({ id: Number(id), id_dokumen: current.id_dokumen });
  } catch (error) {
    if (replacement?.key) {
      const target = resolveDocumentPath(replacement.key);
      if (target) await fs.unlink(target).catch(() => {});
    }
    return fail(error.message || "Gagal memperbarui surat.", 422);
  }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;
  try {
    const { id } = await params;
    const pool = await getConnectedPool();
    await ensureSuratMasukSchema(pool);
    const [rows] = await pool.query("SELECT dokumen_path FROM surat_masuk WHERE id = ? LIMIT 1", [id]);
    const row = rows[0];
    if (!row) return fail("Surat tidak ditemukan.", 404);
    await pool.query("DELETE FROM surat_masuk WHERE id = ?", [id]);
    if (row.dokumen_path) {
      const target = resolveDocumentPath(row.dokumen_path);
      if (target) await fs.unlink(target).catch(() => {});
    }
    return ok({ deleted: true });
  } catch (error) {
    return fail(error.message || "Gagal menghapus surat.", 422);
  }
}
