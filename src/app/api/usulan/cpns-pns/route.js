import { z } from "zod";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensureCpnsPnsSchema } from "@/lib/db/ensureCpnsPnsSchema";
import { fail, ok } from "@/lib/helpers/response";
import {
  CPNS_PNS_DOCUMENT_LABELS,
  CPNS_PNS_STAGE_ONE_CLOSES_AT,
  CPNS_PNS_STAGE_TWO_OPENS_AT,
  CPNS_PNS_STATUSES,
  activeCpnsPnsStage,
  documentProgress,
  emptyVerification,
  isCpnsPnsStageOpen,
  normalizeVerification,
  parseObject
} from "@/lib/usulan/cpnsPns";

const ROLES_ALLOWED = [ROLES.SUPER_ADMIN, ROLES.ADMIN_UKPD, ROLES.CPNS];

const createSchema = z.object({}).strict();

const updateSchema = z.object({
  id: z.coerce.number().int().positive(),
  tahap: z.literal(2).optional(),
  status_latsar: z.enum(["Sudah STTPL", "Proses Latsar/STTPL"]).optional(),
  status: z.enum(CPNS_PNS_STATUSES).optional(),
  catatan: z.string().max(4000).optional(),
  nomor_tanggal_sttpl: z.string().max(255).optional(),
  nomor_tanggal_suket: z.string().max(255).optional(),
  nomor_sttpl: z.string().max(160).optional(),
  tanggal_sttpl: z.string().max(30).optional(),
  nomor_suket: z.string().max(160).optional(),
  tanggal_suket: z.string().max(30).optional(),
  keterangan_lampiran: z.string().max(4000).optional(),
  verifikasi: z.record(z.string(), z.boolean()).optional()
});

function scopeClause(alias, user) {
  if (user.role === ROLES.SUPER_ADMIN) return { sql: "", params: [] };
  if (user.role === ROLES.CPNS) return { sql: `${alias}.\`id_pegawai\` = ?`, params: [Number(user.id_pegawai || user.id)] };
  if (user.role === ROLES.ADMIN_UKPD) return { sql: `${alias}.\`nama_ukpd\` = ?`, params: [user.nama_ukpd] };
  return { sql: "1 = 0", params: [] };
}

function decorate(item) {
  const dokumen = parseObject(item.dokumen);
  const verifikasi = normalizeVerification(item.verifikasi);
  return {
    ...item,
    dokumen: Object.fromEntries(Object.keys(CPNS_PNS_DOCUMENT_LABELS).map((key) => [
      key,
      dokumen[key] ? { ...dokumen[key], url: `/api/usulan/cpns-pns/dokumen?id=${item.id}&key=${key}` } : null
    ])),
    verifikasi,
    progress: documentProgress(dokumen, verifikasi),
    stageSubmissionOpen: isCpnsPnsStageOpen(item.tahap)
  };
}

async function accessibleItem(pool, user, id) {
  const scope = scopeClause("u", user);
  const [rows] = await pool.query(
    `SELECT u.* FROM \`usulan_cpns_pns\` u WHERE u.\`id\` = ? AND ${scope.sql || "1 = 1"} LIMIT 1`,
    [id, ...scope.params]
  );
  return rows[0] || null;
}

export async function GET() {
  const { user, error } = await requireAuth(ROLES_ALLOWED);
  if (error) return error;
  const pool = await getConnectedPool();
  await ensureCpnsPnsSchema(pool);
  const scope = scopeClause("u", user);
  const [items] = await pool.query(
    `SELECT u.* FROM \`usulan_cpns_pns\` u ${scope.sql ? `WHERE ${scope.sql}` : ""} ORDER BY u.\`nama_ukpd\`, u.\`nama_pegawai\``,
    scope.params
  );

  const cpnsScope = scopeClause("p", user);
  const [cpnsSummaryRows] = await pool.query(
    `SELECT COUNT(DISTINCT p.\`id_pegawai\`) AS total_cpns,
            COUNT(DISTINCT CASE WHEN u.\`id\` IS NULL THEN p.\`id_pegawai\` END) AS belum_mengusulkan
     FROM \`pegawai\` p
     LEFT JOIN \`usulan_cpns_pns\` u ON CAST(u.\`nip\` AS TEXT) = CAST(p.\`nip\` AS TEXT)
     WHERE LOWER(COALESCE(p.\`jenis_pegawai\`, '')) = 'cpns'
       ${cpnsScope.sql ? `AND ${cpnsScope.sql}` : ""}`,
    cpnsScope.params
  );
  const cpnsSummaryRow = cpnsSummaryRows[0] || {};
  const cpnsSummary = {
    total: Number(cpnsSummaryRow.total_cpns || 0),
    notSubmitted: Number(cpnsSummaryRow.belum_mengusulkan || 0)
  };

  const candidateWhere = ["LOWER(COALESCE(p.`jenis_pegawai`, '')) = 'cpns'", "u.`id` IS NULL"];
  const candidateParams = [];
  if (user.role === ROLES.CPNS) {
    candidateWhere.push("p.`id_pegawai` = ?");
    candidateParams.push(Number(user.id_pegawai || user.id));
  } else candidateWhere.push("1 = 0");
  const [candidates] = await pool.query(
    `SELECT p.\`id_pegawai\`, p.\`nrk\`, p.\`nip\`, p.\`nama\`, p.\`nama_ukpd\`,
            p.\`pangkat_golongan\`, COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`) AS jabatan,
            COALESCE(NULLIF(p.\`wilayah\`, ''), k.\`wilayah\`, '-') AS wilayah
     FROM \`pegawai\` p
     LEFT JOIN \`ukpd\` k ON k.\`nama_ukpd\` = p.\`nama_ukpd\`
     LEFT JOIN \`usulan_cpns_pns\` u ON CAST(u.\`nip\` AS TEXT) = CAST(p.\`nip\` AS TEXT)
     WHERE ${candidateWhere.join(" AND ")}
     ORDER BY p.\`nama_ukpd\`, p.\`nama\``,
    candidateParams
  );
  return ok({
    items: items.map(decorate),
    candidates,
    cpnsSummary,
    documentLabels: CPNS_PNS_DOCUMENT_LABELS,
    statuses: CPNS_PNS_STATUSES,
    activeStage: activeCpnsPnsStage(),
    submissionOpen: activeCpnsPnsStage() !== null,
    stageOneClosesAt: CPNS_PNS_STAGE_ONE_CLOSES_AT.toISOString(),
    stageTwoOpensAt: CPNS_PNS_STAGE_TWO_OPENS_AT.toISOString(),
    canMoveToStageTwo: false,
    user: { role: user.role, nama: user.nama || "", nama_ukpd: user.nama_ukpd || "", wilayah: user.wilayah || "" }
  });
}

export async function POST(request) {
  const { user, error } = await requireAuth(ROLES_ALLOWED, request);
  if (error) return error;
  if (user.role !== ROLES.CPNS) return fail("Pengusulan awal hanya dapat dibuat oleh CPNS yang bersangkutan.", 403);
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Data CPNS tidak valid.", 422, parsed.error.flatten());
  const pool = await getConnectedPool();
  await ensureCpnsPnsSchema(pool);
  const [rows] = await pool.query(
    `SELECT p.\`id_pegawai\`, p.\`nrk\`, p.\`nip\`, p.\`nama\`, p.\`nama_ukpd\`, p.\`pangkat_golongan\`,
            COALESCE(NULLIF(p.\`nama_jabatan_menpan\`, ''), p.\`nama_jabatan_orb\`) AS jabatan,
            COALESCE(NULLIF(p.\`wilayah\`, ''), k.\`wilayah\`, '-') AS wilayah
     FROM \`pegawai\` p LEFT JOIN \`ukpd\` k ON k.\`nama_ukpd\` = p.\`nama_ukpd\`
     WHERE p.\`id_pegawai\` = ? AND LOWER(COALESCE(p.\`jenis_pegawai\`, '')) = 'cpns' LIMIT 1`,
    [Number(user.id_pegawai || user.id)]
  );
  const candidate = rows[0];
  if (!candidate) return fail("Data pegawai CPNS tidak ditemukan.", 404);
  if (Number(candidate.id_pegawai) !== Number(user.id_pegawai || user.id)) return fail("Anda hanya dapat membuat pengusulan untuk data Anda sendiri.", 403);
  const [existing] = await pool.query("SELECT `id` FROM `usulan_cpns_pns` WHERE CAST(`nip` AS TEXT) = CAST(? AS TEXT) LIMIT 1", [candidate.nip]);
  if (existing.length) return fail("CPNS tersebut sudah masuk daftar pengusulan.", 409);
  const tahap = activeCpnsPnsStage();
  if (!tahap) {
    return fail("Pengajuan Tahap I telah ditutup pada 3 September 2026. Tahap II dibuka pada 8 September 2026.", 422);
  }
  const statusLatsar = tahap === 1 ? "Sudah STTPL" : "Proses Latsar/STTPL";
  const result = await pool.query(
    `INSERT INTO \`usulan_cpns_pns\`
      (\`id_pegawai\`, \`nrk\`, \`nip\`, \`nama_pegawai\`, \`nama_ukpd\`, \`wilayah\`, \`pangkat_golongan\`, \`jabatan\`, \`tahap\`, \`status_latsar\`, \`status\`, \`dokumen\`, \`verifikasi\`, \`created_by_ukpd\`, \`created_by\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft CPNS', ?, ?, ?, ?)`,
    [candidate.id_pegawai, candidate.nrk, candidate.nip, candidate.nama, candidate.nama_ukpd, candidate.wilayah,
      candidate.pangkat_golongan, candidate.jabatan, tahap, statusLatsar, JSON.stringify({}),
      JSON.stringify(emptyVerification()), user.nama_ukpd || candidate.nama_ukpd, user.username || user.role]
  );
  const id = result[0].insertId;
  return ok(decorate((await pool.query("SELECT * FROM `usulan_cpns_pns` WHERE `id` = ?", [id]))[0][0]), "CPNS berhasil ditambahkan ke pengusulan.");
}

export async function PATCH(request) {
  const { user, error } = await requireAuth(ROLES_ALLOWED, request);
  if (error) return error;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Perubahan pengusulan tidak valid.", 422, parsed.error.flatten());
  const pool = await getConnectedPool();
  await ensureCpnsPnsSchema(pool);
  const current = await accessibleItem(pool, user, parsed.data.id);
  if (!current) return fail("Pengusulan tidak ditemukan atau tidak dapat diakses.", 404);
  if (user.role === ROLES.CPNS && !isCpnsPnsStageOpen(current.tahap)) {
    return fail(`Masa pengisian dan pengajuan Tahap ${Number(current.tahap) === 2 ? "II" : "I"} telah ditutup. Data dan dokumen yang sudah tersimpan tetap aman.`, 422);
  }
  if (parsed.data.tahap !== undefined) {
    return fail("Pemindahan ke Tahap II berlangsung otomatis setelah Tahap I ditutup.", 422);
  }
  const allowedTargets = {
    [ROLES.CPNS]: new Set(["Draft CPNS", "Diajukan ke Admin UKPD"]),
    [ROLES.ADMIN_UKPD]: new Set(["Dikembalikan ke CPNS", "Terverifikasi Admin UKPD"]),
    [ROLES.SUPER_ADMIN]: new Set(["Direkap Dinkes", "Diusulkan ke BKD", "Selesai"])
  };
  if (parsed.data.status && !allowedTargets[user.role]?.has(parsed.data.status)) {
    return fail("Perubahan status tidak sesuai kewenangan tahapan Anda.", 403);
  }
  const allowedTransitions = {
    "Draft CPNS": new Set(["Draft CPNS", "Dikembalikan ke CPNS"]),
    "Diajukan ke Admin UKPD": new Set(["Draft CPNS", "Dikembalikan ke CPNS"]),
    "Dikembalikan ke CPNS": new Set(["Diajukan ke Admin UKPD"]),
    "Terverifikasi Admin UKPD": new Set(["Diajukan ke Admin UKPD"]),
    "Direkap Dinkes": new Set(["Terverifikasi Admin UKPD", "Direkap Dinkes"]),
    "Diusulkan ke BKD": new Set(["Terverifikasi Admin UKPD", "Direkap Dinkes", "Diusulkan ke BKD"]),
    "Selesai": new Set(["Diusulkan ke BKD", "Selesai"])
  };
  if (parsed.data.status && !allowedTransitions[parsed.data.status]?.has(current.status)) {
    return fail(`Tahap ${current.status} tidak dapat langsung diubah menjadi ${parsed.data.status}.`, 422);
  }
  if (user.role === ROLES.CPNS && !["Draft CPNS", "Dikembalikan ke CPNS"].includes(current.status)) {
    return fail("Data tidak dapat diubah karena sedang atau sudah diverifikasi Admin UKPD.", 422);
  }
  if (parsed.data.verifikasi && user.role !== ROLES.ADMIN_UKPD) {
    return fail("Validasi dokumen hanya dapat dilakukan oleh Admin UKPD.", 403);
  }
  if (parsed.data.status === "Diajukan ke Admin UKPD") {
    const progress = documentProgress(current.dokumen, current.verifikasi);
    if (progress.uploaded !== progress.total) return fail("Seluruh dokumen wajib diunggah sebelum diajukan ke Admin UKPD.", 422);
    const metadata = { ...current, ...parsed.data };
    if (!metadata.nomor_sttpl || !metadata.tanggal_sttpl || !metadata.nomor_suket || !metadata.tanggal_suket) {
      return fail("Nomor dan tanggal STTPL serta surat kesehatan wajib diisi sebelum diajukan ke Admin UKPD.", 422);
    }
  }
  if (parsed.data.status === "Terverifikasi Admin UKPD") {
    const progress = documentProgress(current.dokumen, parsed.data.verifikasi ?? current.verifikasi);
    if (progress.uploaded !== progress.total || progress.verified !== progress.total) {
      return fail("Seluruh dokumen harus tersedia dan dicentang valid oleh Admin UKPD.", 422);
    }
  }
  if (user.role === ROLES.ADMIN_UKPD && parsed.data.status === "Dikembalikan ke CPNS" && !parsed.data.catatan?.trim()) {
    return fail("Catatan perbaikan wajib diisi sebelum usulan dikembalikan kepada CPNS.", 422);
  }
  if (["Direkap Dinkes", "Diusulkan ke BKD", "Selesai"].includes(parsed.data.status)
      && !["Terverifikasi Admin UKPD", "Direkap Dinkes", "Diusulkan ke BKD", "Selesai"].includes(current.status)) {
    return fail("Dinkes hanya dapat merekap usulan yang sudah terverifikasi Admin UKPD.", 422);
  }
  const fields = [];
  const params = [];
  const editableFields = user.role === ROLES.CPNS
    ? ["status_latsar", "status", "nomor_sttpl", "tanggal_sttpl", "nomor_suket", "tanggal_suket", "keterangan_lampiran"]
    : ["status", "catatan"];
  for (const key of editableFields) {
    if (parsed.data[key] !== undefined) { fields.push(`\`${key}\` = ?`); params.push(parsed.data[key]); }
  }
  if (parsed.data.verifikasi !== undefined && user.role === ROLES.ADMIN_UKPD) {
    fields.push("`verifikasi` = ?");
    params.push(JSON.stringify(normalizeVerification(parsed.data.verifikasi)));
  }
  if (!fields.length) return fail("Tidak ada perubahan untuk disimpan.", 422);
  await pool.query(`UPDATE \`usulan_cpns_pns\` SET ${fields.join(", ")}, \`updated_at\` = NOW() WHERE \`id\` = ?`, [...params, parsed.data.id]);
  const updated = (await pool.query("SELECT * FROM `usulan_cpns_pns` WHERE `id` = ?", [parsed.data.id]))[0][0];
  return ok(decorate(updated), "Pengusulan berhasil diperbarui.");
}

export async function DELETE(request) {
  const { user, error } = await requireAuth(ROLES_ALLOWED, request);
  if (error) return error;
  const id = Number(new URL(request.url).searchParams.get("id") || 0);
  if (!Number.isInteger(id) || id <= 0) return fail("ID pengusulan tidak valid.", 422);
  const pool = await getConnectedPool();
  await ensureCpnsPnsSchema(pool);
  const current = await accessibleItem(pool, user, id);
  if (!current) return fail("Pengusulan tidak ditemukan atau tidak dapat diakses.", 404);
  if (user.role === ROLES.CPNS && !isCpnsPnsStageOpen(current.tahap)) {
    return fail("Draft periode yang sudah ditutup tidak dapat dihapus. Data dan dokumen tetap dipertahankan.", 422);
  }
  if (user.role !== ROLES.SUPER_ADMIN && (user.role !== ROLES.CPNS || !["Draft CPNS", "Dikembalikan ke CPNS"].includes(current.status))) {
    return fail("Pengusulan yang sudah diproses hanya dapat dihapus oleh Super Admin.", 403);
  }
  await pool.query("DELETE FROM `usulan_cpns_pns` WHERE `id` = ?", [id]);
  return ok({ id }, "Pengusulan berhasil dihapus.");
}
