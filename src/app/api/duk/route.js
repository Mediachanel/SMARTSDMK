import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureDrhSchema } from "@/lib/db/ensureDrhSchema";
import { ok } from "@/lib/helpers/response";

function mapFirstRowByPegawai(rows) {
  const result = new Map();
  for (const row of rows) {
    const idPegawai = Number(row.id_pegawai);
    if (!result.has(idPegawai)) {
      result.set(idPegawai, row);
    }
  }
  return result;
}

function mapRowsByPegawai(rows) {
  const result = new Map();
  for (const row of rows) {
    const idPegawai = Number(row.id_pegawai);
    if (!result.has(idPegawai)) result.set(idPegawai, []);
    result.get(idPegawai).push(row);
  }
  return result;
}

function educationType(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["formal", "pendidikan_terakhir"].includes(normalized)) return "formal";
  if (normalized.includes("non_formal") || normalized.includes("diklat") || normalized.includes("pelatihan")) return "pelatihan";
  return "lainnya";
}

function educationSummary(row) {
  return {
    jenjang_pendidikan: row.jenjang_pendidikan || null,
    program_studi: row.program_studi || null,
    institusi: row.nama_universitas || row.nama_institusi || null,
    tahun_lulus: row.tahun_lulus || null,
    tanggal_ijazah: row.tanggal_ijazah || null,
    nomor_ijazah: row.nomor_ijazah || null
  };
}

function pangkatSummary(row) {
  return {
    pangkat_golongan: row.pangkat_golongan || null,
    tmt_pangkat: row.tmt_pangkat || null,
    lokasi: row.lokasi || null,
    nomor_sk: row.nomor_sk || null,
    tanggal_sk: row.tanggal_sk || null,
    keterangan: row.keterangan || null
  };
}

function jabatanSummary(row) {
  return {
    jenis_jabatan: row.jenis_jabatan || null,
    lokasi: row.lokasi || null,
    nama_jabatan_orb: row.nama_jabatan_orb || null,
    nama_jabatan_menpan: row.nama_jabatan_menpan || null,
    nama_ukpd: row.nama_ukpd || null,
    status_rumpun: row.status_rumpun || null,
    pangkat_golongan: row.pangkat_golongan || null,
    eselon: row.eselon || null,
    tmt_jabatan: row.tmt_jabatan || null,
    nomor_sk: row.nomor_sk || null,
    tanggal_sk: row.tanggal_sk || null,
    keterangan: row.keterangan || null
  };
}

function cleanNip(value) {
  return String(value || "").trim().replace(/^`+/, "");
}

function buildRoleScope(user) {
  if (user.role === ROLES.SUPER_ADMIN) return { sql: "", params: [] };
  if (user.role === ROLES.ADMIN_UKPD) return { sql: "AND p.`nama_ukpd` = ?", params: [user.nama_ukpd] };
  if (user.role === ROLES.ADMIN_WILAYAH) {
    return {
      sql: "AND COALESCE(NULLIF(p.`wilayah`, ''), u.`wilayah`) = ?",
      params: [user.wilayah]
    };
  }
  return { sql: "AND 1 = 0", params: [] };
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const pool = await getConnectedPool();
  const connection = await pool.getConnection();

  let latestPangkatByPegawai = new Map();
  let latestFormalEducationByPegawai = new Map();
  let latestJabatanByPegawai = new Map();
  let latestTrainingByPegawai = new Map();
  let pangkatRowsByPegawai = new Map();
  let jabatanRowsByPegawai = new Map();
  let educationRowsByPegawai = new Map();
  let pegawaiRows = [];

  try {
    await ensureDrhSchema(connection);

    const roleScope = buildRoleScope(user);
    const [rows] = await connection.query(
      `
        SELECT
          p.\`id_pegawai\`,
          p.\`nama\`,
          p.\`nip\`,
          p.\`nama_ukpd\`,
          COALESCE(NULLIF(p.\`wilayah\`, ''), u.\`wilayah\`) AS \`wilayah\`,
          p.\`jenis_pegawai\`,
          p.\`pangkat_golongan\`,
          p.\`tmt_pangkat_terakhir\`,
          p.\`nama_jabatan_menpan\`,
          p.\`nama_jabatan_orb\`,
          p.\`jenjang_pendidikan\`,
          p.\`program_studi\`,
          p.\`tanggal_lahir\`,
          p.\`tmt_kerja_ukpd\`
        FROM \`pegawai\` p
        LEFT JOIN \`ukpd\` u
          ON u.\`nama_ukpd\` = p.\`nama_ukpd\`
        WHERE p.\`jenis_pegawai\` = 'PNS'
          AND LOWER(BTRIM(COALESCE(p.\`kondisi\`, 'Aktif'))) IN ('aktif', 'tugas belajar')
        ${roleScope.sql}
        ORDER BY p.\`id_pegawai\` DESC
      `,
      roleScope.params
    );
    pegawaiRows = rows;

    const ids = pegawaiRows.map((row) => Number(row.id_pegawai)).filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(", ");
      const [latestPangkatRows] = await connection.query(
        `
          SELECT rp1.*
          FROM \`riwayat_pangkat\` rp1
          INNER JOIN (
            SELECT \`id_pegawai\`, MAX(COALESCE(\`tmt_pangkat\`, \`tanggal_sk\`, '')) AS latest_sort
            FROM \`riwayat_pangkat\`
            WHERE \`id_pegawai\` IN (${placeholders})
            GROUP BY \`id_pegawai\`
          ) latest
            ON latest.\`id_pegawai\` = rp1.\`id_pegawai\`
           AND COALESCE(rp1.\`tmt_pangkat\`, rp1.\`tanggal_sk\`, '') = latest.latest_sort
          WHERE rp1.\`id_pegawai\` IN (${placeholders})
          ORDER BY rp1.\`id_pegawai\` ASC, rp1.\`id\` DESC
        `,
        [...ids, ...ids]
      );
      latestPangkatByPegawai = mapFirstRowByPegawai(latestPangkatRows);

      const [latestJabatanRows] = await connection.query(
        `
          SELECT rj1.*
          FROM \`riwayat_jabatan\` rj1
          INNER JOIN (
            SELECT \`id_pegawai\`, MAX(COALESCE(\`tmt_jabatan\`, \`tanggal_sk\`, '')) AS latest_sort
            FROM \`riwayat_jabatan\`
            WHERE \`id_pegawai\` IN (${placeholders})
            GROUP BY \`id_pegawai\`
          ) latest
            ON latest.\`id_pegawai\` = rj1.\`id_pegawai\`
           AND COALESCE(rj1.\`tmt_jabatan\`, rj1.\`tanggal_sk\`, '') = latest.latest_sort
          WHERE rj1.\`id_pegawai\` IN (${placeholders})
          ORDER BY rj1.\`id_pegawai\` ASC, rj1.\`id\` DESC
        `,
        [...ids, ...ids]
      );
      latestJabatanByPegawai = mapFirstRowByPegawai(latestJabatanRows);

      const [allPangkatRows] = await connection.query(
        `SELECT * FROM \`riwayat_pangkat\`
         WHERE \`id_pegawai\` IN (${placeholders})
         ORDER BY \`id_pegawai\` ASC, COALESCE(\`tmt_pangkat\`, \`tanggal_sk\`, '') DESC, \`id\` DESC`,
        ids
      );
      pangkatRowsByPegawai = mapRowsByPegawai(allPangkatRows);

      const [allJabatanRows] = await connection.query(
        `SELECT * FROM \`riwayat_jabatan\`
         WHERE \`id_pegawai\` IN (${placeholders})
         ORDER BY \`id_pegawai\` ASC, COALESCE(\`tmt_jabatan\`, \`tanggal_sk\`, '') DESC, \`id\` DESC`,
        ids
      );
      jabatanRowsByPegawai = mapRowsByPegawai(allJabatanRows);

      const [latestFormalEducationRows] = await connection.query(
        `
          SELECT rp1.*
          FROM \`riwayat_pendidikan\` rp1
          INNER JOIN (
            SELECT \`id_pegawai\`, MAX(COALESCE(\`tanggal_ijazah\`, \`tahun_lulus\`, '')) AS latest_sort
            FROM \`riwayat_pendidikan\`
            WHERE \`id_pegawai\` IN (${placeholders})
              AND LOWER(REPLACE(COALESCE(\`jenis_riwayat\`, ''), '-', '_')) IN ('formal', 'pendidikan_terakhir')
            GROUP BY \`id_pegawai\`
          ) latest
            ON latest.\`id_pegawai\` = rp1.\`id_pegawai\`
           AND COALESCE(rp1.\`tanggal_ijazah\`, rp1.\`tahun_lulus\`, '') = latest.latest_sort
          WHERE rp1.\`id_pegawai\` IN (${placeholders})
            AND LOWER(REPLACE(COALESCE(rp1.\`jenis_riwayat\`, ''), '-', '_')) IN ('formal', 'pendidikan_terakhir')
          ORDER BY rp1.\`id_pegawai\` ASC, rp1.\`id\` DESC
        `,
        [...ids, ...ids]
      );
      latestFormalEducationByPegawai = mapFirstRowByPegawai(latestFormalEducationRows);

      const [latestTrainingRows] = await connection.query(
        `
          SELECT rp1.*
          FROM \`riwayat_pendidikan\` rp1
          INNER JOIN (
            SELECT \`id_pegawai\`, MAX(COALESCE(\`tanggal_ijazah\`, \`tahun_lulus\`, '')) AS latest_sort
            FROM \`riwayat_pendidikan\`
            WHERE \`id_pegawai\` IN (${placeholders})
              AND (
                LOWER(REPLACE(COALESCE(\`jenis_riwayat\`, ''), '-', '_')) LIKE '%non_formal%'
                OR LOWER(COALESCE(\`jenis_riwayat\`, '')) LIKE '%diklat%'
                OR LOWER(COALESCE(\`jenis_riwayat\`, '')) LIKE '%pelatihan%'
              )
            GROUP BY \`id_pegawai\`
          ) latest
            ON latest.\`id_pegawai\` = rp1.\`id_pegawai\`
           AND COALESCE(rp1.\`tanggal_ijazah\`, rp1.\`tahun_lulus\`, '') = latest.latest_sort
          WHERE rp1.\`id_pegawai\` IN (${placeholders})
            AND (
              LOWER(REPLACE(COALESCE(rp1.\`jenis_riwayat\`, ''), '-', '_')) LIKE '%non_formal%'
              OR LOWER(COALESCE(rp1.\`jenis_riwayat\`, '')) LIKE '%diklat%'
              OR LOWER(COALESCE(rp1.\`jenis_riwayat\`, '')) LIKE '%pelatihan%'
            )
          ORDER BY rp1.\`id_pegawai\` ASC, rp1.\`id\` DESC
        `,
        [...ids, ...ids]
      );
      latestTrainingByPegawai = mapFirstRowByPegawai(latestTrainingRows);

      const [allEducationRows] = await connection.query(
        `SELECT * FROM \`riwayat_pendidikan\`
         WHERE \`id_pegawai\` IN (${placeholders})
         ORDER BY \`id_pegawai\` ASC, COALESCE(\`tanggal_ijazah\`, \`tahun_lulus\`, '') ASC, \`id\` ASC`,
        ids
      );
      educationRowsByPegawai = mapRowsByPegawai(allEducationRows);
    }
  } finally {
    connection.release();
  }

  const pns = pegawaiRows
    .map((item) => {
      const latestPangkat = latestPangkatByPegawai.get(Number(item.id_pegawai));
      const latestFormalEducation = latestFormalEducationByPegawai.get(Number(item.id_pegawai));
      const latestJabatan = latestJabatanByPegawai.get(Number(item.id_pegawai));
      const latestTraining = latestTrainingByPegawai.get(Number(item.id_pegawai));
      const pangkatRows = pangkatRowsByPegawai.get(Number(item.id_pegawai)) || [];
      const jabatanRows = jabatanRowsByPegawai.get(Number(item.id_pegawai)) || [];
      const educationRows = educationRowsByPegawai.get(Number(item.id_pegawai)) || [];

      return {
        ...item,
        nip: cleanNip(item.nip),
        tmt_pangkat_terakhir: latestPangkat?.tmt_pangkat || item.tmt_pangkat_terakhir || null,
        pangkat_golongan: latestPangkat?.pangkat_golongan || item.pangkat_golongan || null,
        jenjang_pendidikan: latestFormalEducation?.jenjang_pendidikan || item.jenjang_pendidikan || null,
        program_studi: latestFormalEducation?.program_studi || item.program_studi || null,
        tanggal_lulus_pendidikan: latestFormalEducation?.tanggal_ijazah || latestFormalEducation?.tahun_lulus || null,
        jenis_jabatan: latestJabatan?.jenis_jabatan || null,
        nama_jabatan_menpan: latestJabatan?.nama_jabatan_menpan || item.nama_jabatan_menpan || null,
        nama_jabatan_orb: latestJabatan?.nama_jabatan_orb || item.nama_jabatan_orb || null,
        eselon: latestJabatan?.eselon || null,
        tmt_jabatan: latestJabatan?.tmt_jabatan || latestJabatan?.tanggal_sk || null,
        nama_latihan_jabatan: latestTraining?.program_studi || latestTraining?.nama_institusi || latestTraining?.keterangan || null,
        tanggal_lulus_latihan: latestTraining?.tanggal_ijazah || latestTraining?.tahun_lulus || null,
        riwayat_pangkat: pangkatRows.map(pangkatSummary),
        riwayat_jabatan: jabatanRows.map(jabatanSummary),
        riwayat_pendidikan_formal: educationRows.filter((row) => educationType(row.jenis_riwayat) === "formal").map(educationSummary),
        riwayat_pelatihan: educationRows.filter((row) => educationType(row.jenis_riwayat) === "pelatihan").map(educationSummary)
      };
    });
  return ok(pns);
}
