import fs from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLES } from "@/lib/constants/roles";
import { fail } from "@/lib/helpers/response";
import { resolveDocumentPath, verifyDocumentLink } from "@/lib/suratStorage";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const signed = verifyDocumentLink(key, url.searchParams.get("expires"), url.searchParams.get("sig"));
  const user = signed ? null : await getCurrentUser();
  if (!signed && user?.role !== ROLES.SUPER_ADMIN) return fail("Dokumen tidak dapat diakses.", 403);
  const target = resolveDocumentPath(key);
  if (!target) return fail("Lokasi dokumen tidak valid.", 422);
  try {
    const file = await fs.readFile(target);
    return new Response(file, { headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.length),
      "Content-Disposition": `inline; filename="${path.basename(target).replace(/[\"\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "Pragma": "no-cache", "X-Content-Type-Options": "nosniff"
    }});
  } catch { return fail("Dokumen tidak ditemukan di USB server.", 404); }
}
