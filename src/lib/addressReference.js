import wilayahRows from "@/data/generated/wilayah-resmi-kemendagri.json";

const NOTE_STARTERS = [
  "Perbaikan",
  "Pemekaran",
  "Perubahan",
  "Koreksi",
  "Menjadi",
  "Sesuai",
  "Semula",
  "Qanun",
  "Qonun",
  "Perda",
  "Surat",
  "PP ",
  "UU ",
  "Kepmendagri",
  "Kepmen",
  "Rekomedasi",
  "Rekomendasi"
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  const text = normalizeText(value);
  if (!text) return "";
  return text.toUpperCase();
}

function cleanOfficialName(value) {
  let text = normalizeText(value);
  for (const starter of NOTE_STARTERS) {
    const pattern = new RegExp(`\\s+${starter}\\b`, "i");
    const match = text.match(pattern);
    if (match) {
      text = text.slice(0, match.index).trim();
      break;
    }
  }
  return text.replace(/\.$/, "").trim();
}

function option(code, name) {
  return {
    code: normalizeText(code),
    name: cleanOfficialName(name)
  };
}

function sortOptions(values) {
  return values.sort((a, b) => a.name.localeCompare(b.name, "id"));
}

function buildOfficialAddressIndex() {
  const provinceMap = new Map();

  for (const row of wilayahRows) {
    const provinceCode = normalizeText(row.kode_provinsi);
    const provinceName = cleanOfficialName(row.provinsi);
    const cityCode = normalizeText(row.kode_kota_kab);
    const cityName = cleanOfficialName(row.kota_kabupaten);
    const districtCode = normalizeText(row.kode_kecamatan);
    const districtName = cleanOfficialName(row.kecamatan);
    const villageCode = normalizeText(row.kode_kelurahan);
    const villageName = cleanOfficialName(row.kelurahan);

    if (!provinceCode || !provinceName || !cityCode || !cityName || !districtCode || !districtName || !villageCode || !villageName) continue;

    if (!provinceMap.has(provinceCode)) {
      provinceMap.set(provinceCode, {
        province: option(provinceCode, provinceName),
        cities: new Map()
      });
    }

    const cityMap = provinceMap.get(provinceCode).cities;
    if (!cityMap.has(cityCode)) {
      cityMap.set(cityCode, {
        city: option(cityCode, cityName),
        districts: new Map()
      });
    }

    const districtMap = cityMap.get(cityCode).districts;
    if (!districtMap.has(districtCode)) {
      districtMap.set(districtCode, {
        district: option(districtCode, districtName),
        villages: new Map()
      });
    }

    districtMap.get(districtCode).villages.set(villageCode, option(villageCode, villageName));
  }

  return provinceMap;
}

function getAddressIndex() {
  if (!globalThis.__sisdmkOfficialAddressIndex) {
    globalThis.__sisdmkOfficialAddressIndex = buildOfficialAddressIndex();
  }
  return globalThis.__sisdmkOfficialAddressIndex;
}

function findProvinceEntry(value) {
  const key = normalizeKey(value);
  if (!key) return null;
  for (const [code, entry] of getAddressIndex().entries()) {
    if (normalizeKey(code) === key || normalizeKey(entry.province.name) === key) return entry;
  }
  return null;
}

function findCityEntry(provinsi, kotaKabupaten) {
  const provinceEntry = findProvinceEntry(provinsi);
  const cityKey = normalizeKey(kotaKabupaten);
  if (!provinceEntry || !cityKey) return null;
  for (const [code, entry] of provinceEntry.cities.entries()) {
    if (normalizeKey(code) === cityKey || normalizeKey(entry.city.name) === cityKey) return entry;
  }
  return null;
}

function findDistrictEntry(provinsi, kotaKabupaten, kecamatan) {
  const cityEntry = findCityEntry(provinsi, kotaKabupaten);
  const districtKey = normalizeKey(kecamatan);
  if (!cityEntry || !districtKey) return null;
  for (const [code, entry] of cityEntry.districts.entries()) {
    if (normalizeKey(code) === districtKey || normalizeKey(entry.district.name) === districtKey) return entry;
  }
  return null;
}

export function normalizeAddressValue(value) {
  return normalizeKey(value);
}

export function getAddressProvinces() {
  return sortOptions([...getAddressIndex().values()].map((entry) => entry.province));
}

export function getAddressCities(provinsi) {
  const provinceEntry = findProvinceEntry(provinsi);
  return provinceEntry ? sortOptions([...provinceEntry.cities.values()].map((entry) => entry.city)) : [];
}

export function getAddressDistricts(provinsi, kotaKabupaten) {
  const cityEntry = findCityEntry(provinsi, kotaKabupaten);
  return cityEntry ? sortOptions([...cityEntry.districts.values()].map((entry) => entry.district)) : [];
}

export function getAddressVillages(provinsi, kotaKabupaten, kecamatan) {
  const districtEntry = findDistrictEntry(provinsi, kotaKabupaten, kecamatan);
  return districtEntry ? sortOptions([...districtEntry.villages.values()]) : [];
}
