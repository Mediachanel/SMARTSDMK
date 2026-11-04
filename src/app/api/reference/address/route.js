import {
  getAddressCities,
  getAddressDistricts,
  getAddressProvinces,
  getAddressVillages
} from "@/lib/addressReference";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ok } from "@/lib/helpers/response";

export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const provinsi = searchParams.get("provinsi") || "";
  const kotaKabupaten = searchParams.get("kota_kabupaten") || "";
  const kecamatan = searchParams.get("kecamatan") || "";

  if (!provinsi) {
    return ok({ level: "provinsi", options: getAddressProvinces() });
  }

  if (!kotaKabupaten) {
    return ok({ level: "kota_kabupaten", options: getAddressCities(provinsi) });
  }

  if (!kecamatan) {
    return ok({ level: "kecamatan", options: getAddressDistricts(provinsi, kotaKabupaten) });
  }

  return ok({ level: "kelurahan", options: getAddressVillages(provinsi, kotaKabupaten, kecamatan) });
}
