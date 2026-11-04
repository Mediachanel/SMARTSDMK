import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureCpnsPnsSchema } from "@/lib/db/ensureCpnsPnsSchema";
import { fail, ok } from "@/lib/helpers/response";
import {
  CPNS_PNS_DOCUMENT_LABELS,
  CPNS_PNS_DOCUMENT_MAX_BYTES,
  isCpnsPnsStageOpen,
  normalizeVerification,
  normalizedDocumentName,
  parseObject
} from "@/lib/usulan/cpnsPns";

export const runtime = "nodejs";

const STORAGE_ROOT = path.resolve(process.env.CPNS_PNS_STORAGE_ROOT || path.join(process.cwd(), "storage", "usulan-documents", "cpns-pns"));
const STORAGE_MARKER = path.join(STORAGE_ROOT, ".smart-hrm-usb-storage");
const ROLES_ALLOWED = [ROLES.SUPER_ADMIN, ROLES.ADMIN_UKPD, ROLES.CPNS];

function inside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function filePath(relativePath) {
  const full = path.resolve(process.cwd(), relativePath || "");
  return inside(full, path.resolve(STORAGE_ROOT)) ? full : null;
}

async function ensureUsbStorage() {
  try {
    await fs.access(STORAGE_MARKER);
  } catch {
    throw Object.assign(new Error("USB penyimpanan dokumen CPNS tidak terpasang. Upload dan unduh dinonaktifkan agar file tidak tersimpan di hard disk server."), { status: 503 });
  }
}

function scopeSql(user) {
  if (user.role === ROLES.SUPER_ADMIN) return { sql: "1 = 1", params: [] };
  if (user.role === ROLES.CPNS) return { sql: "`id_pegawai` = ?", params: [Number(user.id_pegawai || user.id)] };
  if (user.role === ROLES.ADMIN_UKPD) return { sql: "`nama_ukpd` = ?", params: [user.nama_ukpd] };
  return { sql: "1 = 0", params: [] };
}

async function getItem(pool, user, id) {
  const scope = scopeSql(user);
  const [rows] = await pool.query(`SELECT * FROM \`usulan_cpns_pns\` WHERE \`id\` = ? AND ${scope.sql} LIMIT 1`, [id, ...scope.params]);
  return rows[0] || null;
}

function paramsFrom(request) {
  const values = new URL(request.url).searchParams;
  return { id: Number(values.get("id") || 0), key: values.get("key") || "" };
}

export async function GET(request) {
  const { user, error } = await requireAuth(ROLES_ALLOWED);
  if (error) return error;
  const { id, key } = paramsFrom(request);
  if (!Number.isInteger(id) || id <= 0 || !CPNS_PNS_DOCUMENT_LABELS[key]) return fail("Parameter dokumen tidak valid.", 422);
  const pool = await getConnectedPool();
  await ensureCpnsPnsSchema(pool);
  const item = await getItem(pool, user, id);
  if (!item) return fail("Pengusulan tidak ditemukan atau tidak dapat diakses.", 404);
  const document = parseObject(item.dokumen)[key];
  const fullPath = filePath(document?.path);
  if (!document || !fullPath) return fail("Dokumen belum tersedia.", 404);
  try { await ensureUsbStorage(); }
  catch (storageError) { return fail(storageError.message, storageError.status || 503); }
  try {
    const buffer = await fs.readFile(fullPath);
    return new Response(buffer, { headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="${normalizedDocumentName(key, item.nip, item.nama_pegawai)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    } });
  } catch {
    return fail("File dokumen tidak ditemukan di penyimpanan.", 404);
  }
}

export async function POST(request) {
  const { user, error } = await requireAuth(ROLES_ALLOWED, request);
  if (error) return error;
  if (user.role !== ROLES.CPNS) return fail("Dokumen hanya dapat diunggah atau diganti oleh CPNS yang bersangkutan.", 403);
  try { await ensureUsbStorage(); }
  catch (storageError) { return fail(storageError.message, storageError.status || 503); }
  const form = await request.formData();
  const id = Number(form.get("id") || 0);
  const key = String(form.get("key") || "");
  const file = form.get("file");
  if (!Number.isInteger(id) || id <= 0 || !CPNS_PNS_DOCUMENT_LABELS[key]) return fail("Parameter upload tidak valid.", 422);
  if (!file || typeof file.arrayBuffer !== "function") return fail("Pilih berkas PDF.", 422);
  if (!String(file.name || "").toLowerCase().endsWith(".pdf")) return fail("Dokumen wajib berformat PDF.", 422);
  if (file.size <= 0 || file.size > CPNS_PNS_DOCUMENT_MAX_BYTES) return fail("Ukuran PDF harus antara 1 byte dan 1 MB.", 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("utf8") !== "%PDF-") return fail("Berkas tidak terbaca sebagai PDF yang valid.", 422);

  const pool = await getConnectedPool();
  await ensureCpnsPnsSchema(pool);
  const item = await getItem(pool, user, id);
  if (!item) return fail("Pengusulan tidak ditemukan atau tidak dapat diakses.", 404);
  if (!isCpnsPnsStageOpen(item.tahap)) {
    return fail(`Masa unggah Tahap ${Number(item.tahap) === 2 ? "II" : "I"} telah ditutup. Dokumen yang sudah tersimpan tetap aman.`, 422);
  }
  if (!["Draft CPNS", "Dikembalikan ke CPNS"].includes(item.status)) {
    return fail("Dokumen tidak dapat diubah karena usulan sedang atau sudah diverifikasi Admin UKPD.", 422);
  }
  const documents = parseObject(item.dokumen);
  const verification = normalizeVerification(item.verifikasi);
  const directory = path.join(STORAGE_ROOT, String(id));
  const fullPath = path.join(directory, `${key}-${Date.now()}-${randomUUID()}.pdf`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(fullPath, buffer);
  const previous = filePath(documents[key]?.path);
  documents[key] = {
    key,
    label: CPNS_PNS_DOCUMENT_LABELS[key],
    name: normalizedDocumentName(key, item.nip, item.nama_pegawai),
    original_name: String(file.name || "dokumen.pdf").slice(0, 160),
    path: path.relative(process.cwd(), fullPath),
    size: buffer.length,
    uploaded_at: new Date().toISOString(),
    uploaded_by: user.nama_ukpd || user.username || user.role
  };
  verification[key] = false;
  const uploaded = Object.keys(CPNS_PNS_DOCUMENT_LABELS).filter((documentKey) => documents[documentKey]?.path).length;
  const nextStatus = item.status === "Dikembalikan ke CPNS" ? "Draft CPNS" : item.status;
  await pool.query(
    "UPDATE `usulan_cpns_pns` SET `dokumen` = ?, `verifikasi` = ?, `status` = ?, `updated_at` = NOW() WHERE `id` = ?",
    [JSON.stringify(documents), JSON.stringify(verification), nextStatus, id]
  );
  if (previous && previous !== fullPath) await fs.unlink(previous).catch(() => {});
  return ok({
    document: { ...documents[key], url: `/api/usulan/cpns-pns/dokumen?id=${id}&key=${key}` },
    verifikasi: verification,
    status: nextStatus,
    uploaded
  }, "Dokumen berhasil diunggah.");
}
