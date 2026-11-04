import { ROLES } from "@/lib/constants/roles";
import { filterRecordsByPegawaiScope, getUkpdWilayah } from "@/lib/rbac/scope";

export function canAccessMenu(role, allowedRoles = []) {
  return allowedRoles.includes(role);
}

export function filterPegawaiByRole(pegawai, user, ukpdList = []) {
  return filterRecordsByPegawaiScope(pegawai, user, ukpdList);
}

export function getPegawaiWilayah(pegawai, ukpdList = []) {
  return pegawai.wilayah || getUkpdWilayah(pegawai.nama_ukpd, ukpdList) || "-";
}
