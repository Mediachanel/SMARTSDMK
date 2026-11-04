import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { getConnectedPool } from "../src/lib/db/postgres.js";
import { ensurePejabatPltPlhSchema } from "../src/lib/db/ensurePejabatPltPlhSchema.js";

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(path.resolve(".env.local"));

const inputPath = path.resolve(process.argv[2] || "MONITORING PLT-PLH (1).xlsx");
const pltSheetName = process.argv[3] || "Mei 2026";
const IMPORT_SOURCE = "excel-monthly";
const MONTHS = new Map([
  ["januari", "01"],
  ["jan", "01"],
  ["februari", "02"],
  ["feb", "02"],
  ["maret", "03"],
  ["mar", "03"],
  ["april", "04"],
  ["apr", "04"],
  ["mei", "05"],
  ["may", "05"],
  ["juni", "06"],
  ["jun", "06"],
  ["juli", "07"],
  ["jul", "07"],
  ["agustus", "08"],
  ["agu", "08"],
  ["aug", "08"],
  ["september", "09"],
  ["sep", "09"],
  ["oktober", "10"],
  ["okt", "10"],
  ["oct", "10"],
  ["november", "11"],
  ["nov", "11"],
  ["desember", "12"],
  ["des", "12"],
  ["dec", "12"]
]);

function decodeXml(value = "") {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function getAttr(value, attr) {
  return decodeXml((String(value || "").match(new RegExp(`${attr}="([^"]*)"`, "i")) || [])[1] || "");
}

function columnIndexFromRef(ref) {
  const letters = String(ref || "").match(/[A-Z]+/i)?.[0]?.toUpperCase() || "";
  return letters.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function extractTextNodes(xml) {
  const values = [];
  const regex = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = regex.exec(xml))) values.push(decodeXml(match[1]));
  return values.join("");
}

function cellValue(attrs, inner, sharedStrings) {
  const type = getAttr(attrs, "t");
  const raw = decodeXml((inner.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1] || "");
  if (type === "inlineStr") return extractTextNodes(inner);
  if (type === "s") return sharedStrings[Number(raw)] || "";
  return raw;
}

function parseSharedStrings(xml) {
  const strings = [];
  const regex = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = regex.exec(xml || ""))) strings.push(extractTextNodes(match[1]));
  return strings;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const values = [];
    const cellRegex = /<c\b((?![^>]*\/>)[^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[2]))) {
      const index = columnIndexFromRef(getAttr(cellMatch[1], "r"));
      if (index > 0) values[index - 1] = cellValue(cellMatch[1], cellMatch[2], sharedStrings);
    }
    rows.push(values.map((value) => cleanText(value)));
  }
  return rows;
}

function cleanText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text === "-" ? "" : text;
}

function cleanNip(value) {
  return cleanText(value).replace(/^`+/, "").replace(/\D/g, "");
}

function isoDate(year, month, day) {
  const normalized = `${year}-${month}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? "" : normalized;
}

function excelSerialDate(value) {
  const text = cleanText(value);
  if (!/^\d+(\.\d+)?$/.test(text)) return "";
  const serial = Number(text);
  if (serial < 20000 || serial > 60000) return "";
  return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
}

function parseExplicitDate(value, fallbackYear = "") {
  const text = cleanText(value);
  if (!text) return "";
  const serial = excelSerialDate(text);
  if (serial) return serial;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return isoDate(iso[1], String(iso[2]).padStart(2, "0"), iso[3]);

  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (local) {
    let year = local[3].padStart(4, "0");
    if (year.length === 2) year = `20${year}`;
    if (Number(year) < 2000 && fallbackYear) year = fallbackYear;
    return isoDate(year, String(local[2]).padStart(2, "0"), local[1]);
  }

  const compact = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (compact) return normalizeDateToken(compact[1], compact[2], compact[3]);

  return "";
}

function normalizeDateToken(day, monthName, year) {
  const month = MONTHS.get(String(monthName || "").toLowerCase());
  if (!day || !month || !year) return "";
  return isoDate(year, month, day);
}

function parseDateRange(value) {
  const text = cleanText(value)
    .replace(/[()]/g, " ")
    .replace(/\bTMT\b/gi, " ")
    .replace(/\bsampai dengan tanggal\b/gi, "s.d")
    .replace(/\bsampai dengan\b/gi, "s.d")
    .replace(/\bsampai\b/gi, "s.d")
    .replace(/\s+/g, " ");
  if (!text) return null;

  const numeric = [...text.matchAll(/(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{2,4})/g)]
    .map((match) => {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return isoDate(year, String(match[2]).padStart(2, "0"), match[1]);
    })
    .filter(Boolean);
  if (numeric.length >= 2) return { mulai: numeric[0], selesai: numeric.at(-1) };

  const full = [...text.matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g)]
    .map((match) => normalizeDateToken(match[1], match[2], match[3]))
    .filter(Boolean);
  if (full.length >= 2) return { mulai: full[0], selesai: full.at(-1) };
  if (full.length === 1) {
    const firstDate = full[0];
    const beforeFull = text.slice(0, text.search(/\d{1,2}\s+[A-Za-z]+\s+\d{4}/));
    const priorDay = [...beforeFull.matchAll(/(\d{1,2})(?=\s*(?:,|dan|-|s\.d))/gi)].map((match) => Number(match[1])).filter(Boolean).at(-1);
    if (priorDay) return { mulai: `${firstDate.slice(0, 8)}${String(priorDay).padStart(2, "0")}`, selesai: firstDate };

    const sameMonthRange = text.match(/(\d{1,2})\s*[-,]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (sameMonthRange) {
      return {
        mulai: normalizeDateToken(sameMonthRange[1], sameMonthRange[3], sameMonthRange[4]),
        selesai: normalizeDateToken(sameMonthRange[2], sameMonthRange[3], sameMonthRange[4])
      };
    }
    return { mulai: firstDate, selesai: firstDate };
  }

  const sameMonth = text.match(/(\d{1,2})\s*(?:,|dan|-)\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (sameMonth) {
    return {
      mulai: normalizeDateToken(sameMonth[1], sameMonth[3], sameMonth[4]),
      selesai: normalizeDateToken(sameMonth[2], sameMonth[3], sameMonth[4])
    };
  }

  return null;
}

function parseRangeWithExplicitDates(tmtValue, mulaiValue, selesaiValue) {
  const range = parseDateRange(tmtValue);
  const fallbackYear = range?.mulai?.slice(0, 4) || range?.selesai?.slice(0, 4) || "";
  const mulai = parseExplicitDate(mulaiValue, fallbackYear) || range?.mulai || "";
  const selesai = parseExplicitDate(selesaiValue, fallbackYear) || range?.selesai || "";
  return mulai && selesai ? { mulai, selesai } : null;
}

async function readWorkbookSheets(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  const sharedStrings = parseSharedStrings(await zip.file("xl/sharedStrings.xml")?.async("string"));
  const sheets = new Map();
  const sheetRegex = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g;
  let match;
  while ((match = sheetRegex.exec(workbookXml || ""))) {
    const name = decodeXml(match[1]);
    const relTarget = (relsXml || "").match(new RegExp(`<Relationship[^>]*Id="${match[2]}"[^>]*Target="([^"]+)"`, "i"))?.[1];
    if (!relTarget) continue;
    const sheetPath = `xl/${decodeXml(relTarget).replace(/^\/?xl\//, "")}`;
    const xml = await zip.file(sheetPath)?.async("string");
    if (xml) sheets.set(name.trim(), parseSheetRows(xml, sharedStrings));
  }
  return sheets;
}

function mapPltRows(rows) {
  return rows.slice(7).map((row) => {
    const range = parseDateRange(row[10]);
    return {
      jenis_penugasan: "PLT",
      nip: cleanNip(row[9]),
      nama_pejabat: cleanText(row[8]),
      jabatan_saat_ini: "",
      ukpd_asal: "",
      pangkat_golongan: "",
      ukpd_tujuan: cleanText(row[6]),
      jabatan_tujuan: cleanText(row[7]),
      mulai_penugasan: range?.mulai || "",
      selesai_penugasan: range?.selesai || ""
    };
  });
}

function normalizeHeader(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function isLikelyPersonName(value) {
  const text = cleanText(value);
  return /[A-Za-z]/.test(text) && !/^\d+$/.test(text);
}

function normalizePersonName(value) {
  return cleanText(value)
    .split(",")[0]
    .toLowerCase()
    .replace(/\b(dr|drg|ns|apt|dra)\.?\s+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerMap(headers = []) {
  return Object.fromEntries(headers.map((header, index) => [normalizeHeader(header), index]).filter(([key]) => key));
}

function mapMonthlyPltRows(rows) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "nama_plt_plh") && row.some((cell) => normalizeHeader(cell) === "mulai") && row.some((cell) => normalizeHeader(cell) === "selesai"));
  if (headerIndex < 0) return [];
  const header = headerMap(rows[headerIndex]);
  const nameIndexes = [6, 2, 3, 4]; // Tampilan Excel menaruh nama di blok G, tetapi file menyimpan sebagian di C/D/E.
  const tmtIndex = 7; // Kolom H: TMT PLT/PLH
  const mulaiIndex = 8; // Kolom I: Mulai
  const selesaiIndex = 9; // Kolom J: Selesai
  const jabatanIndex = header.jabatan;
  const ukpdIndex = header.ukpd;
  const nipIndex = header.nip;
  const golIndex = header.gol;

  return rows.slice(headerIndex + 1).map((row) => {
    const range = parseRangeWithExplicitDates(row[tmtIndex], row[mulaiIndex], row[selesaiIndex]);
    const fallbackFromTmt = parseDateRange(row[tmtIndex]);
    const namaPejabat = cleanText(nameIndexes.map((index) => row[index]).find(isLikelyPersonName));
    return {
      jenis_penugasan: "PLT",
      nip: cleanNip(row[nipIndex]),
      nama_pejabat: namaPejabat,
      jabatan_saat_ini: "",
      ukpd_asal: "",
      pangkat_golongan: cleanText(row[golIndex]),
      ukpd_tujuan: cleanText(row[ukpdIndex], "-"),
      jabatan_tujuan: cleanText(row[jabatanIndex], "-"),
      mulai_penugasan: range?.mulai || "",
      selesai_penugasan: range?.selesai || "",
      has_plt_source: Boolean(namaPejabat || cleanText(row[tmtIndex]) || cleanText(row[mulaiIndex]) || cleanText(row[selesaiIndex])),
      has_plt_name: Boolean(namaPejabat),
      has_plt_dates: Boolean(range?.mulai && range?.selesai),
      has_plt_tmt_dates: Boolean(fallbackFromTmt?.mulai && fallbackFromTmt?.selesai)
    };
  });
}

function mapPlhRows(rows) {
  return rows.slice(1).map((row) => {
    const range = parseDateRange(row[7]);
    return {
      jenis_penugasan: "PLH",
      nip: "",
      nama_pejabat: cleanText(row[4]),
      jabatan_saat_ini: cleanText(row[5]),
      ukpd_asal: cleanText(row[6]),
      pangkat_golongan: "",
      ukpd_tujuan: cleanText(row[3]),
      jabatan_tujuan: cleanText(row[2]),
      mulai_penugasan: range?.mulai || "",
      selesai_penugasan: range?.selesai || ""
    };
  });
}

function validAssignment(item) {
  return item.nama_pejabat
    && item.mulai_penugasan
    && item.selesai_penugasan;
}

function validMonthlyPltAssignment(item) {
  return validAssignment(item)
    && item.ukpd_tujuan
    && item.jabatan_tujuan
    && item.has_plt_source
    && (item.has_plt_name || item.has_plt_tmt_dates);
}

async function findPegawai(pool, item) {
  if (item.nip) {
    const [rows] = await pool.query("SELECT * FROM `pegawai` WHERE REPLACE(REPLACE(TRIM(COALESCE(`nip`, '')), '`', ''), ' ', '') = ? LIMIT 1", [item.nip]);
    if (rows[0]) return rows[0];
  }
  const [rows] = await pool.query("SELECT * FROM `pegawai` WHERE LOWER(TRIM(`nama`)) = LOWER(TRIM(?)) LIMIT 1", [item.nama_pejabat]);
  if (rows[0]) return rows[0];

  const normalized = normalizePersonName(item.nama_pejabat);
  const firstToken = normalized.split(" ")[0];
  if (!firstToken || firstToken.length < 3) return null;

  const [candidates] = await pool.query("SELECT * FROM `pegawai` WHERE LOWER(`nama`) LIKE ? LIMIT 80", [`%${firstToken}%`]);
  return candidates.find((pegawai) => normalizePersonName(pegawai.nama) === normalized) || null;
}

function mergePegawai(item, pegawai) {
  if (!pegawai) return item;
  return {
    ...item,
    id_pegawai: pegawai.id_pegawai,
    nama_pejabat: cleanText(pegawai.nama) || item.nama_pejabat,
    jabatan_saat_ini: cleanText(pegawai.nama_jabatan_menpan || pegawai.nama_jabatan_orb) || item.jabatan_saat_ini,
    ukpd_asal: cleanText(pegawai.nama_ukpd) || item.ukpd_asal,
    pangkat_golongan: cleanText(pegawai.pangkat_golongan) || item.pangkat_golongan
  };
}

async function upsertAssignment(pool, item) {
  const columns = [
    "jenis_penugasan",
    "id_pegawai",
    "nama_pejabat",
    "jabatan_saat_ini",
    "ukpd_asal",
    "pangkat_golongan",
    "ukpd_tujuan",
    "jabatan_tujuan",
    "mulai_penugasan",
    "selesai_penugasan",
    "created_by",
    "created_by_role",
    "created_by_ukpd"
  ];
  const data = {
    ...item,
    id_pegawai: item.id_pegawai || null,
    created_by: IMPORT_SOURCE,
    created_by_role: "SYSTEM",
    created_by_ukpd: ""
  };
  const [existing] = await pool.query(
    `SELECT \`id\`
     FROM \`pejabat_plt_plh\`
     WHERE \`jenis_penugasan\` = ?
       AND \`nama_pejabat\` = ?
       AND \`ukpd_tujuan\` = ?
       AND \`jabatan_tujuan\` = ?
       AND \`mulai_penugasan\` = ?
       AND \`selesai_penugasan\` = ?
     LIMIT 1`,
    [data.jenis_penugasan, data.nama_pejabat, data.ukpd_tujuan, data.jabatan_tujuan, data.mulai_penugasan, data.selesai_penugasan]
  );

  if (existing[0]) {
    const updateColumns = columns.filter((column) => !["created_by", "created_by_role", "created_by_ukpd"].includes(column));
    await pool.query(
      `UPDATE \`pejabat_plt_plh\`
       SET ${updateColumns.map((column) => `\`${column}\` = ?`).join(", ")}, \`updated_at\` = NOW()
       WHERE \`id\` = ?`,
      [...updateColumns.map((column) => data[column] === undefined ? "" : data[column]), existing[0].id]
    );
    return "updated";
  }

  await pool.query(
    `INSERT INTO \`pejabat_plt_plh\` (${columns.map((column) => `\`${column}\``).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((column) => data[column] === undefined ? "" : data[column])
  );
  return "inserted";
}

async function main() {
  if (!fs.existsSync(inputPath)) throw new Error(`File tidak ditemukan: ${inputPath}`);
  const sheets = await readWorkbookSheets(inputPath);
  const mappedMonthlyPltRows = mapMonthlyPltRows(sheets.get(pltSheetName) || []);
  const monthlyPltRows = mappedMonthlyPltRows.filter(validMonthlyPltAssignment);
  if (!monthlyPltRows.length) {
    throw new Error(`Sheet ${pltSheetName} belum berisi data PLT/PLH tanggal yang bisa dibaca. Simpan file Excel terlebih dahulu lalu jalankan ulang import.`);
  }
  const assignments = monthlyPltRows.map(({ has_plt_source, has_plt_name, has_plt_dates, has_plt_tmt_dates, ...item }) => item);
  const valid = assignments.filter(validAssignment);
  const skipped = assignments.length - valid.length;
  const pool = await getConnectedPool();
  await ensurePejabatPltPlhSchema(pool);

  const summary = { inserted: 0, updated: 0, skipped };
  await pool.query("DELETE FROM `pejabat_plt_plh` WHERE `jenis_penugasan` = 'PLT' AND `created_by` IN ('excel-monitoring', 'excel-monthly')");
  for (const assignment of valid) {
    const merged = mergePegawai(assignment, await findPegawai(pool, assignment));
    const result = await upsertAssignment(pool, merged);
    summary[result] += 1;
  }

  console.log(`Import PLT/PLH selesai dari ${path.basename(inputPath)}`);
  console.log(`Inserted: ${summary.inserted}`);
  console.log(`Updated: ${summary.updated}`);
  console.log(`Skipped: ${summary.skipped}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
