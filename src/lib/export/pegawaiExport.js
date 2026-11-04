import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";

function addWhere(parts, params, clause, values = []) {
  parts.push(clause);
  params.push(...values);
}

function idInClause(ids = []) {
  return ids.map(() => "?").join(", ");
}

function toDateString(value) {
  if (!value || typeof value !== "object" || !("toISOString" in value)) return value;
  return value.toISOString().slice(0, 10);
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toDateString(value)]));
}

function cleanNip(value) {
  return String(value || "").trim().replace(/^`+/, "");
}

function normalizePegawaiRow(row) {
  const normalized = normalizeRow(row);
  return {
    ...normalized,
    nip: cleanNip(normalized.nip)
  };
}

async function hasTable(pool, table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(rows[0]?.total || 0) > 0;
}

function firstAvailableChildSlot(target, requestedSlot) {
  const used = new Set([1, 2, 3].filter((slot) => target[`anak_${slot}_nama`] || target[`anak_${slot}_tempat_lahir`]));
  if (requestedSlot >= 1 && requestedSlot <= 3 && !used.has(requestedSlot)) return requestedSlot;
  return [1, 2, 3].find((slot) => !used.has(slot)) || null;
}

async function attachAlamat(pool, rows, ids) {
  if (!(await hasTable(pool, "alamat"))) return;

  const [alamatRows] = await pool.query(
    `SELECT *
     FROM \`alamat\`
     WHERE \`id_pegawai\` IN (${idInClause(ids)})
     ORDER BY \`id_pegawai\` ASC,
       CASE
         WHEN LOWER(\`tipe\`) = 'domisili' THEN 0
         WHEN LOWER(\`tipe\`) = 'ktp' THEN 1
         ELSE 2
       END,
       \`id\` ASC`,
    ids
  );

  const byId = new Map(rows.map((row) => [Number(row.id_pegawai), row]));
  const seen = new Set();
  for (const sourceRow of alamatRows.map(normalizeRow)) {
    const id = Number(sourceRow.id_pegawai);
    const target = byId.get(id);
    const tipe = String(sourceRow.tipe || "").toLowerCase();
    if (!target || !["domisili", "ktp"].includes(tipe)) continue;
    const key = `${id}:${tipe}`;
    if (seen.has(key)) continue;
    seen.add(key);

    target[`${tipe}_jalan`] = sourceRow.jalan || "";
    target[`${tipe}_kelurahan`] = sourceRow.kelurahan || "";
    target[`${tipe}_kecamatan`] = sourceRow.kecamatan || "";
    target[`${tipe}_kota_kabupaten`] = sourceRow.kota_kabupaten || "";
    target[`${tipe}_provinsi`] = sourceRow.provinsi || "";
    target[`${tipe}_kode_provinsi`] = sourceRow.kode_provinsi || "";
    target[`${tipe}_kode_kota_kab`] = sourceRow.kode_kota_kab || "";
    target[`${tipe}_kode_kecamatan`] = sourceRow.kode_kecamatan || "";
    target[`${tipe}_kode_kelurahan`] = sourceRow.kode_kelurahan || "";
  }
}

function attachPasanganRow(target, row) {
  if (target.pasangan_nama || target.pasangan_no_tlp || target.pasangan_email || target.pasangan_pekerjaan) return;
  target.pasangan_nama = row.nama || "";
  target.pasangan_no_tlp = row.no_tlp || "";
  target.pasangan_email = row.email || "";
  target.pasangan_pekerjaan = row.pekerjaan || "";
  target.pasangan_status_tunjangan = row.status_tunjangan || "";
}

function attachAnakRow(target, row) {
  const requestedSlot = Number(row.urutan || 0);
  const slot = firstAvailableChildSlot(target, requestedSlot);
  if (!slot) return;
  target[`anak_${slot}_nama`] = row.nama || "";
  target[`anak_${slot}_jenis_kelamin`] = row.jenis_kelamin || "";
  target[`anak_${slot}_tempat_lahir`] = row.tempat_lahir || "";
  target[`anak_${slot}_tanggal_lahir`] = row.tanggal_lahir || "";
  target[`anak_${slot}_pekerjaan`] = row.pekerjaan || "";
  target[`anak_${slot}_status_tunjangan`] = row.status_tunjangan || "";
}

async function attachKeluarga(pool, rows, ids) {
  const byId = new Map(rows.map((row) => [Number(row.id_pegawai), row]));

  if (await hasTable(pool, "keluarga")) {
    const [keluargaRows] = await pool.query(
      `SELECT *
       FROM \`keluarga\`
       WHERE \`id_pegawai\` IN (${idInClause(ids)}) AND \`hubungan\` IN ('pasangan', 'anak')
       ORDER BY \`id_pegawai\` ASC,
         CASE WHEN \`hubungan\` = 'pasangan' THEN 0 ELSE 1 END,
         CASE WHEN \`sumber_tabel\` = 'drh_pdf_keluarga' THEN 0 ELSE 1 END,
         COALESCE(\`urutan\`, 99) ASC,
         \`id\` ASC`,
      ids
    );

    for (const sourceRow of keluargaRows.map(normalizeRow)) {
      const target = byId.get(Number(sourceRow.id_pegawai));
      if (!target) continue;
      if (sourceRow.hubungan === "pasangan") attachPasanganRow(target, sourceRow);
      if (sourceRow.hubungan === "anak") attachAnakRow(target, sourceRow);
    }
    return;
  }

  if (await hasTable(pool, "pasangan")) {
    const [pasanganRows] = await pool.query(
      `SELECT *
       FROM \`pasangan\`
       WHERE \`id_pegawai\` IN (${idInClause(ids)})
       ORDER BY \`id_pegawai\` ASC, \`id\` ASC`,
      ids
    );
    for (const sourceRow of pasanganRows.map(normalizeRow)) {
      const target = byId.get(Number(sourceRow.id_pegawai));
      if (target) attachPasanganRow(target, sourceRow);
    }
  }

  if (await hasTable(pool, "anak")) {
    const [anakRows] = await pool.query(
      `SELECT *
       FROM \`anak\`
       WHERE \`id_pegawai\` IN (${idInClause(ids)})
       ORDER BY \`id_pegawai\` ASC, COALESCE(\`urutan\`, 99) ASC, \`id\` ASC`,
      ids
    );
    for (const sourceRow of anakRows.map(normalizeRow)) {
      const target = byId.get(Number(sourceRow.id_pegawai));
      if (target) attachAnakRow(target, sourceRow);
    }
  }
}

async function attachPendidikanTerakhir(pool, rows, ids) {
  if (!(await hasTable(pool, "riwayat_pendidikan"))) return;

  const [pendidikanRows] = await pool.query(
    `SELECT *
     FROM (
       SELECT rp.*,
         ROW_NUMBER() OVER (
           PARTITION BY rp.\`id_pegawai\`
           ORDER BY
             CASE
               WHEN LOWER(REPLACE(COALESCE(rp.\`jenis_riwayat\`, ''), '-', '_')) IN ('formal', 'pendidikan_terakhir') THEN 0
               ELSE 1
             END,
             COALESCE(rp.\`tanggal_ijazah\`, rp.\`tahun_lulus\`, '') DESC,
             rp.\`id\` DESC
         ) AS row_number
       FROM \`riwayat_pendidikan\` rp
       WHERE rp.\`id_pegawai\` IN (${idInClause(ids)})
     ) ranked
     WHERE ranked.row_number = 1`,
    ids
  );

  const byId = new Map(rows.map((row) => [Number(row.id_pegawai), row]));
  for (const sourceRow of pendidikanRows.map(normalizeRow)) {
    const target = byId.get(Number(sourceRow.id_pegawai));
    if (!target) continue;
    target.riwayat_pendidikan_tahun_lulus = sourceRow.tahun_lulus || "";
    target.riwayat_pendidikan_nomor_ijazah = sourceRow.nomor_ijazah || "";
    target.riwayat_pendidikan_tanggal_ijazah = sourceRow.tanggal_ijazah || "";
  }
}

function buildPegawaiExportWhere({ user, q, status, wilayah, jenisUkpd, ukpd, jabatan, rumpun }) {
  const where = [];
  const params = [];
  const canFilterWilayah = user.role === ROLES.SUPER_ADMIN;
  const canFilterUkpd = user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN_WILAYAH;

  if (user.role === ROLES.ADMIN_UKPD) {
    addWhere(where, params, "p.`nama_ukpd` = ?", [user.nama_ukpd]);
  } else if (user.role === ROLES.ADMIN_WILAYAH) {
    addWhere(where, params, "COALESCE(NULLIF(p.`wilayah`, ''), u.`wilayah`) = ?", [user.wilayah]);
  } else if (user.role !== ROLES.SUPER_ADMIN) {
    addWhere(where, params, "1 = 0");
  }

  if (q) {
    const keyword = `%${q}%`;
    addWhere(
      where,
      params,
      "(p.`nama` LIKE ? OR p.`nrk` LIKE ? OR p.`nip` LIKE ? OR p.`nama_jabatan_menpan` LIKE ? OR p.`nama_jabatan_orb` LIKE ? OR p.`nama_ukpd` LIKE ?)",
      [keyword, keyword, keyword, keyword, keyword, keyword]
    );
  }
  if (status) addWhere(where, params, "UPPER(TRIM(p.`jenis_pegawai`)) = UPPER(TRIM(?))", [status]);
  if (canFilterWilayah && wilayah) addWhere(where, params, "COALESCE(NULLIF(p.`wilayah`, ''), u.`wilayah`) = ?", [wilayah]);
  if (jenisUkpd) addWhere(where, params, "COALESCE(NULLIF(p.`jenis_ukpd`, ''), u.`jenis_ukpd`) = ?", [jenisUkpd]);
  if (canFilterUkpd && ukpd) addWhere(where, params, "p.`nama_ukpd` = ?", [ukpd]);
  if (jabatan) addWhere(where, params, "COALESCE(NULLIF(p.`nama_jabatan_menpan`, ''), p.`nama_jabatan_orb`) = ?", [jabatan]);
  if (rumpun) addWhere(where, params, "p.`status_rumpun` = ?", [rumpun]);

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
}

export async function getPegawaiExportData({ user, q = "", status = "", wilayah = "", jenisUkpd = "", ukpd = "", jabatan = "", rumpun = "" }) {
  const pool = await getConnectedPool();
  const { whereSql, params } = buildPegawaiExportWhere({ user, q, status, wilayah, jenisUkpd, ukpd, jabatan, rumpun });
  const [pegawaiRows] = await pool.query(
    `SELECT p.*,
       COALESCE(NULLIF(p.\`wilayah\`, ''), u.\`wilayah\`, '-') AS \`wilayah\`,
       COALESCE(NULLIF(p.\`jenis_ukpd\`, ''), u.\`jenis_ukpd\`, '') AS \`jenis_ukpd\`
     FROM \`pegawai\` p
     LEFT JOIN \`ukpd\` u ON u.\`nama_ukpd\` = p.\`nama_ukpd\`
     ${whereSql}
     ORDER BY p.\`nama_ukpd\` ASC, p.\`nama\` ASC, p.\`id_pegawai\` ASC`,
    params
  );

  const rows = pegawaiRows.map(normalizePegawaiRow);
  const ids = rows.map((row) => Number(row.id_pegawai)).filter(Boolean);
  if (!ids.length) return rows;

  await Promise.all([
    attachAlamat(pool, rows, ids),
    attachKeluarga(pool, rows, ids),
    attachPendidikanTerakhir(pool, rows, ids)
  ]);

  return rows;
}
