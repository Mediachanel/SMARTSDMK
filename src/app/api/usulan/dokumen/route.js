import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureUsulanSchema } from "@/lib/db/ensureUsulanSchema";
import {
  CHECKLIST_DOCUMENT_MAX_BYTES,
  getChecklistLabels,
  parseChecklist,
  parseJsonObject
} from "@/lib/usulan/checklist";
import { auditSecurityEvent } from "@/lib/security/auditLog";
import { enforceRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const STORAGE_ROOT = path.join(process.cwd(), "storage", "usulan-documents");
const PDF_MIME_TYPES = new Set(["", "application/octet-stream", "application/pdf"]);

const USULAN_CONFIG = {
  mutasi: {
    table: "usulan_mutasi",
    alias: "m"
  },
  "putus-jf": {
    table: "usulan_pjf_stop",
    alias: "s"
  }
};

function buildScopeClause(alias, user) {
  if (user.role === ROLES.SUPER_ADMIN) {
    return { where: "", params: [] };
  }

  if (user.role === ROLES.ADMIN_UKPD) {
    return {
      where: `WHERE (${alias}.\`nama_ukpd\` = ? OR ${alias}.\`created_by_ukpd\` = ?)`,
      params: [user.nama_ukpd, user.nama_ukpd]
    };
  }

  if (user.role === ROLES.ADMIN_WILAYAH) {
    return {
      where: `WHERE (
        EXISTS (
          SELECT 1
          FROM \`pegawai\` p
          WHERE CAST(p.\`nip\` AS TEXT) = CAST(${alias}.\`nip\` AS TEXT)
            AND p.\`wilayah\` = ?
        )
        OR EXISTS (
          SELECT 1
          FROM \`ukpd\` u
          WHERE CAST(u.\`nama_ukpd\` AS TEXT) = CAST(${alias}.\`nama_ukpd\` AS TEXT)
            AND u.\`wilayah\` = ?
        )
      )`,
      params: [user.wilayah, user.wilayah]
    };
  }

  return { where: "WHERE 1 = 0", params: [] };
}

function getConfig(type) {
  return USULAN_CONFIG[type] || null;
}

async function ensureAccessibleItem(pool, user, type, id) {
  const config = getConfig(type);
  if (!config) return null;

  const scope = buildScopeClause(config.alias, user);
  const [rows] = await pool.query(
    `SELECT ${config.alias}.*
     FROM \`${config.table}\` ${config.alias}
     ${scope.where ? `${scope.where} AND ${config.alias}.\`id\` = ?` : `WHERE ${config.alias}.\`id\` = ?`}
     LIMIT 1`,
    [...scope.params, id]
  );
  return rows[0] || null;
}

async function loadItem(pool, type, id) {
  const config = getConfig(type);
  const [[item]] = await pool.query(`SELECT * FROM \`${config.table}\` WHERE \`id\` = ? LIMIT 1`, [id]);
  return item || null;
}

function normalizeFileName(value) {
  const clean = String(value || "dokumen.pdf")
    .normalize("NFKD")
    .replace(/[^\w.\- ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120);
  if (!clean) return "dokumen.pdf";
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
}

function isInsidePath(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getSafeDocumentPath(relativePath) {
  const root = path.resolve(STORAGE_ROOT);
  const fullPath = path.resolve(process.cwd(), relativePath || "");
  return isInsidePath(fullPath, root) ? fullPath : null;
}

async function removePreviousDocument(document) {
  if (!document?.path) return;
  const fullPath = getSafeDocumentPath(document.path);
  if (!fullPath) return;
  await fs.unlink(fullPath).catch(() => {});
}

function getRequestMeta(request) {
  const { searchParams } = new URL(request.url);
  return {
    type: searchParams.get("type") || "",
    id: Number(searchParams.get("id") || 0),
    key: searchParams.get("key") || ""
  };
}

export async function GET(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD]);
  if (error) return error;

  const { type, id, key } = getRequestMeta(request);
  const labels = getChecklistLabels(type);
  if (!getConfig(type) || !Number.isInteger(id) || id <= 0 || !labels[key]) {
    return fail("Parameter dokumen tidak valid.", 422);
  }

  const pool = await getConnectedPool();
  await ensureUsulanSchema(pool);
  const current = await ensureAccessibleItem(pool, user, type, id);
  if (!current) return fail("Usulan tidak ditemukan atau tidak dapat diakses.", 404);

  const documents = parseJsonObject(current.dokumen_checklist);
  const document = documents[key];
  if (!document?.path) return fail("Dokumen belum diunggah.", 404);

  const fullPath = getSafeDocumentPath(document.path);
  if (!fullPath) return fail("Lokasi dokumen tidak valid.", 422);

  try {
    const file = await fs.readFile(fullPath);
    const fileName = normalizeFileName(document.name || `${key}.pdf`);
    return new Response(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(file.length),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return fail("File dokumen tidak ditemukan di penyimpanan.", 404);
  }
}

export async function POST(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD], request);
  if (error) return error;
  const rateLimitError = enforceRateLimit(request, {
    namespace: "usulan-document-upload",
    limit: 40,
    windowMs: 15 * 60 * 1000,
    key: user.username
  });
  if (rateLimitError) {
    auditSecurityEvent(request, "usulan_document_upload_rate_limited", { username: user.username, role: user.role });
    return rateLimitError;
  }

  const formData = await request.formData();
  const type = String(formData.get("type") || "");
  const id = Number(formData.get("id") || 0);
  const key = String(formData.get("key") || "");
  const file = formData.get("file");
  const labels = getChecklistLabels(type);

  if (!getConfig(type) || !Number.isInteger(id) || id <= 0 || !labels[key]) {
    return fail("Parameter upload dokumen tidak valid.", 422);
  }

  if (!file || typeof file.arrayBuffer !== "function") {
    return fail("Pilih file PDF yang akan diunggah.", 422);
  }

  if (!String(file.name || "").toLowerCase().endsWith(".pdf")) {
    return fail("Dokumen pendukung wajib berformat PDF.", 422);
  }
  if (!PDF_MIME_TYPES.has(String(file.type || "").toLowerCase())) {
    return fail("MIME type dokumen PDF tidak valid.", 422);
  }

  if (file.size <= 0) {
    return fail("File PDF kosong atau tidak dapat dibaca.", 422);
  }

  if (file.size > CHECKLIST_DOCUMENT_MAX_BYTES) {
    return fail(`Ukuran PDF maksimal ${CHECKLIST_DOCUMENT_MAX_BYTES / (1024 * 1024)} MB.`, 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > CHECKLIST_DOCUMENT_MAX_BYTES) {
    return fail(`Ukuran PDF maksimal ${CHECKLIST_DOCUMENT_MAX_BYTES / (1024 * 1024)} MB.`, 413);
  }

  if (buffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
    return fail("File tidak terbaca sebagai PDF yang valid.", 422);
  }

  const pool = await getConnectedPool();
  await ensureUsulanSchema(pool);
  const current = await ensureAccessibleItem(pool, user, type, id);
  if (!current) return fail("Usulan tidak ditemukan atau tidak dapat diakses.", 404);

  const documents = parseJsonObject(current.dokumen_checklist);
  const checklist = parseChecklist(current.verif_checklist, labels);
  const uploadDir = path.join(STORAGE_ROOT, type, String(id));
  const displayName = normalizeFileName(file.name);
  const storedName = `${key}-${Date.now()}-${randomUUID()}.pdf`;
  const fullPath = path.join(uploadDir, storedName);
  const relativePath = path.relative(process.cwd(), fullPath);

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(fullPath, buffer);

  const previousDocument = documents[key];
  documents[key] = {
    key,
    label: labels[key],
    name: displayName,
    path: relativePath,
    size: buffer.length,
    content_type: "application/pdf",
    uploaded_at: new Date().toISOString(),
    uploaded_by: user.nama_ukpd || user.username || user.role
  };
  if (user.role !== ROLES.ADMIN_UKPD) {
    checklist[key] = true;
  }

  const config = getConfig(type);
  await pool.query(
    `UPDATE \`${config.table}\`
     SET \`dokumen_checklist\` = ?, \`verif_checklist\` = ?, \`updated_at\` = NOW()
     WHERE \`id\` = ?`,
    [JSON.stringify(documents), JSON.stringify(checklist), id]
  );
  await removePreviousDocument(previousDocument);

  const item = await loadItem(pool, type, id);
  auditSecurityEvent(request, "usulan_document_upload_success", {
    username: user.username,
    role: user.role,
    type,
    id,
    key,
    size: buffer.length
  });
  return ok(item, "Dokumen checklist berhasil diunggah.");
}
