import { filterPegawaiByRole } from "@/lib/auth/access";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { createPegawaiData, getUkpdData } from "@/lib/data/pegawaiStore";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensurePegawaiPhotoSchema } from "@/lib/db/ensurePegawaiPhotoSchema";
import { ensurePegawaiStatusSchema } from "@/lib/db/ensurePegawaiStatusSchema";
import { ROLES } from "@/lib/constants/roles";
import { validatePegawaiReferenceFields } from "@/lib/pegawaiFormOptions";
import { normalizePegawaiReferencePayload } from "@/lib/pegawaiReferenceOptions";
import { writeAuditLog } from "@/lib/security/auditLog";
import { pegawaiPayloadSchema, sanitizePegawaiPayload } from "@/lib/validation/pegawai";

function numberParam(value, fallback, min, max) {
  const number = Number.parseInt(value || "", 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanNip(value) {
  return String(value || "").trim().replace(/^`+/, "");
}

function cleanNrk(value) {
  return String(value || "").trim().replace(/\D/g, "");
}

function normalizePegawaiRows(rows) {
  return rows.map((row) => ({
    ...row,
    nrk: cleanNrk(row.nrk),
    nip: cleanNip(row.nip)
  }));
}

function addWhere(parts, params, clause, values = []) {
  parts.push(clause);
  params.push(...values);
}

const PEGAWAI_LIST_SELECT = [
  "p.`id_pegawai`",
  "p.`nrk`",
  "p.`nama`",
  "p.`nip`",
  "p.`gelar_depan`",
  "p.`gelar_belakang`",
  "p.`pangkat_golongan`",
  "p.`nama_jabatan_menpan`",
  "p.`nama_jabatan_orb`",
  "p.`status_rumpun`",
  "p.`jenis_pegawai`",
  "p.`nama_ukpd`",
  "COALESCE(NULLIF(p.`wilayah`, ''), u.`wilayah`, '-') AS `wilayah`",
  "COALESCE(NULLIF(p.`jenis_ukpd`, ''), u.`jenis_ukpd`, '-') AS `jenis_ukpd`"
].join(", ");

async function getPegawaiPage({ user, q, nrk, status, wilayah, jenisUkpd, ukpd, jabatan, rumpun, page, pageSize, exportAll = false }) {
  const pool = await getConnectedPool();
  const where = [];
  const params = [];

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
  if (nrk) {
    addWhere(
      where,
      params,
      "REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(p.`nrk`, '')), '`', ''), ' ', ''), '-', ''), '.', '') = ?",
      [nrk]
    );
  }
  if (status) addWhere(where, params, "UPPER(TRIM(p.`jenis_pegawai`)) = UPPER(TRIM(?))", [status]);
  if (wilayah) addWhere(where, params, "COALESCE(NULLIF(p.`wilayah`, ''), u.`wilayah`) = ?", [wilayah]);
  if (jenisUkpd) addWhere(where, params, "COALESCE(NULLIF(p.`jenis_ukpd`, ''), u.`jenis_ukpd`) = ?", [jenisUkpd]);
  if (ukpd) addWhere(where, params, "p.`nama_ukpd` = ?", [ukpd]);
  if (jabatan) addWhere(where, params, "COALESCE(NULLIF(p.`nama_jabatan_menpan`, ''), p.`nama_jabatan_orb`) = ?", [jabatan]);
  if (rumpun) addWhere(where, params, "p.`status_rumpun` = ?", [rumpun]);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const joinSql = "LEFT JOIN `ukpd` u ON u.`nama_ukpd` = p.`nama_ukpd`";
  const offset = (page - 1) * pageSize;
  const selectSql = exportAll
    ? "p.*, COALESCE(NULLIF(p.`wilayah`, ''), u.`wilayah`, '-') AS `wilayah`"
    : PEGAWAI_LIST_SELECT;
  const countRows = exportAll
    ? []
    : (await pool.query(`SELECT COUNT(*) AS total FROM \`pegawai\` p ${joinSql} ${whereSql}`, params))[0];
  const [rows] = await pool.query(
    `SELECT ${selectSql}
     FROM \`pegawai\` p
     ${joinSql}
     ${whereSql}
     ORDER BY p.\`nama\` ASC, p.\`id_pegawai\` ASC
     ${exportAll ? "" : "LIMIT ? OFFSET ?"}`,
    exportAll ? params : [...params, pageSize, offset]
  );

  let ukpdRows = [];
  let jenisUkpdRows = [];
  let jabatanRows = [];
  let rumpunRows = [];
  if (!exportAll) {
    const scopedUkpdWhere = [];
    const scopedUkpdParams = [];
    const scopedPegawaiWhere = [];
    const scopedPegawaiParams = [];
    if (user.role === ROLES.ADMIN_UKPD) {
      addWhere(scopedUkpdWhere, scopedUkpdParams, "`nama_ukpd` = ?", [user.nama_ukpd]);
      addWhere(scopedPegawaiWhere, scopedPegawaiParams, "p.`nama_ukpd` = ?", [user.nama_ukpd]);
    } else if (user.role === ROLES.ADMIN_WILAYAH) {
      addWhere(scopedUkpdWhere, scopedUkpdParams, "`wilayah` = ?", [user.wilayah]);
      addWhere(scopedPegawaiWhere, scopedPegawaiParams, "COALESCE(NULLIF(p.`wilayah`, ''), u.`wilayah`) = ?", [user.wilayah]);
    } else if (user.role !== ROLES.SUPER_ADMIN) {
      addWhere(scopedUkpdWhere, scopedUkpdParams, "1 = 0");
      addWhere(scopedPegawaiWhere, scopedPegawaiParams, "1 = 0");
    }
    [ukpdRows] = await pool.query(
      `SELECT DISTINCT \`nama_ukpd\` FROM \`ukpd\` ${scopedUkpdWhere.length ? `WHERE ${scopedUkpdWhere.join(" AND ")}` : ""} ORDER BY \`nama_ukpd\` ASC`,
      scopedUkpdParams
    );
    [jenisUkpdRows] = await pool.query(
      `SELECT DISTINCT COALESCE(NULLIF(p.\`jenis_ukpd\`, ''), u.\`jenis_ukpd\`) AS jenis_ukpd
       FROM \`pegawai\` p
       ${joinSql}
       ${scopedPegawaiWhere.length ? `WHERE ${scopedPegawaiWhere.join(" AND ")} AND` : "WHERE"}
       COALESCE(NULLIF(p.\`jenis_ukpd\`, ''), u.\`jenis_ukpd\`) IS NOT NULL
       AND COALESCE(NULLIF(p.\`jenis_ukpd\`, ''), u.\`jenis_ukpd\`) <> ''
       ORDER BY jenis_ukpd ASC`,
      scopedPegawaiParams
    );
    [jabatanRows] = await pool.query(
      `SELECT DISTINCT COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`) AS jabatan
       FROM \`pegawai\` p
       ${joinSql}
       ${scopedPegawaiWhere.length ? `WHERE ${scopedPegawaiWhere.join(" AND ")} AND` : "WHERE"}
       COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`) IS NOT NULL
       AND COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`) <> ''
       ORDER BY jabatan ASC`,
      scopedPegawaiParams
    );
    [rumpunRows] = await pool.query(
      `SELECT DISTINCT p.\`status_rumpun\` AS rumpun
       FROM \`pegawai\` p
       ${joinSql}
       ${scopedPegawaiWhere.length ? `WHERE ${scopedPegawaiWhere.join(" AND ")} AND` : "WHERE"}
       p.\`status_rumpun\` IS NOT NULL AND p.\`status_rumpun\` <> ''
       ORDER BY rumpun ASC`,
      scopedPegawaiParams
    );
  }

  return {
    rows: normalizePegawaiRows(rows),
    total: exportAll ? rows.length : Number(countRows[0]?.total || 0),
    page,
    pageSize,
    filters: {
      ukpdOptions: ukpdRows.map((row) => row.nama_ukpd).filter(Boolean),
      jenisUkpdOptions: jenisUkpdRows.map((row) => row.jenis_ukpd).filter(Boolean),
      jabatanOptions: jabatanRows.map((row) => row.jabatan).filter(Boolean),
      rumpunOptions: rumpunRows.map((row) => row.rumpun).filter(Boolean),
      canFilterWilayah: user.role === ROLES.SUPER_ADMIN,
      canFilterUkpd: user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN_WILAYAH,
      canFilterJenisUkpd: user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN_WILAYAH
    }
  };
}

export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.toLowerCase() || "";
  const nrk = cleanNrk(searchParams.get("nrk"));
  const status = searchParams.get("status") || "";
  const wilayah = searchParams.get("wilayah") || "";
  const jenisUkpd = searchParams.get("jenisUkpd") || searchParams.get("jenis_ukpd") || "";
  const ukpd = searchParams.get("ukpd") || "";
  const jabatan = searchParams.get("jabatan") || "";
  const rumpun = searchParams.get("rumpun") || "";
  const page = numberParam(searchParams.get("page"), 1, 1, 100000);
  const pageSize = numberParam(searchParams.get("pageSize"), 10, 10, 100);
  if (searchParams.get("export") === "1") {
    return fail("Gunakan endpoint export resmi agar akses data tetap terkontrol.", 400);
  }

  return ok(await getPegawaiPage({ user, q, nrk, status, wilayah, jenisUkpd, ukpd, jabatan, rumpun, page, pageSize }));
}

export async function POST(request) {
  const { user, error } = await requireAuth([], request);
  if (error) return error;
  const pool = await getConnectedPool();
  await ensurePegawaiPhotoSchema(pool);
  await ensurePegawaiStatusSchema(pool);
  const parsed = pegawaiPayloadSchema.safeParse(sanitizePegawaiPayload(await request.json()));
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    console.warn("Validasi tambah pegawai gagal:", Object.keys(flattened.fieldErrors || {}));
    return fail("Validasi data pegawai gagal.", 422, flattened.fieldErrors);
  }
  const data = normalizePegawaiReferencePayload(parsed.data);
  const referenceValidation = await validatePegawaiReferenceFields(data);
  if (!referenceValidation.valid) {
    return fail("Validasi referensi pegawai gagal.", 422, referenceValidation.errors);
  }

  const nextItem = { ...data };
  const ukpdList = await getUkpdData();
  const allowed = filterPegawaiByRole([nextItem], user, ukpdList).length === 1;
  if (!allowed) return fail("Anda tidak boleh membuat pegawai untuk UKPD atau wilayah lain.", 403);
  const created = await createPegawaiData(nextItem);
  await writeAuditLog({
    request,
    user,
    action: "pegawai.create",
    entityType: "pegawai",
    entityId: created?.id_pegawai,
    metadata: {
      nama: created?.nama,
      nip: created?.nip,
      nrk: created?.nrk,
      nama_ukpd: created?.nama_ukpd
    }
  });
  return ok(created, "Pegawai berhasil ditambahkan");
}
