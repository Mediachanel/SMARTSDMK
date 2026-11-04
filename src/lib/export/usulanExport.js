import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureUsulanSchema } from "@/lib/db/ensureUsulanSchema";
import { buildWorkbookBuffer } from "@/lib/import/pegawaiExcel";

const CONFIG = {
  mutasi: {
    table: "usulan_mutasi",
    alias: "m",
    sheetName: "Usulan Mutasi",
    columns: [
      ["No", (_row, index) => index + 1],
      ["Nama Pegawai", "nama_pegawai"],
      ["NRK", "nrk"],
      ["NIP", "nip"],
      ["UKPD Asal", "nama_ukpd"],
      ["UKPD Tujuan", "ukpd_tujuan"],
      ["Jabatan Lama", "jabatan"],
      ["Jabatan Baru", "jabatan_baru"],
      ["Jenis Mutasi", "jenis_mutasi"],
      ["Status", "status"],
      ["Tahap", (row) => flowLabel(row.status)],
      ["Tanggal Usulan", (row) => normalizeDate(row.tanggal_usulan || row.created_at)],
      ["Alasan", "alasan"],
      ["Keterangan", "keterangan"]
    ]
  },
  "putus-jf": {
    table: "usulan_pjf_stop",
    alias: "s",
    sheetName: "Usulan Putus JF",
    columns: [
      ["No", (_row, index) => index + 1],
      ["Nama Pegawai", "nama_pegawai"],
      ["NRK", "nrk"],
      ["NIP", "nip"],
      ["UKPD", "nama_ukpd"],
      ["Jabatan Lama", "jabatan"],
      ["Jabatan Baru", "jabatan_baru"],
      ["Angka Kredit", "angka_kredit"],
      ["Nomor Surat", "nomor_surat"],
      ["Tanggal Surat", (row) => normalizeDate(row.tanggal_surat)],
      ["Asal Surat", "asal_surat"],
      ["Status", "status"],
      ["Tahap", (row) => flowLabel(row.status)],
      ["Tanggal Usulan", (row) => normalizeDate(row.tanggal_usulan || row.created_at)],
      ["Alasan Pemutusan", "alasan_pemutusan"],
      ["Keterangan", "keterangan"]
    ]
  }
};

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return normalizeText(value).slice(0, 10);
}

function flowStep(statusValue) {
  const status = normalizeText(statusValue).toLowerCase();
  if (status === "verifikasi sudin" || status === "dikembalikan" || status === "ditolak") return 2;
  if (status === "diterima dinas" || status === "diproses") return 3;
  if (status === "verifikasi dinas") return 4;
  if (status === "selesai") return 5;
  return 1;
}

function flowLabel(status) {
  const labels = ["UKPD Mengusulkan", "Sudin Verifikasi", "Diterima Dinas", "Dinas Verifikasi", "Selesai"];
  const step = flowStep(status);
  return `${step}. ${labels[step - 1]}`;
}

function buildScopeClause(alias, user) {
  if (user.role === ROLES.SUPER_ADMIN) return { where: "", params: [] };
  if (user.role === ROLES.ADMIN_UKPD) {
    return {
      where: `WHERE (${alias}.\`nama_ukpd\` = ? OR ${alias}.\`created_by_ukpd\` = ?)`,
      params: [user.nama_ukpd, user.nama_ukpd]
    };
  }
  if (user.role === ROLES.ADMIN_WILAYAH) {
    return {
      where: `WHERE (
        EXISTS (
          SELECT 1 FROM \`pegawai\` p
          WHERE CAST(p.\`nip\` AS TEXT) = CAST(${alias}.\`nip\` AS TEXT)
            AND p.\`wilayah\` = ?
        )
        OR EXISTS (
          SELECT 1 FROM \`ukpd\` u
          WHERE CAST(u.\`nama_ukpd\` AS TEXT) = CAST(${alias}.\`nama_ukpd\` AS TEXT)
            AND u.\`wilayah\` = ?
        )
      )`,
      params: [user.wilayah, user.wilayah]
    };
  }
  return { where: "WHERE 1 = 0", params: [] };
}

export async function getUsulanExportData({ type, user, status = "", stage = "" }) {
  const config = CONFIG[type];
  if (!config) return [];

  const pool = await getConnectedPool();
  await ensureUsulanSchema(pool);
  const scope = buildScopeClause(config.alias, user);
  const [rows] = await pool.query(
    `SELECT ${config.alias}.*
     FROM \`${config.table}\` ${config.alias}
     ${scope.where}
     ORDER BY COALESCE(${config.alias}.\`tanggal_usulan\`, ${config.alias}.\`created_at\`) DESC,
              ${config.alias}.\`id\` DESC`,
    scope.params
  );

  const requestedStatus = normalizeText(status);
  const requestedStage = Number.parseInt(stage, 10);
  return rows.filter((row) => {
    if (requestedStatus && normalizeText(row.status) !== requestedStatus) return false;
    if (Number.isInteger(requestedStage) && requestedStage > 0 && flowStep(row.status) !== requestedStage) return false;
    return true;
  });
}

export async function buildUsulanExportWorkbook({ type, rows }) {
  const config = CONFIG[type];
  if (!config) throw new Error("Jenis export usulan tidak valid.");
  const dataRows = [
    config.columns.map(([header]) => header),
    ...rows.map((row, index) => config.columns.map(([, accessor]) => (
      typeof accessor === "function" ? accessor(row, index) : row?.[accessor] ?? ""
    )))
  ];
  return buildWorkbookBuffer([{ name: config.sheetName, rows: dataRows }]);
}
