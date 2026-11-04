import { z } from "zod";
import { ROLES } from "@/lib/constants/roles";
import { requireAuth } from "@/lib/auth/requireAuth";
import { validateUkpdWriteScope } from "@/lib/auth/ownership";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureUsulanSchema } from "@/lib/db/ensureUsulanSchema";

const textField = z.string().optional().default("");
const nullableNumber = z.union([z.coerce.number().int().nonnegative(), z.null()]).optional().nullable();
const STATUS_VALUES = ["Diusulkan", "Verifikasi Sudin", "Diterima Dinas", "Verifikasi Dinas", "Dikembalikan", "Ditolak", "Diproses", "Selesai"];
const DINAS_PROCESSED_STATUSES = new Set(["diterima dinas", "verifikasi dinas", "diproses", "selesai"]);

const createSchema = z.object({
  nrk: textField,
  nip: textField,
  nama_pegawai: z.string().min(3),
  gelar_depan: textField,
  gelar_belakang: textField,
  nama_ukpd: z.string().min(3),
  ukpd_tujuan: z.string().min(3),
  jabatan: textField,
  jabatan_baru: textField,
  pangkat_golongan: textField,
  abk_j_lama: nullableNumber,
  bezetting_j_lama: nullableNumber,
  nonasn_bezetting_lama: nullableNumber,
  nonasn_abk_lama: nullableNumber,
  abk_j_baru: nullableNumber,
  bezetting_j_baru: nullableNumber,
  nonasn_bezetting_baru: nullableNumber,
  nonasn_abk_baru: nullableNumber,
  jenis_mutasi: textField,
  berkas_path: textField,
  keterangan: textField,
  alasan: z.string().min(5)
});

const updateSchema = createSchema.partial().extend({
  id: z.coerce.number().int().positive(),
  status: z.enum(STATUS_VALUES).optional(),
  verif_checklist: z.record(z.boolean()).optional(),
  tanggal_usulan: z.string().optional()
});

function normalizeValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string") return value;
  const stringValue = value.trim();
  return stringValue === "" ? null : stringValue;
}

function normalizeChecklist(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return JSON.stringify(value);
}

function containsVerificationPatch(patch) {
  return patch.status !== undefined || patch.verif_checklist !== undefined || patch.tanggal_usulan !== undefined;
}

function isDinasProcessed(item) {
  return DINAS_PROCESSED_STATUSES.has(String(item?.status || "").trim().toLowerCase());
}

function buildScopeClause(alias, user) {
  if (user.role === ROLES.SUPER_ADMIN) {
    return { where: "", params: [] };
  }

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
          SELECT 1
          FROM \`pegawai\` p
          WHERE CAST(p.\`nip\` AS TEXT) = CAST(${alias}.\`nip\` AS TEXT)
            AND p.\`wilayah\` = ?
        )
        OR EXISTS (
          SELECT 1
          FROM \`ukpd\` u
          WHERE CAST(u.\`nama_ukpd\` AS TEXT) = CAST(${alias}.\`nama_ukpd\` AS TEXT)
            AND u.\`wilayah\` = ?
        )
      )`,
      params: [user.wilayah, user.wilayah]
    };
  }

  return { where: "WHERE 1 = 0", params: [] };
}

async function loadItem(pool, id) {
  const [[item]] = await pool.query("SELECT * FROM `usulan_mutasi` WHERE `id` = ? LIMIT 1", [id]);
  return item || null;
}

async function ensureAccessibleItem(pool, user, id) {
  const scope = buildScopeClause("m", user);
  const [rows] = await pool.query(
    `SELECT m.*
     FROM \`usulan_mutasi\` m
     ${scope.where ? `${scope.where} AND m.\`id\` = ?` : "WHERE m.`id` = ?"}
     LIMIT 1`,
    [...scope.params, id]
  );
  return rows[0] || null;
}

export async function GET() {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD]);
  if (error) return error;

  const pool = await getConnectedPool();
  await ensureUsulanSchema(pool);
  const scope = buildScopeClause("m", user);
  const [rows] = await pool.query(
    `SELECT m.*
     FROM \`usulan_mutasi\` m
     ${scope.where}
     ORDER BY COALESCE(m.\`tanggal_usulan\`, m.\`created_at\`) DESC, m.\`id\` DESC
     LIMIT 500`,
    scope.params
  );
  return ok(rows);
}

export async function POST(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD], request);
  if (error) return error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Validasi usulan mutasi gagal.", 422, parsed.error.flatten());

  const pool = await getConnectedPool();
  await ensureUsulanSchema(pool);
  const ownership = await validateUkpdWriteScope(pool, user, parsed.data.nama_ukpd);
  if (!ownership.allowed) return fail(ownership.message, 403);

  const data = {
    ...parsed.data,
    status: "Diusulkan",
    tanggal_usulan: new Date(),
    created_by_ukpd: user.nama_ukpd || user.username
  };
  const columns = Object.keys(data);
  const [result] = await pool.query(
    `INSERT INTO \`usulan_mutasi\` (${columns.map((column) => `\`${column}\``).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((column) => normalizeValue(data[column]))
  );
  const item = await loadItem(pool, result.insertId);
  return ok(item, "Usulan mutasi berhasil dibuat");
}

export async function PUT(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD], request);
  if (error) return error;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Validasi pembaruan usulan mutasi gagal.", 422, parsed.error.flatten());

  const pool = await getConnectedPool();
  await ensureUsulanSchema(pool);
  const current = await ensureAccessibleItem(pool, user, parsed.data.id);
  if (!current) return fail("Usulan mutasi tidak ditemukan atau tidak dapat diakses.", 404);

  if (parsed.data.nama_ukpd) {
    const ownership = await validateUkpdWriteScope(pool, user, parsed.data.nama_ukpd);
    if (!ownership.allowed) return fail(ownership.message, 403);
  }

  const patch = { ...parsed.data };
  delete patch.id;

  if (user.role === ROLES.ADMIN_UKPD && containsVerificationPatch(patch)) {
    return fail("Admin UKPD tidak dapat mengubah status atau checklist verifikasi.", 403);
  }

  if (patch.verif_checklist !== undefined) {
    patch.verif_checklist = normalizeChecklist(patch.verif_checklist);
  }

  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (!entries.length) return ok(current, "Tidak ada perubahan data.");

  await pool.query(
    `UPDATE \`usulan_mutasi\`
     SET ${entries.map(([key]) => `\`${key}\` = ?`).join(", ")}, \`updated_at\` = NOW()
     WHERE \`id\` = ?`,
    [...entries.map(([, value]) => normalizeValue(value)), parsed.data.id]
  );

  const item = await loadItem(pool, parsed.data.id);
  return ok(item, "Usulan mutasi berhasil diperbarui");
}

export async function DELETE(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD], request);
  if (error) return error;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail("Parameter usulan mutasi tidak valid.", 422);

  const pool = await getConnectedPool();
  await ensureUsulanSchema(pool);
  const current = await ensureAccessibleItem(pool, user, id);
  if (!current) return fail("Usulan mutasi tidak ditemukan atau tidak dapat diakses.", 404);

  if (user.role !== ROLES.SUPER_ADMIN && isDinasProcessed(current)) {
    return fail("Usulan mutasi sudah diproses Dinas/Super Admin sehingga tidak dapat dihapus oleh Admin UKPD atau Admin Wilayah.", 403);
  }

  await pool.query("DELETE FROM `usulan_mutasi` WHERE `id` = ?", [id]);
  return ok({ id }, "Usulan mutasi berhasil dihapus");
}
