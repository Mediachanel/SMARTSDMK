import { ROLES } from "../constants/roles.js";

export function isKnownRole(role) {
  return Object.values(ROLES).includes(role);
}

export function canAccessAllData(user) {
  return user?.role === ROLES.SUPER_ADMIN;
}

export function normalizeScopeValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function getUkpdWilayah(ukpdName, ukpdList = []) {
  const target = normalizeScopeValue(ukpdName);
  if (!target) return "";
  return ukpdList.find((ukpd) => normalizeScopeValue(ukpd.nama_ukpd) === target)?.wilayah || "";
}

export function canAccessPegawaiRecord(user, pegawai, ukpdList = []) {
  if (!user || !pegawai || !isKnownRole(user.role)) return false;
  if (canAccessAllData(user)) return true;

  const pegawaiUkpd = normalizeScopeValue(pegawai.nama_ukpd);
  const userUkpd = normalizeScopeValue(user.nama_ukpd);

  if (user.role === ROLES.ADMIN_UKPD) {
    return Boolean(userUkpd && pegawaiUkpd && pegawaiUkpd === userUkpd);
  }

  if (user.role === ROLES.ADMIN_WILAYAH) {
    const userWilayah = normalizeScopeValue(user.wilayah);
    const pegawaiWilayah = normalizeScopeValue(pegawai.wilayah || getUkpdWilayah(pegawai.nama_ukpd, ukpdList));
    return Boolean(userWilayah && pegawaiWilayah && pegawaiWilayah === userWilayah);
  }

  return false;
}

export function filterRecordsByPegawaiScope(records = [], user, ukpdList = []) {
  if (!Array.isArray(records)) return [];
  return records.filter((record) => canAccessPegawaiRecord(user, record, ukpdList));
}
