import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDocumentKey, safeFileName } from "@/lib/suratMasuk";

export const SURAT_STORAGE_ROOT = process.env.SURAT_MASUK_STORAGE_ROOT || "/usb-uploads/surat-masuk";
export const SURAT_MAX_BYTES = 30 * 1024 * 1024;

export function validAutomationToken(request) {
  const expected = Buffer.from(String(process.env.SURAT_AUTOMATION_TOKEN || ""));
  const supplied = Buffer.from(String(request.headers.get("x-surat-token") || ""));
  return expected.length >= 32 && supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}

export function resolveDocumentPath(key) {
  const root = path.resolve(SURAT_STORAGE_ROOT);
  const target = path.resolve(root, String(key || ""));
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

export async function storeDocument({ buffer, filename, mime }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("Dokumen kosong.");
  if (buffer.length > SURAT_MAX_BYTES) throw new Error("Ukuran dokumen maksimal 30 MB.");
  const name = safeFileName(filename);
  const key = createDocumentKey(name);
  const destination = resolveDocumentPath(key);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer, { flag: "wx" });
  return { key, name, mime: String(mime || "application/octet-stream").slice(0, 160), size: buffer.length };
}

function signingSecret() {
  return process.env.SURAT_LINK_SECRET || process.env.JWT_SECRET || "";
}

export function signDocumentLink(key, expires) {
  return crypto.createHmac("sha256", signingSecret()).update(`${key}:${expires}`).digest("hex");
}

export function verifyDocumentLink(key, expires, signature) {
  if (!key || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signDocumentLink(key, expires));
  const supplied = Buffer.from(String(signature));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function createSignedDocumentUrl(key, request, days = 30) {
  const expires = Math.floor(Date.now() / 1000) + days * 86400;
  const base = process.env.APP_URL || new URL(request.url).origin;
  const url = new URL("/api/surat-masuk/file", base);
  url.searchParams.set("key", key);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", signDocumentLink(key, expires));
  return url.toString();
}
