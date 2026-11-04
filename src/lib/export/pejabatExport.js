import { getConnectedPool } from "@/lib/db/postgres";
import { buildWorkbookBuffer } from "@/lib/import/pegawaiExcel";

const RUMPUN_EXPR = "LOWER(COALESCE(p.`status_rumpun`, ''))";
const JABATAN_EXPR = "LOWER(COALESCE(NULLIF(p.`nama_jabatan_menpan`, ''), p.`nama_jabatan_orb`, ''))";
const WILAYAH_EXPR = "COALESCE(NULLIF(p.`wilayah`, ''), u.`wilayah`)";
const JENIS_UKPD_EXPR = "COALESCE(NULLIF(p.`jenis_ukpd`, ''), u.`jenis_ukpd`)";
const JOIN_UKPD_SQL = "LEFT JOIN `ukpd` u ON u.`nama_ukpd` = p.`nama_ukpd`";
const PEJABAT_WHERE_SQL = [
  `${RUMPUN_EXPR} LIKE '%tinggi pratama%'`,
  `${RUMPUN_EXPR} LIKE '%administrator%'`,
  `${RUMPUN_EXPR} LIKE '%pengawas%'`,
  `${JABATAN_EXPR} LIKE '%kepala puskesmas%'`
].join(" OR ");

const PEJABAT_SELECT_SQL = `
  p.\`id_pegawai\`,
  p.\`nama\`,
  p.\`nama_ukpd\`,
  ${WILAYAH_EXPR} AS \`wilayah\`,
  ${JENIS_UKPD_EXPR} AS \`jenis_ukpd\`,
  p.\`nama_jabatan_menpan\`,
  p.\`nama_jabatan_orb\`,
  p.\`status_rumpun\`,
  p.\`jenjang_pendidikan\` AS \`pendidikan\`,
  p.\`pangkat_golongan\`,
  p.\`no_hp_pegawai\`
`;

const PEJABAT_EXPORT_COLUMNS = [
  { header: "No", value: (_row, index) => index + 1 },
  { header: "Nama Pegawai", key: "nama" },
  { header: "Wilayah", key: "wilayah" },
  { header: "Jenis UKPD", key: "jenis_ukpd" },
  { header: "Nama UKPD", key: "nama_ukpd" },
  { header: "Jabatan Pergub 1 Tahun 2017", key: "nama_jabatan_orb" },
  { header: "Jabatan Kepmenpan 11", key: "nama_jabatan_menpan" },
  { header: "Status Rumpun", key: "status_rumpun" },
  { header: "Pendidikan", key: "pendidikan" },
  { header: "Pangkat/Golongan", key: "pangkat_golongan" },
  { header: "No HP", key: "no_hp_pegawai" }
];

function addWhere(parts, params, clause, values = []) {
  parts.push(clause);
  params.push(...values);
}

function cleanText(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanPhone(value) {
  return String(value || "").trim();
}

function mapPejabatRow(row) {
  return {
    id_pegawai: row.id_pegawai,
    nama: cleanText(row.nama),
    nama_ukpd: cleanText(row.nama_ukpd),
    wilayah: cleanText(row.wilayah),
    jenis_ukpd: cleanText(row.jenis_ukpd),
    nama_jabatan_orb: cleanText(row.nama_jabatan_orb),
    nama_jabatan_menpan: cleanText(row.nama_jabatan_menpan),
    status_rumpun: cleanText(row.status_rumpun),
    pendidikan: cleanText(row.pendidikan),
    pangkat_golongan: cleanText(row.pangkat_golongan),
    no_hp_pegawai: cleanPhone(row.no_hp_pegawai)
  };
}

function buildWhere({ wilayah = "", jenisUkpd = "", ukpd = "", rumpun = "" } = {}) {
  const where = [`(${PEJABAT_WHERE_SQL})`];
  const params = [];

  if (wilayah) addWhere(where, params, `${WILAYAH_EXPR} = ?`, [wilayah]);
  if (jenisUkpd) addWhere(where, params, `${JENIS_UKPD_EXPR} = ?`, [jenisUkpd]);
  if (ukpd) addWhere(where, params, "p.`nama_ukpd` = ?", [ukpd]);
  if (rumpun) addWhere(where, params, "p.`status_rumpun` = ?", [rumpun]);

  return {
    whereSql: `WHERE ${where.join(" AND ")}`,
    params
  };
}

async function getFilterOptions(pool) {
  const optionWhere = `WHERE (${PEJABAT_WHERE_SQL})`;
  const [wilayahRows] = await pool.query(
    `SELECT DISTINCT ${WILAYAH_EXPR} AS \`wilayah\`
     FROM \`pegawai\` p
     ${JOIN_UKPD_SQL}
     ${optionWhere}
       AND ${WILAYAH_EXPR} IS NOT NULL
       AND ${WILAYAH_EXPR} <> ''
     ORDER BY \`wilayah\` ASC`
  );
  const [jenisUkpdRows] = await pool.query(
    `SELECT DISTINCT ${JENIS_UKPD_EXPR} AS \`jenis_ukpd\`
     FROM \`pegawai\` p
     ${JOIN_UKPD_SQL}
     ${optionWhere}
       AND ${JENIS_UKPD_EXPR} IS NOT NULL
       AND ${JENIS_UKPD_EXPR} <> ''
     ORDER BY \`jenis_ukpd\` ASC`
  );
  const [ukpdRows] = await pool.query(
    `SELECT DISTINCT p.\`nama_ukpd\`
     FROM \`pegawai\` p
     ${JOIN_UKPD_SQL}
     ${optionWhere}
       AND p.\`nama_ukpd\` IS NOT NULL
       AND p.\`nama_ukpd\` <> ''
     ORDER BY p.\`nama_ukpd\` ASC`
  );
  const [rumpunRows] = await pool.query(
    `SELECT DISTINCT p.\`status_rumpun\` AS \`rumpun\`
     FROM \`pegawai\` p
     ${JOIN_UKPD_SQL}
     ${optionWhere}
       AND p.\`status_rumpun\` IS NOT NULL
       AND p.\`status_rumpun\` <> ''
     ORDER BY \`rumpun\` ASC`
  );

  return {
    wilayahOptions: wilayahRows.map((row) => row.wilayah).filter(Boolean),
    jenisUkpdOptions: jenisUkpdRows.map((row) => row.jenis_ukpd).filter(Boolean),
    ukpdOptions: ukpdRows.map((row) => row.nama_ukpd).filter(Boolean),
    rumpunOptions: rumpunRows.map((row) => row.rumpun).filter(Boolean)
  };
}

export async function getPejabatData({ wilayah = "", jenisUkpd = "", ukpd = "", rumpun = "", page = 1, pageSize = 10, exportAll = false } = {}) {
  const pool = await getConnectedPool();
  const { whereSql, params } = buildWhere({ wilayah, jenisUkpd, ukpd, rumpun });
  const offset = (page - 1) * pageSize;
  const countRows = exportAll
    ? []
    : (await pool.query(
      `SELECT COUNT(*) AS total
       FROM \`pegawai\` p
       ${JOIN_UKPD_SQL}
       ${whereSql}`,
      params
    ))[0];

  const [rows] = await pool.query(
    `SELECT ${PEJABAT_SELECT_SQL}
     FROM \`pegawai\` p
     ${JOIN_UKPD_SQL}
     ${whereSql}
     ORDER BY
       CASE
         WHEN ${RUMPUN_EXPR} LIKE '%tinggi pratama%' THEN 1
         WHEN ${RUMPUN_EXPR} LIKE '%administrator%' OR ${JABATAN_EXPR} LIKE '%kepala puskesmas%' THEN 2
         WHEN ${RUMPUN_EXPR} LIKE '%pengawas%' THEN 3
         ELSE 4
       END,
       p.\`nama_ukpd\` ASC,
       p.\`nama\` ASC
     ${exportAll ? "" : "LIMIT ? OFFSET ?"}`,
    exportAll ? params : [...params, pageSize, offset]
  );

  const mappedRows = rows.map(mapPejabatRow);
  return {
    rows: mappedRows,
    total: exportAll ? mappedRows.length : Number(countRows[0]?.total || 0),
    page,
    pageSize,
    filters: exportAll ? {} : await getFilterOptions(pool)
  };
}

function exportCellValue(row, column, index) {
  if (typeof column.value === "function") return column.value(row, index);
  return row?.[column.key] ?? "";
}

export function buildPejabatExportRows(rows = []) {
  return [
    PEJABAT_EXPORT_COLUMNS.map((column) => column.header),
    ...rows.map((row, index) => PEJABAT_EXPORT_COLUMNS.map((column) => exportCellValue(row, column, index)))
  ];
}

export async function buildPejabatExportWorkbook({ rows = [] } = {}) {
  return buildWorkbookBuffer([
    { name: "Data Pejabat", rows: buildPejabatExportRows(rows) }
  ]);
}
