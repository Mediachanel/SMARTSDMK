import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureDrhSchema } from "@/lib/db/ensureDrhSchema";
import { importDrhToDatabase } from "@/lib/import/drhImport";
import { auditSecurityEvent } from "@/lib/security/auditLog";
import { enforceRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const DRH_PDF_MAX_BYTES = 10 * 1024 * 1024;
const DRH_PDF_MAX_FILES = 25;
const DRH_PDF_MAX_TOTAL_BYTES = 120 * 1024 * 1024;
const DRH_PREVIEW_MAX_ROWS_PER_SECTION = 1000;
const PDF_MIME_TYPES = new Set(["", "application/octet-stream", "application/pdf"]);

function getPythonCandidates() {
  const configured = process.env.DRH_PYTHON_BIN?.trim();
  if (configured) return [{ command: configured, argsPrefix: [] }];

  if (process.platform === "win32") {
    return [
      { command: "python", argsPrefix: [] },
      { command: "py", argsPrefix: ["-3"] },
      { command: "python3", argsPrefix: [] },
    ];
  }

  return [
    { command: "python3", argsPrefix: [] },
    { command: "python", argsPrefix: [] },
    { command: "py", argsPrefix: ["-3"] },
  ];
}

function normalizeFileName(value) {
  return String(value || "").replace(/[^\w.-]+/g, "_");
}

async function runDrhParser(parserPath, tempPath) {
  const candidates = getPythonCandidates();
  const missingCommands = [];

  for (const candidate of candidates) {
    try {
      return await execFileAsync(candidate.command, [...candidate.argsPrefix, parserPath, tempPath], {
        cwd: process.cwd(),
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch (error) {
      if (!isMissingPythonError(error)) {
        throw error;
      }
      missingCommands.push(candidate.command);
    }
  }

  throw new Error(
    `Interpreter Python tidak ditemukan. Dicoba: ${missingCommands.join(", ")}. Pastikan image Docker sudah di-rebuild atau set DRH_PYTHON_BIN.`
  );
}

function isMissingPythonError(error) {
  if (error.code === "ENOENT") return true;
  const text = [error.message, error.stderr, error.stdout].map((value) => String(value || "")).join("\n").toLowerCase();
  return (
    text.includes("python was not found") ||
    text.includes("microsoft store") ||
    text.includes("app execution aliases")
  );
}

function formatParserError(error) {
  const stderr = String(error.stderr || "");
  const combined = [error.message, error.stderr, error.stdout].map((value) => String(value || "")).join("\n");
  if (stderr.includes("No module named 'pdfplumber'") || stderr.includes('No module named "pdfplumber"')) {
    return "Parser PDF membutuhkan package Python `pdfplumber`. Jalankan `pip install -r requirements.txt` atau rebuild image Docker terbaru.";
  }
  if (/No \/Root object|PDFSyntaxError|PdfminerException/i.test(combined)) {
    return "File PDF tidak valid atau tidak dapat dibaca sebagai dokumen DRH.";
  }
  return String(error.message || "Parser PDF gagal membaca file.").split(/\r?\n/, 1)[0];
}

async function parseDrhPdf(file) {
  const uploadName = normalizeFileName(file?.name || "drh.pdf");
  const tempPath = path.join(os.tmpdir(), `drh-${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}-${uploadName}`);
  const parserPath = path.join(process.cwd(), "scripts", "parse_drh_pdf.py");
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length <= 0) {
    throw new Error("File PDF DRH kosong atau tidak dapat dibaca.");
  }
  if (buffer.length > DRH_PDF_MAX_BYTES) {
    throw new Error(`Ukuran PDF DRH maksimal ${DRH_PDF_MAX_BYTES / (1024 * 1024)} MB.`);
  }
  if (buffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("File tidak terbaca sebagai PDF yang valid.");
  }

  await fs.writeFile(tempPath, buffer);

  try {
    const { stdout, stderr } = await runDrhParser(parserPath, tempPath);
    if (!stdout) {
      throw new Error(stderr || "Parser PDF tidak mengembalikan data.");
    }
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Gagal membaca PDF DRH: ${formatParserError(error)}`);
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

function isUploadFile(value) {
  return value && typeof value !== "string" && typeof value.arrayBuffer === "function";
}

function getUploadFiles(formData) {
  const multiFiles = formData.getAll("files").filter(isUploadFile);
  if (multiFiles.length) return multiFiles;
  const single = formData.get("file");
  return isUploadFile(single) ? [single] : [];
}

function validatePdfFile(file) {
  if (!String(file.name || "").toLowerCase().endsWith(".pdf")) {
    return "Format file harus PDF.";
  }
  if (!PDF_MIME_TYPES.has(String(file.type || "").toLowerCase())) {
    return "MIME type file PDF tidak valid.";
  }
  if (file.size > DRH_PDF_MAX_BYTES) {
    return `Ukuran PDF DRH maksimal ${DRH_PDF_MAX_BYTES / (1024 * 1024)} MB per file.`;
  }
  return "";
}

function buildParsedSummary(parsed) {
  return {
    pegawai: parsed.pegawai,
    counts: parsed.counts,
    pages: parsed?.metadata?.pages || 0,
  };
}

function buildParsedPreview(parsed) {
  return {
    pegawai: parsed?.pegawai || {},
    riwayat_pendidikan: parsed?.riwayat_pendidikan || [],
    keluarga: parsed?.keluarga || [],
    riwayat_jabatan: parsed?.riwayat_jabatan || [],
    riwayat_gaji_pokok: parsed?.riwayat_gaji_pokok || [],
    riwayat_pangkat: parsed?.riwayat_pangkat || [],
    riwayat_penghargaan: parsed?.riwayat_penghargaan || [],
    riwayat_skp: parsed?.riwayat_skp || [],
    riwayat_hukuman_disiplin: parsed?.riwayat_hukuman_disiplin || [],
    riwayat_prestasi_pendidikan: parsed?.informasi_pendukung?.prestasi_pendidikan || [],
    riwayat_narasumber: parsed?.informasi_pendukung?.narasumber || [],
    riwayat_kegiatan_strategis: parsed?.informasi_pendukung?.kegiatan_strategis || [],
    riwayat_keberhasilan: parsed?.informasi_pendukung?.keberhasilan || [],
  };
}

function normalizePreviewScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function normalizePreviewObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => typeof key === "string" && key.length <= 80)
      .map(([key, item]) => [key, normalizePreviewScalar(item)])
  );
}

function normalizePreviewRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, DRH_PREVIEW_MAX_ROWS_PER_SECTION)
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map(normalizePreviewObject);
}

function buildParsedFromPreview(parsedPreview, metadata = {}) {
  const preview = parsedPreview && typeof parsedPreview === "object" ? parsedPreview : {};
  const parsed = {
    metadata: {
      pages: Number(metadata.pages || 0),
    },
    pegawai: normalizePreviewObject(preview.pegawai),
    riwayat_pendidikan: normalizePreviewRows(preview.riwayat_pendidikan),
    keluarga: normalizePreviewRows(preview.keluarga),
    riwayat_jabatan: normalizePreviewRows(preview.riwayat_jabatan),
    riwayat_gaji_pokok: normalizePreviewRows(preview.riwayat_gaji_pokok),
    riwayat_pangkat: normalizePreviewRows(preview.riwayat_pangkat),
    riwayat_penghargaan: normalizePreviewRows(preview.riwayat_penghargaan),
    riwayat_skp: normalizePreviewRows(preview.riwayat_skp),
    riwayat_hukuman_disiplin: normalizePreviewRows(preview.riwayat_hukuman_disiplin),
    informasi_pendukung: {
      prestasi_pendidikan: normalizePreviewRows(preview.riwayat_prestasi_pendidikan),
      narasumber: normalizePreviewRows(preview.riwayat_narasumber),
      kegiatan_strategis: normalizePreviewRows(preview.riwayat_kegiatan_strategis),
      keberhasilan: normalizePreviewRows(preview.riwayat_keberhasilan),
    },
  };

  parsed.counts = {
    riwayat_pendidikan: parsed.riwayat_pendidikan.length,
    keluarga: parsed.keluarga.length,
    riwayat_jabatan: parsed.riwayat_jabatan.length,
    riwayat_gaji_pokok: parsed.riwayat_gaji_pokok.length,
    riwayat_pangkat: parsed.riwayat_pangkat.length,
    riwayat_penghargaan: parsed.riwayat_penghargaan.length,
    riwayat_skp: parsed.riwayat_skp.length,
    riwayat_hukuman_disiplin: parsed.riwayat_hukuman_disiplin.length,
    prestasi_pendidikan: parsed.informasi_pendukung.prestasi_pendidikan.length,
    narasumber: parsed.informasi_pendukung.narasumber.length,
    kegiatan_strategis: parsed.informasi_pendukung.kegiatan_strategis.length,
    keberhasilan: parsed.informasi_pendukung.keberhasilan.length,
  };

  return parsed;
}

function addCounts(total = {}, counts = {}) {
  const next = { ...total };
  for (const [key, value] of Object.entries(counts || {})) {
    next[key] = Number(next[key] || 0) + Number(value || 0);
  }
  return next;
}

export async function POST(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_UKPD], request);
  if (error) return error;
  const rateLimitError = enforceRateLimit(request, {
    namespace: "import-drh",
    limit: 8,
    windowMs: 15 * 60 * 1000,
    key: user.username
  });
  if (rateLimitError) {
    auditSecurityEvent(request, "import_drh_rate_limited", { username: user.username, role: user.role });
    return rateLimitError;
  }

  const formData = await request.formData();
  const files = getUploadFiles(formData);
  if (!files.length) {
    return fail("File PDF DRH wajib dipilih.", 422);
  }
  if (files.length > DRH_PDF_MAX_FILES) {
    return fail(`Maksimal ${DRH_PDF_MAX_FILES} file PDF DRH dalam sekali import.`, 422);
  }
  const totalBytes = files.reduce((total, file) => total + Number(file.size || 0), 0);
  if (totalBytes > DRH_PDF_MAX_TOTAL_BYTES) {
    return fail(`Total ukuran PDF DRH maksimal ${DRH_PDF_MAX_TOTAL_BYTES / (1024 * 1024)} MB per sekali import.`, 413);
  }
  const fileErrors = files
    .map((file) => ({ fileName: file.name || "drh.pdf", message: validatePdfFile(file) }))
    .filter((item) => item.message);
  if (fileErrors.length) {
    return fail("Sebagian file DRH tidak valid.", 422, { results: fileErrors });
  }

  const pool = await getConnectedPool();
  const connection = await pool.getConnection();

  try {
    await ensureDrhSchema(connection);
    const results = [];
    let importedCounts = {};

    for (const file of files) {
      let transactionStarted = false;
      let parsed = null;
      try {
        parsed = await parseDrhPdf(file);
        await connection.beginTransaction();
        transactionStarted = true;
        const imported = await importDrhToDatabase(connection, parsed, {
          fileName: file.name,
          allowedUkpdName: user.role === ROLES.ADMIN_UKPD ? user.nama_ukpd : "",
        });
        await connection.commit();
        transactionStarted = false;
        importedCounts = addCounts(importedCounts, imported.importedCounts);
        results.push({
          status: "success",
          ...imported,
          parsedSummary: buildParsedSummary(parsed),
          parsedPreview: buildParsedPreview(parsed),
        });
      } catch (importError) {
        if (transactionStarted) {
          await connection.rollback().catch(() => {});
        }
        const parsedDetails = parsed
          ? {
              namaPegawai: parsed?.pegawai?.nama || parsed?.pegawai?.nama_lengkap || null,
              nip: parsed?.pegawai?.nip || null,
              parsedSummary: buildParsedSummary(parsed),
              parsedPreview: buildParsedPreview(parsed),
            }
          : {};
        results.push({
          status: "failed",
          fileName: file.name || "drh.pdf",
          message: importError.message || "Import PDF DRH gagal diproses.",
          ...parsedDetails,
        });
      }
    }

    const successCount = results.filter((item) => item.status === "success").length;
    const failedCount = results.length - successCount;
    if (!successCount) {
      return fail("Semua file PDF DRH gagal diproses.", 422, {
        batch: true,
        totalFiles: files.length,
        successCount,
        failedCount,
        results,
      });
    }

    if (files.length > 1) {
      auditSecurityEvent(request, "import_drh_success", {
        username: user.username,
        role: user.role,
        files: files.length,
        failedCount
      });
      return ok(
        {
          batch: true,
          totalFiles: files.length,
          successCount,
          failedCount,
          importedCounts,
          results,
        },
        failedCount ? "Import PDF DRH selesai dengan sebagian file gagal." : "Semua PDF DRH berhasil diproses."
      );
    }

    const imported = results[0];
    auditSecurityEvent(request, "import_drh_success", { username: user.username, role: user.role, files: files.length });
    return ok(
      {
        ...imported,
      },
      "Import PDF DRH berhasil diproses"
    );
  } catch (importError) {
    const status = importError.status || 500;
    auditSecurityEvent(request, "import_drh_failed", { username: user.username, role: user.role, status });
    return fail(status >= 500 ? "Import PDF DRH gagal diproses." : (importError.message || "Import PDF DRH gagal diproses."), status);
  } finally {
    connection.release();
  }
}

export async function PUT(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_UKPD], request);
  if (error) return error;
  const rateLimitError = enforceRateLimit(request, {
    namespace: "import-drh-save",
    limit: 20,
    windowMs: 15 * 60 * 1000,
    key: user.username
  });
  if (rateLimitError) {
    auditSecurityEvent(request, "import_drh_save_rate_limited", { username: user.username, role: user.role });
    return rateLimitError;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Payload hasil edit DRH tidak valid.", 422);
  }

  if (!body?.parsedPreview || typeof body.parsedPreview !== "object") {
    return fail("Data hasil edit DRH wajib dikirim.", 422);
  }

  const parsed = buildParsedFromPreview(body.parsedPreview, body.parsedSummary);
  const pool = await getConnectedPool();
  const connection = await pool.getConnection();

  try {
    await ensureDrhSchema(connection);
    await connection.beginTransaction();
    const imported = await importDrhToDatabase(connection, parsed, {
      fileName: body.fileName || "hasil-edit-drh.pdf",
      allowedUkpdName: user.role === ROLES.ADMIN_UKPD ? user.nama_ukpd : "",
    });
    await connection.commit();
    auditSecurityEvent(request, "import_drh_save_success", { username: user.username, role: user.role });

    return ok(
      {
        status: "success",
        ...imported,
        parsedSummary: buildParsedSummary(parsed),
        parsedPreview: buildParsedPreview(parsed),
      },
      "Hasil edit DRH berhasil disimpan"
    );
  } catch (importError) {
    await connection.rollback().catch(() => {});
    const status = importError.status || 500;
    auditSecurityEvent(request, "import_drh_save_failed", { username: user.username, role: user.role, status });
    return fail(status >= 500 ? "Hasil edit DRH gagal disimpan." : (importError.message || "Hasil edit DRH gagal disimpan."), status);
  } finally {
    connection.release();
  }
}
