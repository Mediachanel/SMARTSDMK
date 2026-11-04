import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fail } from "@/lib/helpers/response";

export const runtime = "nodejs";

const FILES = {
  manifest: { name: "manifest.json", contentType: "application/json; charset=utf-8" },
  rekap: { name: "rekap.csv", contentType: "text/csv; charset=utf-8" },
  "rekap-all": { name: "rekap-all.csv", contentType: "text/csv; charset=utf-8" },
  ringkasan: { name: "ringkasan.csv", contentType: "text/csv; charset=utf-8" },
};

function csvFileFromKey(key) {
  const normalized = String(key || "")
    .toLowerCase()
    .replace(/\.csv$/i, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return null;
  return { name: `${normalized}.csv`, contentType: "text/csv; charset=utf-8" };
}

function exportRoot() {
  return process.env.PETA_JABATAN_EXPORT_DIR
    || path.join(process.env.STORAGE_LOCAL_PATH || "/app/storage", "exports", "peta-jabatan");
}

function validToken(request) {
  const expected = process.env.PETA_JABATAN_EXPORT_TOKEN || process.env.SURAT_AUTOMATION_TOKEN || "";
  if (!expected) return true;
  const url = new URL(request.url);
  const supplied = request.headers.get("x-export-token") || url.searchParams.get("token") || "";
  return supplied && supplied === expected;
}

export async function GET(request) {
  if (!validToken(request)) return fail("Token export peta jabatan tidak valid.", 401);

  const url = new URL(request.url);
  const key = url.searchParams.get("file") || "manifest";
  const file = FILES[key] || csvFileFromKey(key);
  if (!file) return fail("File export tidak dikenal.", 404);

  const filePath = path.join(exportRoot(), file.name);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return fail("File export tidak ditemukan.", 404);
    const body = await readFile(filePath);
    return new Response(body, {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return fail("File export belum tersedia. Jalankan scripts/export-peta-jabatan-readonly.sh terlebih dahulu.", 404);
  }
}
