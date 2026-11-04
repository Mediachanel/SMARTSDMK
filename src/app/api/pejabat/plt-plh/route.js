import { z } from "zod";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensurePejabatPltPlhSchema } from "@/lib/db/ensurePejabatPltPlhSchema";
import { fail, ok } from "@/lib/helpers/response";

const nrkSchema = z.string().transform((value) => cleanNrk(value)).refine(Boolean, {
  message: "NRK pegawai wajib diisi."
});
const createSchema = z.object({
  jenis_penugasan: z.enum(["PLT", "PLH"]).default("PLT"),
  nrk: nrkSchema,
  ukpd_tujuan: z.string().trim().min(3),
  jabatan_tujuan: z.string().trim().min(3),
  mulai_penugasan: z.string().trim().min(8),
  selesai_penugasan: z.string().trim().min(8)
});
const updateSchema = createSchema.extend({
  id: z.coerce.number().int().positive()
});

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
    id: row.id,
    jenis_penugasan: cleanText(row.jenis_penugasan, "PLT"),
    id_pegawai: row.id_pegawai,
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

function mapPegawai(row) {
  return {
    id_pegawai: row.id_pegawai,
    nrk: cleanNrk(row.nrk),
    nip: cleanNip(row.nip),
    nama: cleanText(row.nama),
    nama_ukpd: cleanText(row.nama_ukpd),
    jabatan_saat_ini: cleanText(row.jabatan_saat_ini),
    pangkat_golongan: cleanText(row.pangkat_golongan)
  };
}

async function loadPegawaiByNrk(pool, nrk) {
  const [rows] = await pool.query(
    `SELECT
       p.\`id_pegawai\`,
       p.\`nrk\`,
       p.\`nip\`,
       p.\`nama\`,
       p.\`nama_ukpd\`,
       p.\`pangkat_golongan\`,
       COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`, '') AS \`jabatan_saat_ini\`
     FROM \`pegawai\` p
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(p.\`nrk\`, '')), '\`', ''), ' ', ''), '-', ''), '.', '') = ?
     LIMIT 1`,
    [nrk]
  );
  return rows[0] || null;
}

async function loadItem(pool, id) {
  const [rows] = await pool.query(
    `SELECT
       r.*,
       p.\`nrk\`,
       p.\`nip\`,
       COALESCE(NULLIF(r.\`pangkat_golongan\`, ''), p.\`pangkat_golongan\`, '') AS \`pangkat_golongan\`
     FROM \`pejabat_plt_plh\` r
     LEFT JOIN \`pegawai\` p ON p.\`id_pegawai\` = r.\`id_pegawai\`
     WHERE r.\`id\` = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

function validateDates(data) {
  const mulai = new Date(data.mulai_penugasan);
  const selesai = new Date(data.selesai_penugasan);
  if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime())) {
    return "Tanggal mulai dan selesai PLT/PLH tidak valid.";
  }
  if (selesai < mulai) {
    return "Tanggal selesai PLT/PLH tidak boleh lebih awal dari tanggal mulai.";
  }
  return "";
}

async function buildPayload(pool, data, user) {
  const pegawai = await loadPegawaiByNrk(pool, data.nrk);
  if (!pegawai) return { error: fail("Pegawai dengan NRK tersebut tidak ditemukan.", 404) };

  return {
    data: {
      jenis_penugasan: data.jenis_penugasan,
      id_pegawai: pegawai.id_pegawai,
      nama_pejabat: pegawai.nama,
      jabatan_saat_ini: pegawai.jabatan_saat_ini,
      ukpd_asal: pegawai.nama_ukpd,
      pangkat_golongan: pegawai.pangkat_golongan,
      ukpd_tujuan: data.ukpd_tujuan,
      jabatan_tujuan: data.jabatan_tujuan,
      mulai_penugasan: data.mulai_penugasan,
      selesai_penugasan: data.selesai_penugasan,
      created_by: user.username,
      created_by_role: user.role,
      created_by_ukpd: user.nama_ukpd || ""
    }
  };
}

async function getOptions(pool) {
  const [ukpdRows] = await pool.query(
    `SELECT DISTINCT \`nama_ukpd\`
     FROM \`ukpd\`
     WHERE \`nama_ukpd\` IS NOT NULL AND \`nama_ukpd\` <> ''
     ORDER BY \`nama_ukpd\` ASC`
  );
  const [jabatanRows] = await pool.query(
    `SELECT DISTINCT COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`) AS \`jabatan\`
     FROM \`pegawai\` p
     WHERE COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`) IS NOT NULL
       AND COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`) <> ''
     ORDER BY \`jabatan\` ASC`
  );

  return {
    ukpdOptions: ukpdRows.map((row) => row.nama_ukpd).filter(Boolean),
    jabatanOptions: jabatanRows.map((row) => row.jabatan).filter(Boolean)
  };
}

export async function GET(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  const pool = await getConnectedPool();
  await ensurePejabatPltPlhSchema(pool);
  const { searchParams } = new URL(request.url);
  const nrk = cleanNrk(searchParams.get("nrk"));
  const periodeMulai = normalizeFilterDate(searchParams.get("periodeMulai") || searchParams.get("periode_mulai"));
  const periodeAkhir = normalizeFilterDate(searchParams.get("periodeAkhir") || searchParams.get("periode_akhir"));
  const wilayah = String(searchParams.get("wilayah") || "").trim();
  const jenisUkpd = String(searchParams.get("jenisUkpd") || searchParams.get("jenis_ukpd") || "").trim();
  const ukpd = String(searchParams.get("ukpd") || "").trim();
  const rumpun = String(searchParams.get("rumpun") || "").trim();
  const q = String(searchParams.get("q") || "").trim();

  if (nrk) {
    const pegawai = await loadPegawaiByNrk(pool, nrk);
    if (!pegawai) return fail("Pegawai dengan NRK tersebut tidak ditemukan.", 404);
    return ok({ pegawai: mapPegawai(pegawai) });
  }

  const where = [];
  const params = [];
  const rawRangeStart = periodeMulai || periodeAkhir;
  const rawRangeEnd = periodeAkhir || periodeMulai;
  const rangeStart = rawRangeStart && rawRangeEnd && rawRangeStart > rawRangeEnd ? rawRangeEnd : rawRangeStart;
  const rangeEnd = rawRangeStart && rawRangeEnd && rawRangeStart > rawRangeEnd ? rawRangeStart : rawRangeEnd;

  if (rangeStart && rangeEnd) {
    where.push("r.`mulai_penugasan` <= ?");
    where.push("r.`selesai_penugasan` >= ?");
    params.push(rangeEnd, rangeStart);
  } else {
    where.push("r.`mulai_penugasan` <= CURRENT_DATE");
    where.push("r.`selesai_penugasan` >= CURRENT_DATE");
  }

  if (q) {
    where.push("(r.`nama_pejabat` LIKE ? OR r.`jabatan_tujuan` LIKE ? OR r.`ukpd_tujuan` LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (wilayah) {
    where.push("(ut.`wilayah` = ? OR ua.`wilayah` = ? OR p.`wilayah` = ?)");
    params.push(wilayah, wilayah, wilayah);
  }

  if (jenisUkpd) {
    where.push("(ut.`jenis_ukpd` = ? OR ua.`jenis_ukpd` = ? OR p.`jenis_ukpd` = ?)");
    params.push(jenisUkpd, jenisUkpd, jenisUkpd);
  }

  if (ukpd) {
    where.push("(r.`ukpd_tujuan` = ? OR r.`ukpd_asal` = ? OR p.`nama_ukpd` = ?)");
    params.push(ukpd, ukpd, ukpd);
  }

  if (rumpun) {
    where.push("p.`status_rumpun` = ?");
    params.push(rumpun);
  }

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
     ORDER BY r.\`selesai_penugasan\` ASC, r.\`nama_pejabat\` ASC, r.\`id\` DESC`
    ,
    params
  );

  return ok({
    rows: rows.map(mapRow),
    options: await getOptions(pool)
  });
}

export async function POST(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Validasi data PLT/PLH gagal.", 422, parsed.error.flatten());

  const dateError = validateDates(parsed.data);
  if (dateError) return fail(dateError, 422);

  const pool = await getConnectedPool();
  await ensurePejabatPltPlhSchema(pool);
  const payload = await buildPayload(pool, parsed.data, user);
  if (payload.error) return payload.error;
  const data = payload.data;
  const columns = Object.keys(data);
  const [result] = await pool.query(
    `INSERT INTO \`pejabat_plt_plh\` (${columns.map((column) => `\`${column}\``).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((column) => data[column])
  );
  const saved = await loadItem(pool, result.insertId);

  return ok(mapRow(saved), "Data PLT/PLH berhasil ditambahkan.");
}

export async function PUT(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Validasi pembaruan data PLT/PLH gagal.", 422, parsed.error.flatten());

  const dateError = validateDates(parsed.data);
  if (dateError) return fail(dateError, 422);

  const pool = await getConnectedPool();
  await ensurePejabatPltPlhSchema(pool);
  const current = await loadItem(pool, parsed.data.id);
  if (!current) return fail("Data PLT/PLH tidak ditemukan.", 404);

  const payload = await buildPayload(pool, parsed.data, user);
  if (payload.error) return payload.error;
  const data = payload.data;
  delete data.created_by;
  delete data.created_by_role;
  delete data.created_by_ukpd;
  const entries = Object.entries(data);

  await pool.query(
    `UPDATE \`pejabat_plt_plh\`
     SET ${entries.map(([key]) => `\`${key}\` = ?`).join(", ")}, \`updated_at\` = NOW()
     WHERE \`id\` = ?`,
    [...entries.map(([, value]) => value), parsed.data.id]
  );

  const updated = await loadItem(pool, parsed.data.id);
  return ok(mapRow(updated), "Data PLT/PLH berhasil diperbarui.");
}

export async function DELETE(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = Number.parseInt(searchParams.get("id") || "", 10);
  if (!Number.isFinite(id) || id <= 0) return fail("ID data PLT/PLH tidak valid.", 422);

  const pool = await getConnectedPool();
  await ensurePejabatPltPlhSchema(pool);
  const current = await loadItem(pool, id);
  if (!current) return fail("Data PLT/PLH tidak ditemukan.", 404);

  await pool.query("DELETE FROM `pejabat_plt_plh` WHERE `id` = ?", [id]);
  return ok({ id }, "Data PLT/PLH berhasil dihapus.");
}
