import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureSuratMasukSchema } from "@/lib/db/ensureSuratMasukSchema";
import { cleanText, rowToRecord } from "@/lib/suratMasuk";
import { validAutomationToken } from "@/lib/suratStorage";

export const runtime = "nodejs";

export async function POST(request) {
  if (!validAutomationToken(request)) return fail("Token otomatisasi tidak valid.", 401);
  try {
    const body = await request.json();
    const record = rowToRecord(body.row || []);
    if (!record.id_dokumen || !record.perihal) return fail("ID Dokumen dan Perihal wajib diisi.", 422);
    let documentKey = cleanText(body.documentKey, 500);
    if (!documentKey && record.dokumen_link) {
      try { documentKey = new URL(record.dokumen_link).searchParams.get("key") || ""; } catch {}
    }
    const pool = await getConnectedPool();
    await ensureSuratMasukSchema(pool);
    const columns = ["tanggal_terima","jam_terima","sumber","pengirim_wa","asal_surat","nomor_surat","tanggal_surat","perihal","nama_pegawai_subjek","nip_nrk","kategori_layanan","sifat","prioritas","tujuan_disposisi","pelaksana","status","batas_waktu","tanggal_disposisi_arsip","catatan","tindak_lanjut","tanggal_selesai","nomor_eoffice","nomor_surat_kabid","nomor_surat_umum","ringkasan","confidence"];
    const values = columns.map((column) => record[column]);
    await pool.query(`INSERT INTO surat_masuk (id_dokumen,${columns.join(",")},dokumen_path,dokumen_nama,dokumen_mime,dokumen_ukuran,sumber_input,dibuat_oleh)
      VALUES (${Array.from({length:33},()=>"?").join(",")})
      ON CONFLICT (id_dokumen) DO UPDATE SET ${columns.map((column)=>`${column}=EXCLUDED.${column}`).join(",")}, dokumen_path=COALESCE(NULLIF(EXCLUDED.dokumen_path,''),surat_masuk.dokumen_path), updated_at=NOW()`,
      [record.id_dokumen, ...values, documentKey, cleanText(body.documentName, 240), cleanText(body.documentMime, 160), Number(body.documentSize || 0), "WHATSAPP", "n8n"]);
    return ok({ id_dokumen: record.id_dokumen });
  } catch (error) {
    return fail(error.message || "Gagal mencatat surat otomatis.", 422);
  }
}
