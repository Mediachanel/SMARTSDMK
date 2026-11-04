import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { filterPegawaiByRole } from "@/lib/auth/access";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensurePegawaiPhotoSchema } from "@/lib/db/ensurePegawaiPhotoSchema";
import { fail, ok } from "@/lib/helpers/response";
import { getPegawaiById, getUkpdData } from "@/lib/data/pegawaiStore";
import { parsePositiveId } from "@/lib/validation/pegawai";
import { auditSecurityEvent } from "@/lib/security/auditLog";
import { enforceRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 1024 * 1024;
const STORAGE_ROOT = path.join(process.cwd(), "storage", "pegawai-photos");
const IMAGE_TYPES = new Map([
  ["image/jpeg", { extension: "jpg", signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff }],
  ["image/png", { extension: "png", signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
  ["image/webp", { extension: "webp", signature: (buffer) => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" }]
]);

function isInsidePath(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getSafePhotoPath(relativePath) {
  const root = path.resolve(STORAGE_ROOT);
  const fullPath = path.resolve(process.cwd(), relativePath || "");
  return isInsidePath(fullPath, root) ? fullPath : null;
}

async function findAllowedPegawai(id, user) {
  const item = await getPegawaiById(id);
  if (!item) return null;
  const ukpdList = await getUkpdData();
  return filterPegawaiByRole([item], user, ukpdList).find((entry) => entry.id_pegawai === Number(id)) || null;
}

function validateImageBuffer(file, buffer) {
  const contentType = String(file.type || "").toLowerCase();
  const imageType = IMAGE_TYPES.get(contentType);
  if (!imageType) {
    return { error: "Foto profil harus berformat JPG, PNG, atau WEBP." };
  }
  if (!imageType.signature(buffer)) {
    return { error: "File foto tidak valid atau tidak sesuai format gambar." };
  }
  return { contentType, extension: imageType.extension };
}

export async function GET(_request, { params }) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD]);
  if (error) return error;

  const { id: rawId } = await params;
  const id = parsePositiveId(rawId);
  if (!id) return fail("ID pegawai tidak valid.", 400);

  const pool = await getConnectedPool();
  await ensurePegawaiPhotoSchema(pool);
  const current = await findAllowedPegawai(id, user);
  if (!current) return fail("Data pegawai tidak ditemukan atau tidak dapat diakses.", 404);
  if (!current.foto_profil_path) return fail("Foto profil belum tersedia.", 404);

  const fullPath = getSafePhotoPath(current.foto_profil_path);
  if (!fullPath) return fail("Lokasi foto profil tidak valid.", 422);

  try {
    const file = await fs.readFile(fullPath);
    return new Response(file, {
      headers: {
        "Content-Type": current.foto_profil_content_type || "image/jpeg",
        "Content-Length": String(file.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return fail("File foto profil tidak ditemukan di penyimpanan.", 404);
  }
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD], request);
  if (error) return error;

  const rateLimitError = enforceRateLimit(request, {
    namespace: "pegawai-photo-upload",
    limit: 30,
    windowMs: 15 * 60 * 1000,
    key: user.username
  });
  if (rateLimitError) {
    auditSecurityEvent(request, "pegawai_photo_upload_rate_limited", { username: user.username, role: user.role });
    return rateLimitError;
  }

  const { id: rawId } = await params;
  const id = parsePositiveId(rawId);
  if (!id) return fail("ID pegawai tidak valid.", 400);

  const pool = await getConnectedPool();
  await ensurePegawaiPhotoSchema(pool);
  const current = await findAllowedPegawai(id, user);
  if (!current) return fail("Data pegawai tidak ditemukan atau tidak dapat diakses.", 404);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return fail("Pilih file foto profil yang akan diunggah.", 422);
  }
  if (file.size <= 0) return fail("File foto profil kosong atau tidak dapat dibaca.", 422);
  if (file.size > MAX_PHOTO_BYTES) return fail("Ukuran foto profil maksimal 1 MB.", 413);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_PHOTO_BYTES) return fail("Ukuran foto profil maksimal 1 MB.", 413);

  const validation = validateImageBuffer(file, buffer);
  if (validation.error) return fail(validation.error, 422);

  const uploadDir = path.join(STORAGE_ROOT, String(id));
  const storedName = `profile-${Date.now()}-${randomUUID()}.${validation.extension}`;
  const fullPath = path.join(uploadDir, storedName);
  const relativePath = path.relative(process.cwd(), fullPath);
  const photoUrl = `/api/pegawai/${id}/photo?v=${Date.now()}`;

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(fullPath, buffer);

  await pool.query(
    `UPDATE \`pegawai\`
     SET \`foto_profil_url\` = ?,
         \`foto_profil_path\` = ?,
         \`foto_profil_content_type\` = ?,
         \`foto_profil_size\` = ?,
         \`foto_profil_updated_at\` = NOW()
     WHERE \`id_pegawai\` = ?`,
    [photoUrl, relativePath, validation.contentType, buffer.length, id]
  );

  if (current.foto_profil_path) {
    const previousPath = getSafePhotoPath(current.foto_profil_path);
    if (previousPath && previousPath !== fullPath) await fs.unlink(previousPath).catch(() => {});
  }

  auditSecurityEvent(request, "pegawai_photo_upload_success", {
    username: user.username,
    role: user.role,
    id_pegawai: id,
    size: buffer.length,
    content_type: validation.contentType
  });

  return ok({
    id_pegawai: id,
    foto_profil_url: photoUrl,
    foto_profil_size: buffer.length,
    foto_profil_content_type: validation.contentType
  }, "Foto profil berhasil diunggah.");
}
