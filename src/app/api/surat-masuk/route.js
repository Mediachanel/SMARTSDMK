import fs from "node:fs/promises";
import path from "node:path";
import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureSuratMasukSchema } from "@/lib/db/ensureSuratMasukSchema";
import { cleanText, createDocumentKey, safeFileName, SURAT_FIELDS } from "@/lib/suratMasuk";

export const runtime = "nodejs";
const STORAGE_ROOT = process.env.SURAT_MASUK_STORAGE_ROOT || "/usb-uploads/surat-masuk";
const MAX_BYTES = 30 * 1024 * 1024;

function recordValues(body) {
  return SURAT_FIELDS.slice(0, 25).map((field) => cleanText(body[field]));
}

function jakartaDocumentId() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `SM-${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`;
}

async function saveFile(file) {
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) return {};
  if (file.size > MAX_BYTES) throw new Error("Ukuran dokumen maksimal 30 MB.");
  const name = safeFileName(file.name);
  const key = createDocumentKey(name);
  const destination = path.resolve(STORAGE_ROOT, key);
  const root = path.resolve(STORAGE_ROOT);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("Lokasi dokumen tidak valid.");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(destination, buffer, { flag: "wx" });
  return { key, name, mime: cleanText(file.type, 160) || "application/octet-stream", size: buffer.length };
}

export async function GET(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;
  const pool = await getConnectedPool();
  await ensureSuratMasukSchema(pool);
  const url = new URL(request.url);
  const search = cleanText(url.searchParams.get("search"), 200);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") || 25)));
  const where = search ? `WHERE id_dokumen ILIKE ? OR perihal ILIKE ? OR asal_surat ILIKE ? OR nomor_surat ILIKE ? OR pelaksana ILIKE ?` : "";
  const params = search ? Array(5).fill(`%${search}%`) : [];
  const [[count], [rows]] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM surat_masuk ${where}`, params),
    pool.query(`SELECT * FROM surat_masuk ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize])
  ]);
  return ok({ rows, total: count?.total || 0, page, pageSize });
}

export async function POST(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;
  try {
    const form = await request.formData();
    const body = Object.fromEntries(SURAT_FIELDS.map((field) => [field, form.get(field)]));
    if (!cleanText(body.perihal)) return fail("Perihal wajib diisi.", 422);
    const document = await saveFile(form.get("file"));
    const pool = await getConnectedPool();
    await ensureSuratMasukSchema(pool);
    let generatedId = jakartaDocumentId();
    const [duplicateRows] = await pool.query("SELECT id FROM surat_masuk WHERE id_dokumen = ? LIMIT 1", [generatedId]);
    if (duplicateRows.length) generatedId = `${generatedId}-${Math.floor(10 + Math.random() * 90)}`;
    body.id_dokumen = generatedId;
    const values = recordValues(body);
    const [result] = await pool.query(`INSERT INTO surat_masuk
      (id_dokumen,tanggal_terima,jam_terima,sumber,pengirim_wa,asal_surat,nomor_surat,tanggal_surat,perihal,nama_pegawai_subjek,nip_nrk,kategori_layanan,sifat,prioritas,tujuan_disposisi,pelaksana,status,batas_waktu,tanggal_disposisi_arsip,catatan,tindak_lanjut,tanggal_selesai,nomor_eoffice,nomor_surat_kabid,nomor_surat_umum,dokumen_path,dokumen_nama,dokumen_mime,dokumen_ukuran,sumber_input,dibuat_oleh)
      VALUES (${Array.from({length:31},(_,i)=>`?`).join(",")}) RETURNING id`,
      [...values, document.key || "", document.name || "", document.mime || "", document.size || 0, "MANUAL", user.username || "superadmin"]);
    return ok({ id: result?.[0]?.id || result?.insertId, id_dokumen: body.id_dokumen }, 201);
  } catch (error) {
    return fail(error.code === "23505" ? "ID Dokumen sudah tercatat." : error.message || "Gagal menyimpan surat.", 422);
  }
}
