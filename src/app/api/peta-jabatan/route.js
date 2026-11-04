import { requireAuth } from "@/lib/auth/requireAuth";
import { fail, ok } from "@/lib/helpers/response";
import {
  createPetaJabatanPosition,
  deletePetaJabatanPosition,
  getPetaJabatanData,
  getPetaJabatanMatrixData,
  updatePetaJabatanKebutuhan,
  updatePetaJabatanPosition
} from "@/lib/petaJabatan";
import { writeAuditLog } from "@/lib/security/auditLog";

export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("view") === "matrix") {
      return ok(await getPetaJabatanMatrixData({
        user,
        requestedTemplate: searchParams.get("template")
      }));
    }
    return ok(await getPetaJabatanData({
      user,
      requestedUkpd: searchParams.get("ukpd"),
      requestedTemplate: searchParams.get("template")
    }));
  } catch (error) {
    return fail(error.message || "Peta jabatan gagal dimuat.", error.status || 500);
  }
}

export async function PATCH(request) {
  const { user, error } = await requireAuth([], request);
  if (error) return error;
  try {
    const body = await request.json();
    const updated = await updatePetaJabatanKebutuhan({
      user,
      requestedUkpd: body.ukpd,
      positionId: body.position_id,
      kebutuhanAsn: body.kebutuhan_asn,
      kebutuhanNonAsn: body.kebutuhan_non_asn
    });
    await writeAuditLog({
      request,
      user,
      action: "peta_jabatan.kebutuhan.update",
      entityType: "peta_jabatan",
      entityId: updated.id,
      metadata: {
        nama_ukpd: updated.nama_ukpd,
        kebutuhan_asn: updated.kebutuhan_asn,
        kebutuhan_non_asn: updated.kebutuhan_non_asn
      }
    });
    return ok(updated, "Angka kebutuhan berhasil diperbarui.");
  } catch (routeError) {
    return fail(routeError.message || "Angka kebutuhan gagal diperbarui.", routeError.status || 500);
  }
}

export async function POST(request) {
  const { user, error } = await requireAuth([], request);
  if (error) return error;
  try {
    const body = await request.json();
    const created = await createPetaJabatanPosition({ user, template: body.template, input: body.position });
    await writeAuditLog({ request, user, action: "peta_jabatan.structure.create", entityType: "peta_jabatan", entityId: created.id, metadata: created });
    return ok(created, "Jabatan berhasil ditambahkan untuk seluruh UKPD sejenis.");
  } catch (routeError) {
    return fail(routeError.message || "Jabatan gagal ditambahkan.", routeError.status || 500);
  }
}

export async function PUT(request) {
  const { user, error } = await requireAuth([], request);
  if (error) return error;
  try {
    const body = await request.json();
    const updated = await updatePetaJabatanPosition({ user, positionId: body.position_id, input: body.position });
    await writeAuditLog({ request, user, action: "peta_jabatan.structure.update", entityType: "peta_jabatan", entityId: updated.id, metadata: updated });
    return ok(updated, "Jabatan dan relasinya berhasil disinkronkan untuk seluruh UKPD sejenis.");
  } catch (routeError) {
    return fail(routeError.message || "Jabatan gagal diperbarui.", routeError.status || 500);
  }
}

export async function DELETE(request) {
  const { user, error } = await requireAuth([], request);
  if (error) return error;
  try {
    const body = await request.json();
    const deleted = await deletePetaJabatanPosition({ user, positionId: body.position_id });
    await writeAuditLog({ request, user, action: "peta_jabatan.structure.delete", entityType: "peta_jabatan", entityId: deleted.id, metadata: deleted });
    return ok(deleted, "Baris jabatan yang dipilih berhasil dihapus.");
  } catch (routeError) {
    return fail(routeError.message || "Jabatan gagal dihapus.", routeError.status || 500);
  }
}
