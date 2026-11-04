import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import archiver from "archiver";
import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureCpnsPnsSchema } from "@/lib/db/ensureCpnsPnsSchema";
import { fail } from "@/lib/helpers/response";
import { CPNS_PNS_DOCUMENT_LABELS, normalizedDocumentName, parseObject, safeFilePart } from "@/lib/usulan/cpnsPns";

export const runtime = "nodejs";

const STORAGE_ROOT = path.resolve(process.env.CPNS_PNS_STORAGE_ROOT || path.join(process.cwd(), "storage", "usulan-documents", "cpns-pns"));
const STORAGE_MARKER = path.join(STORAGE_ROOT, ".smart-hrm-usb-storage");
const ALLOWED = [ROLES.SUPER_ADMIN, ROLES.ADMIN_UKPD, ROLES.CPNS];
const ZIP_EXCLUDED_DOCUMENT_KEYS = new Set(["usul"]);

function scope(user) {
  if (user.role === ROLES.SUPER_ADMIN) return { sql: "1 = 1", params: [] };
  if (user.role === ROLES.CPNS) return { sql: "`id_pegawai` = ?", params: [Number(user.id_pegawai || user.id)] };
  if (user.role === ROLES.ADMIN_UKPD) return { sql: "`nama_ukpd` = ?", params: [user.nama_ukpd] };
  return { sql: "1 = 0", params: [] };
}

function safeStoredPath(relative) {
  const full = path.resolve(process.cwd(), relative || "");
  const rel = path.relative(STORAGE_ROOT, full);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)) ? full : null;
}

async function ensureUsbStorage() {
  try { await fs.access(STORAGE_MARKER); }
  catch { throw Object.assign(new Error("USB penyimpanan dokumen CPNS tidak terpasang. Paket dokumen tidak dibuat agar tidak memakai hard disk server."), { status: 503 }); }
}

function text(value) {
  return String(value ?? "").trim();
}

function displayDate(value) {
  if (!value) return "";
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : text(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text(value);
}

async function buildReportWorkbook(items) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Rekap CPNS ke PNS", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  sheet.columns = [
    { header: "NO", key: "no", width: 7 },
    { header: "NIP", key: "nip", width: 23, style: { numFmt: "@" } },
    { header: "NAMA", key: "nama", width: 30 },
    { header: "UNIT KERJA", key: "unit", width: 38 },
    { header: "NOMOR STTPL", key: "nomorSttpl", width: 28, style: { numFmt: "@" } },
    { header: "TANGGAL STTPL", key: "tanggalSttpl", width: 18 },
    { header: "NOMOR SURAT TES KESEHATAN", key: "nomorSuket", width: 32, style: { numFmt: "@" } },
    { header: "TANGGAL SURAT TES KESEHATAN", key: "tanggalSuket", width: 22 },
    { header: "KETERANGAN", key: "keterangan", width: 28 },
  ];
  const header = sheet.getRow(1);
  header.height = 34;
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4C81" } };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  items.forEach((item, index) => {
    const row = sheet.addRow({
      no: index + 1,
      nip: text(item.nip),
      nama: text(item.nama_pegawai),
      unit: text(item.nama_ukpd),
      nomorSttpl: text(item.nomor_sttpl),
      tanggalSttpl: displayDate(item.tanggal_sttpl),
      nomorSuket: text(item.nomor_suket),
      tanggalSuket: displayDate(item.tanggal_suket),
      keterangan: text(item.keterangan_lampiran || item.status),
    });
    row.height = 28;
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).numFmt = "@";
    row.getCell(5).numFmt = "@";
    row.getCell(7).numFmt = "@";
    if (index % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });

  const border = { style: "thin", color: { argb: "FFCBD5E1" } };
  sheet.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: border, left: border, bottom: border, right: border };
  }));
  sheet.autoFilter = { from: "A1", to: `I${Math.max(1, sheet.rowCount)}` };
  sheet.pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  sheet.headerFooter.oddFooter = "&LRekap Pengusulan CPNS menjadi PNS&C&P dari &N&RSMART SDMK";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function GET(request) {
  const { user, error } = await requireAuth(ALLOWED);
  if (error) return error;
  const query = new URL(request.url).searchParams;
  const mode = query.get("mode") || "cpns";
  const id = Number(query.get("id") || 0);
  const ukpd = query.get("ukpd") || "";
  const tahapParam = query.get("tahap") || "";
  const tahap = tahapParam ? Number(tahapParam) : 0;
  const onlyValid = query.get("onlyValid") !== "0";
  if (!["cpns", "ukpd", "all", "report"].includes(mode)) return fail("Mode unduhan tidak valid.", 422);
  if (mode === "cpns" && (!Number.isInteger(id) || id <= 0)) return fail("Pilih CPNS yang akan diunduh.", 422);
  if (mode === "ukpd" && !ukpd) return fail("Pilih UKPD yang akan diunduh.", 422);
  if (tahapParam && ![1, 2].includes(tahap)) return fail("Tahap pengusulan tidak valid.", 422);
  if (mode === "report" && user.role !== ROLES.SUPER_ADMIN) return fail("Rekap semua hanya dapat diunduh oleh Super Admin.", 403);
  if (mode !== "report") {
    try { await ensureUsbStorage(); }
    catch (storageError) { return fail(storageError.message, storageError.status || 503); }
  }

  const pool = await getConnectedPool();
  await ensureCpnsPnsSchema(pool);
  const access = scope(user);
  const where = [access.sql];
  const params = [...access.params];
  if (mode === "cpns") { where.push("`id` = ?"); params.push(id); }
  if (mode === "ukpd") { where.push("`nama_ukpd` = ?"); params.push(ukpd); }
  if (tahap) { where.push("`tahap` = ?"); params.push(tahap); }
  if (user.role === ROLES.CPNS && mode !== "cpns") return fail("CPNS hanya dapat mengunduh paket dokumennya sendiri.", 403);
  if (onlyValid && mode !== "cpns") where.push("`status` IN ('Terverifikasi Admin UKPD', 'Direkap Dinkes', 'Diusulkan ke BKD', 'Selesai')");
  const [items] = await pool.query(`SELECT * FROM \`usulan_cpns_pns\` WHERE ${where.join(" AND ")} ORDER BY \`nama_ukpd\`, \`nama_pegawai\``, params);
  if (!items.length) return fail("Tidak ada dokumen yang sesuai untuk diunduh.", 404);

  if (mode === "report") {
    const workbook = await buildReportWorkbook(items);
    return new Response(workbook, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String(workbook.length),
      "Content-Disposition": `attachment; filename="REKAP_PENGUSULAN_CPNS_PNS_${tahap ? `TAHAP_${tahap}` : "SEMUA_TAHAP"}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    } });
  }

  const zip = archiver("zip", { store: true, forceZip64: true });
  zip.on("warning", (archiveError) => {
    if (archiveError.code !== "ENOENT") zip.destroy(archiveError);
  });
  request.signal.addEventListener("abort", () => zip.abort(), { once: true });

  for (const item of items) {
    const documents = parseObject(item.dokumen);
    const base = mode === "cpns" ? "" : `${safeFilePart(item.nama_ukpd)}/`;
    const employeeFolder = `${base}${safeFilePart(item.nip, "TANPA_NIP")}_${safeFilePart(item.nama_pegawai)}/`;
    for (const key of Object.keys(CPNS_PNS_DOCUMENT_LABELS)) {
      if (ZIP_EXCLUDED_DOCUMENT_KEYS.has(key)) continue;
      const stored = safeStoredPath(documents[key]?.path);
      if (!stored) continue;
      try {
        await fs.access(stored);
        zip.file(stored, { name: `${employeeFolder}${normalizedDocumentName(key, item.nip, item.nama_pegawai)}` });
      } catch {}
    }
  }
  zip.append(await buildReportWorkbook(items), { name: "REKAP_PENGUSULAN_CPNS_PNS.xlsx" });
  const label = mode === "cpns" ? `${items[0].nip}_${items[0].nama_pegawai}` : mode === "ukpd" ? ukpd : "SEMUA_UKPD";
  const stageLabel = tahap ? `_TAHAP_${tahap}` : "_SEMUA_TAHAP";
  const filename = `Paket_CPNS_PNS_${safeFilePart(label)}${stageLabel}.zip`;
  const body = Readable.toWeb(zip);
  void zip.finalize();
  return new Response(body, { headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  } });
}
