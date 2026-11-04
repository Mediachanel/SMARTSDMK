import { fail, ok } from "@/lib/helpers/response";
import { createSignedDocumentUrl, storeDocument, validAutomationToken } from "@/lib/suratStorage";

export const runtime = "nodejs";

export async function POST(request) {
  if (!validAutomationToken(request)) return fail("Token otomatisasi tidak valid.", 401);
  try {
    const body = await request.json();
    const buffer = Buffer.from(String(body.base64 || "").replace(/^data:[^;]+;base64,/, ""), "base64");
    const document = await storeDocument({ buffer, filename: body.filename, mime: body.mimetype });
    return ok({ ...document, webViewLink: createSignedDocumentUrl(document.key, request) }, 201);
  } catch (error) {
    return fail(error.message || "Gagal menyimpan dokumen ke USB.", 422);
  }
}
