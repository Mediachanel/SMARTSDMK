import { filterPegawaiByRole, getPegawaiWilayah } from "@/lib/auth/access";
import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import { getConnectedPool, isClosedConnectionError, resetPostgresPools } from "@/lib/db/postgres";
import { ensureDrhSchema } from "@/lib/db/ensureDrhSchema";
import { ensurePejabatPltPlhSchema } from "@/lib/db/ensurePejabatPltPlhSchema";
import { ensurePegawaiPhotoSchema } from "@/lib/db/ensurePegawaiPhotoSchema";
import { ensurePegawaiStatusSchema } from "@/lib/db/ensurePegawaiStatusSchema";
import {
  deletePegawaiData,
  getPegawaiAlamat,
  getPegawaiAnak,
  getPegawaiById,
  getPegawaiKeluarga,
  getPegawaiPasangan,
  getPegawaiRiwayatGajiPokok,
  getPegawaiRiwayatHukumanDisiplin,
  getPegawaiRiwayatJabatan,
  getPegawaiRiwayatKeberhasilan,
  getPegawaiRiwayatKegiatanStrategis,
  getPegawaiRiwayatNarasumber,
  getPegawaiRiwayatPangkat,
  getPegawaiRiwayatPendidikan,
  getPegawaiRiwayatPenghargaan,
  getPegawaiRiwayatPrestasiPendidikan,
  getPegawaiRiwayatSkp,
  getUkpdData,
  updatePegawaiData
} from "@/lib/data/pegawaiStore";
import { validatePegawaiReferenceFields } from "@/lib/pegawaiFormOptions";
import { normalizePegawaiReferencePayload } from "@/lib/pegawaiReferenceOptions";
import { writeAuditLog } from "@/lib/security/auditLog";
import { parsePositiveId, pegawaiPayloadSchema, sanitizePegawaiPayload } from "@/lib/validation/pegawai";

async function findAllowedById(id, user, ukpdList) {
  const item = await getPegawaiById(id);
  if (!item) return null;
  return filterPegawaiByRole([item], user, ukpdList).find((entry) => entry.id_pegawai === Number(id)) || null;
}

function cleanNip(value) {
  return String(value || "").trim().replace(/^`+/, "");
}

function normalizeDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return value ? String(value).slice(0, 10) : null;
}

function buildPegawaiChanges(before, after, submitted) {
  return Object.keys(submitted || {}).reduce((changes, field) => {
    const previousValue = before?.[field] ?? null;
    const nextValue = after?.[field] ?? submitted[field] ?? null;
    const scalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);
    if (!scalar(previousValue) || !scalar(nextValue)) return changes;
    if (String(previousValue ?? "") !== String(nextValue ?? "")) {
      changes[field] = { before: previousValue, after: nextValue };
    }
    return changes;
  }, {});
}

async function ensureSchemaWithFreshConnection() {
  const now = Date.now();
  const lastEnsuredAt = Number(globalThis.__sisdmkDrhSchemaEnsuredAt || 0);
  if (lastEnsuredAt && now - lastEnsuredAt < 5 * 60 * 1000) return;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pool = await getConnectedPool();
    let connection;
    try {
      connection = await pool.getConnection();
      await ensureDrhSchema(connection);
      await ensurePegawaiPhotoSchema(connection);
      await ensurePegawaiStatusSchema(connection);
      globalThis.__sisdmkDrhSchemaEnsuredAt = Date.now();
      return;
    } catch (error) {
      if (attempt === 0 && isClosedConnectionError(error)) {
        globalThis.__sisdmkDrhSchemaEnsuredAt = 0;
        await resetPostgresPools();
        continue;
      }
      throw error;
    } finally {
      connection?.release();
    }
  }
}

async function getPegawaiRiwayatPltPlh(id) {
  const pool = await getConnectedPool();
  await ensurePejabatPltPlhSchema(pool);
  const [rows] = await pool.query(
    `SELECT
       \`id\`,
       \`jenis_penugasan\`,
       \`id_pegawai\`,
       \`nama_pejabat\`,
       \`jabatan_saat_ini\`,
       \`ukpd_asal\`,
       \`pangkat_golongan\`,
       \`ukpd_tujuan\`,
       \`jabatan_tujuan\`,
       \`mulai_penugasan\`,
       \`selesai_penugasan\`
     FROM \`pejabat_plt_plh\`
     WHERE \`id_pegawai\` = ?
     ORDER BY \`mulai_penugasan\` DESC, \`selesai_penugasan\` DESC, \`id\` DESC`,
    [id]
  );
  return rows.map((row) => ({
    ...row,
    mulai_penugasan: normalizeDateValue(row.mulai_penugasan),
    selesai_penugasan: normalizeDateValue(row.selesai_penugasan)
  }));
}

export async function GET(_request, { params }) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;
    await ensureSchemaWithFreshConnection();
    const { id: rawId } = await params;
    const id = parsePositiveId(rawId);
    if (!id) return fail("ID pegawai tidak valid.", 400);
    const ukpdList = await getUkpdData();
    const item = await findAllowedById(id, user, ukpdList);
    if (!item) return fail("Data pegawai tidak ditemukan atau tidak dapat diakses.", 404);

    const [alamat, pasangan, anak, keluarga, riwayatPendidikan, riwayatJabatan, riwayatPltPlh, riwayatGajiPokok, riwayatPangkat, riwayatPenghargaan, riwayatSkp, riwayatHukumanDisiplin, riwayatPrestasiPendidikan, riwayatNarasumber, riwayatKegiatanStrategis, riwayatKeberhasilan] = await Promise.all([
      getPegawaiAlamat(id),
      getPegawaiPasangan(id),
      getPegawaiAnak(id),
      getPegawaiKeluarga(id),
      getPegawaiRiwayatPendidikan(id),
      getPegawaiRiwayatJabatan(id),
      getPegawaiRiwayatPltPlh(id),
      getPegawaiRiwayatGajiPokok(id),
      getPegawaiRiwayatPangkat(id),
      getPegawaiRiwayatPenghargaan(id),
      getPegawaiRiwayatSkp(id),
      getPegawaiRiwayatHukumanDisiplin(id),
      getPegawaiRiwayatPrestasiPendidikan(id),
      getPegawaiRiwayatNarasumber(id),
      getPegawaiRiwayatKegiatanStrategis(id),
      getPegawaiRiwayatKeberhasilan(id)
    ]);
    const latestRiwayatPangkat = riwayatPangkat[0] || null;
    const latestRiwayatPendidikan = riwayatPendidikan.find((entry) =>
      ["formal", "pendidikan_terakhir"].includes(String(entry.jenis_riwayat || "").trim().toLowerCase().replace(/[\s-]+/g, "_"))
    ) || null;
    const alamatKtp = alamat.find((entry) => String(entry.tipe || "").toLowerCase() === "ktp");
    const alamatDomisili = alamat.find((entry) => String(entry.tipe || "").toLowerCase() === "domisili");

    return ok({
      ...item,
      nip: cleanNip(item.nip),
      wilayah: getPegawaiWilayah(item, ukpdList),
      pangkat_golongan: latestRiwayatPangkat?.pangkat_golongan || item.pangkat_golongan || null,
      tmt_pangkat_terakhir: latestRiwayatPangkat?.tmt_pangkat || latestRiwayatPangkat?.tanggal_sk || item.tmt_pangkat_terakhir || null,
      jenjang_pendidikan: latestRiwayatPendidikan?.jenjang_pendidikan || item.jenjang_pendidikan || null,
      program_studi: latestRiwayatPendidikan?.program_studi || item.program_studi || null,
      nama_universitas: latestRiwayatPendidikan?.nama_universitas || latestRiwayatPendidikan?.nama_institusi || item.nama_universitas || null,
      alamat: {
        domisili: alamatDomisili || null,
        ktp: alamatKtp || null
      },
      alamat_list: alamat,
      alamat_ktp: alamatKtp?.alamat_lengkap || null,
      alamat_domisili: alamatDomisili?.alamat_lengkap || null,
      pasangan,
      anak,
      keluarga,
      riwayat_pendidikan: riwayatPendidikan,
      riwayat_jabatan: riwayatJabatan,
      riwayat_plt_plh: riwayatPltPlh,
      riwayat_gaji_pokok: riwayatGajiPokok,
      riwayat_pangkat: riwayatPangkat,
      riwayat_penghargaan: riwayatPenghargaan,
      riwayat_skp: riwayatSkp,
      riwayat_hukuman_disiplin: riwayatHukumanDisiplin,
      riwayat_prestasi_pendidikan: riwayatPrestasiPendidikan,
      riwayat_narasumber: riwayatNarasumber,
      riwayat_kegiatan_strategis: riwayatKegiatanStrategis,
      riwayat_keberhasilan: riwayatKeberhasilan
    });
  } catch (routeError) {
    console.error("Detail pegawai API error:", routeError);
    return fail("Terjadi kesalahan saat memuat detail pegawai.", 500);
  }
}

export async function PUT(request, { params }) {
  try {
    const { user, error } = await requireAuth([], request);
    if (error) return error;
    await ensureSchemaWithFreshConnection();
    const { id: rawId } = await params;
    const id = parsePositiveId(rawId);
    if (!id) return fail("ID pegawai tidak valid.", 400);
    const ukpdList = await getUkpdData();
    const current = await findAllowedById(id, user, ukpdList);
    if (!current) return fail("Data pegawai tidak ditemukan atau tidak dapat diakses.", 404);
    const parsed = pegawaiPayloadSchema.safeParse(sanitizePegawaiPayload(await request.json()));
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      console.warn("Validasi edit pegawai gagal:", Object.keys(flattened.fieldErrors || {}));
      return fail("Validasi data pegawai gagal.", 422, flattened.fieldErrors);
    }
    const data = normalizePegawaiReferencePayload(parsed.data);
    const referenceValidation = await validatePegawaiReferenceFields(data, { validateRiwayat: false });
    if (!referenceValidation.valid) {
      return fail("Validasi referensi pegawai gagal.", 422, referenceValidation.errors);
    }

    const updated = { ...current, ...data, id_pegawai: Number(id) };
    const allowed = filterPegawaiByRole([updated], user, ukpdList).length === 1;
    if (!allowed) return fail("Anda tidak boleh memindahkan pegawai ke UKPD atau wilayah lain.", 403);
    const saved = await updatePegawaiData(id, data);
    const changes = buildPegawaiChanges(current, saved, data);
    await writeAuditLog({
      request,
      user,
      action: "pegawai.update",
      entityType: "pegawai",
      entityId: id,
      metadata: {
        nama: saved?.nama,
        nip: saved?.nip,
        nrk: saved?.nrk,
        nama_ukpd: saved?.nama_ukpd,
        changes
      }
    });
    return ok(saved, "Pegawai berhasil diperbarui");
  } catch (routeError) {
    console.error("Update pegawai API error:", routeError);
    return fail("Terjadi kesalahan saat memperbarui pegawai.", 500);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { user, error } = await requireAuth([], request);
    if (error) return error;
    const { id: rawId } = await params;
    const id = parsePositiveId(rawId);
    if (!id) return fail("ID pegawai tidak valid.", 400);
    const ukpdList = await getUkpdData();
    const current = await findAllowedById(id, user, ukpdList);
    if (!current) return fail("Data pegawai tidak ditemukan atau tidak dapat diakses.", 404);
    const deleted = await deletePegawaiData(id);
    await writeAuditLog({
      request,
      user,
      action: "pegawai.delete",
      entityType: "pegawai",
      entityId: id,
      metadata: { nama_ukpd: current?.nama_ukpd }
    });
    return ok(deleted, "Pegawai berhasil dihapus");
  } catch (routeError) {
    console.error("Hapus pegawai API error:", routeError);
    return fail("Terjadi kesalahan saat menghapus pegawai.", 500);
  }
}
