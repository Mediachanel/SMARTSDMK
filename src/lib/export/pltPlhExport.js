import { ensurePejabatPltPlhSchema } from "@/lib/db/ensurePejabatPltPlhSchema";
import { getConnectedPool } from "@/lib/db/postgres";
import { buildWorkbookBuffer } from "@/lib/import/pegawaiExcel";

const EXPORT_COLUMNS = [
  { header: "No", value: (_row, index) => index + 1 },
  { header: "Jenis", key: "jenis_penugasan" },
  { header: "Nama", key: "nama_pejabat" },
  { header: "NRK", key: "nrk" },
  { header: "NIP", key: "nip" },
  { header: "Gol", key: "pangkat_golongan" },
  { header: "Jabatan Saat Ini", key: "jabatan_saat_ini" },
  { header: "UKPD Saat Ini", key: "ukpd_asal" },
  { header: "UKPD PLT/PLH", key: "ukpd_tujuan" },
  { header: "Jabatan PLT/PLH", key: "jabatan_tujuan" },
  { header: "Mulai", key: "mulai_penugasan" },
  { header: "Berakhir", key: "selesai_penugasan" }
];

function cleanText(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanNip(value) {
  return String(value || "").trim().replace(/^`+/, "");
}

function cleanNrk(value) {
  return String(value || "").trim().replace(/\D/g, "");
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value || "").slice(0, 10);
}

function normalizeFilterDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? "" : text;
}

function mapRow(row) {
  return {
    jenis_penugasan: cleanText(row.jenis_penugasan, "PLT"),
    nrk: cleanNrk(row.nrk),
    nip: cleanNip(row.nip),
    nama_pejabat: cleanText(row.nama_pejabat),
    jabatan_saat_ini: cleanText(row.jabatan_saat_ini),
    ukpd_asal: cleanText(row.ukpd_asal),
    pangkat_golongan: cleanText(row.pangkat_golongan),
    ukpd_tujuan: cleanText(row.ukpd_tujuan),
    jabatan_tujuan: cleanText(row.jabatan_tujuan),
    mulai_penugasan: normalizeDate(row.mulai_penugasan),
    selesai_penugasan: normalizeDate(row.selesai_penugasan)
  };
}

function addOptionalFilter(where, params, value, clause, values) {
  if (!value) return;
  where.push(clause);
  params.push(...values);
}

export async function getPltPlhExportData({
  jenis = "",
  wilayah = "",
  jenisUkpd = "",
  ukpd = "",
  rumpun = "",
  periodeMulai = "",
  periodeAkhir = "",
  q = ""
} = {}) {
  const pool = await getConnectedPool();
  await ensurePejabatPltPlhSchema(pool);

  const normalizedJenis = String(jenis || "").trim().toUpperCase();
  const start = normalizeFilterDate(periodeMulai);
  const end = normalizeFilterDate(periodeAkhir);
  const rawRangeStart = start || end;
  const rawRangeEnd = end || start;
  const rangeStart = rawRangeStart && rawRangeEnd && rawRangeStart > rawRangeEnd ? rawRangeEnd : rawRangeStart;
  const rangeEnd = rawRangeStart && rawRangeEnd && rawRangeStart > rawRangeEnd ? rawRangeStart : rawRangeEnd;
  const where = [];
  const params = [];

  if (normalizedJenis === "PLT" || normalizedJenis === "PLH") {
    where.push("r.`jenis_penugasan` = ?");
    params.push(normalizedJenis);
  }

  if (rangeStart && rangeEnd) {
    where.push("r.`mulai_penugasan` <= ?");
    where.push("r.`selesai_penugasan` >= ?");
    params.push(rangeEnd, rangeStart);
  } else {
    where.push("r.`mulai_penugasan` <= CURRENT_DATE");
    where.push("r.`selesai_penugasan` >= CURRENT_DATE");
  }

  addOptionalFilter(where, params, q, "(r.`nama_pejabat` LIKE ? OR r.`jabatan_tujuan` LIKE ? OR r.`ukpd_tujuan` LIKE ?)", [`%${q}%`, `%${q}%`, `%${q}%`]);
  addOptionalFilter(where, params, wilayah, "(ut.`wilayah` = ? OR ua.`wilayah` = ? OR p.`wilayah` = ?)", [wilayah, wilayah, wilayah]);
  addOptionalFilter(where, params, jenisUkpd, "(ut.`jenis_ukpd` = ? OR ua.`jenis_ukpd` = ? OR p.`jenis_ukpd` = ?)", [jenisUkpd, jenisUkpd, jenisUkpd]);
  addOptionalFilter(where, params, ukpd, "(r.`ukpd_tujuan` = ? OR r.`ukpd_asal` = ? OR p.`nama_ukpd` = ?)", [ukpd, ukpd, ukpd]);
  addOptionalFilter(where, params, rumpun, "p.`status_rumpun` = ?", [rumpun]);

  const [rows] = await pool.query(
    `SELECT
       r.*,
       p.\`nrk\`,
       p.\`nip\`,
       COALESCE(NULLIF(r.\`pangkat_golongan\`, ''), p.\`pangkat_golongan\`, '') AS \`pangkat_golongan\`
     FROM \`pejabat_plt_plh\` r
     LEFT JOIN \`pegawai\` p ON p.\`id_pegawai\` = r.\`id_pegawai\`
     LEFT JOIN \`ukpd\` ut ON ut.\`nama_ukpd\` = r.\`ukpd_tujuan\`
     LEFT JOIN \`ukpd\` ua ON ua.\`nama_ukpd\` = COALESCE(NULLIF(r.\`ukpd_asal\`, ''), p.\`nama_ukpd\`)
     WHERE ${where.join(" AND ")}
     ORDER BY r.\`selesai_penugasan\` ASC, r.\`nama_pejabat\` ASC, r.\`id\` DESC`,
    params
  );

  return { rows: rows.map(mapRow) };
}

function exportCellValue(row, column, index) {
  if (typeof column.value === "function") return column.value(row, index);
  return row?.[column.key] ?? "";
}

export function buildPltPlhExportRows(rows = []) {
  return [
    EXPORT_COLUMNS.map((column) => column.header),
    ...rows.map((row, index) => EXPORT_COLUMNS.map((column) => exportCellValue(row, column, index)))
  ];
}

export async function buildPltPlhExportWorkbook({ rows = [], jenis = "PLT/PLH" } = {}) {
  const sheetName = jenis === "PLT" || jenis === "PLH" ? jenis : "PLT PLH";
  return buildWorkbookBuffer([
    { name: sheetName, rows: buildPltPlhExportRows(rows) }
  ]);
}
