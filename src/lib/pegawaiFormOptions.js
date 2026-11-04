import { getPegawaiData, getUkpdData } from "@/lib/data/pegawaiStore";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensurePetaJabatanSchema } from "@/lib/db/ensurePetaJabatanSchema";
import { resolvePetaTemplate } from "@/lib/petaJabatan";
import { canonicalUkpd as normalizeUkpdKey } from "@/lib/ukpdNormalization";
import { ROLES } from "@/lib/constants/roles";
import {
  AGAMA_OPTIONS,
  JENIS_KONTRAK_OPTIONS,
  PANGKAT_GOLONGAN_OPTIONS,
  normalizeAgamaOption,
  normalizeJenjangPendidikanOption,
  normalizeJenisKontrakOption,
  normalizePangkatGolonganOption
} from "@/lib/pegawaiReferenceOptions";

const PENDIDIKAN_OPTIONS = ["SD", "SMP", "SMA/SMK", "D1", "D2", "D3", "D4", "S1", "PROFESI", "S2", "SPESIALIS", "SUBSPESIALIS", "S3"];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
}

function addError(errors, field, message) {
  if (!errors[field]) {
    errors[field] = [];
  }
  errors[field].push(message);
}

function validateValue(errors, field, value, allowed, message, normalize = normalizeText) {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return;
  const normalizedAllowed = new Set((allowed || []).map((item) => normalize(item)).filter(Boolean));
  if (!normalizedAllowed.has(normalizedValue)) {
    addError(errors, field, message);
  }
}

function filterUkpdRowsForUser(ukpdRows, user, context = "pegawai") {
  // Mutasi needs the complete destination list; ownership still applies to the origin on save.
  if (context === "mutasi") return ukpdRows;
  if (!user) return ukpdRows;
  if (user.role === ROLES.ADMIN_UKPD) {
    return ukpdRows.filter((item) => normalizeUpper(item.nama_ukpd) === normalizeUpper(user.nama_ukpd));
  }
  if (user.role === ROLES.ADMIN_WILAYAH) {
    return ukpdRows.filter((item) => normalizeUpper(item.wilayah) === normalizeUpper(user.wilayah));
  }
  return ukpdRows;
}

export async function getPegawaiFormOptions({ user = null, context = "pegawai" } = {}) {
  const [pegawaiRows, ukpdRows, pool] = await Promise.all([getPegawaiData(), getUkpdData(), getConnectedPool()]);
  const visibleUkpdRows = filterUkpdRowsForUser(ukpdRows, user, context);
  await ensurePetaJabatanSchema(pool);
  const [petaRows] = await pool.query(`
    SELECT id, template_ukpd, nama_ukpd_source, nama_jabatan_orb,
           nama_jabatan_menpan, atasan_langsung, rumpun_jabatan
    FROM peta_jabatan
    ORDER BY template_ukpd, urutan, id
  `);

  const statusRumpunOptions = uniqueSorted(petaRows.map((item) => item.rumpun_jabatan));
  const ukpdOptions = uniqueSorted(visibleUkpdRows.map((item) => item.nama_ukpd));
  const pendidikanOptions = uniqueSorted([...PENDIDIKAN_OPTIONS, ...pegawaiRows.map((item) => normalizeJenjangPendidikanOption(item.jenjang_pendidikan))]);
  const jabatanMenpanOptions = uniqueSorted(petaRows.map((item) => item.nama_jabatan_menpan));
  const jabatanOrbOptions = uniqueSorted(petaRows.map((item) => item.nama_jabatan_orb));
  const atasanLangsungOptions = uniqueSorted(petaRows.map((item) => item.atasan_langsung));
  const petaUkpdTemplates = Object.fromEntries(visibleUkpdRows.map((item) => [normalizeUpper(item.nama_ukpd), resolvePetaTemplate(item)]));
  const petaJabatanOptions = petaRows.map((item) => ({
    id: item.id,
    template_ukpd: item.template_ukpd,
    nama_ukpd_source: item.nama_ukpd_source || "",
    nama_jabatan_orb: item.nama_jabatan_orb || "",
    nama_jabatan_menpan: item.nama_jabatan_menpan || "",
    status_rumpun: item.rumpun_jabatan || "",
    struktur_atasan_langsung: item.atasan_langsung || ""
  }));

  return {
    agamaOptions: AGAMA_OPTIONS,
    jenisKontrakOptions: JENIS_KONTRAK_OPTIONS,
    pendidikanOptions,
    statusRumpunOptions,
    jabatanMenpanOptions,
    jabatanStandarOptions: jabatanMenpanOptions,
    jabatanOrbOptions,
    atasanLangsungOptions,
    petaJabatanOptions,
    petaUkpdTemplates,
    pangkatGolonganOptions: PANGKAT_GOLONGAN_OPTIONS,
    ukpdOptions,
    currentUser: user ? {
      role: user.role || "",
      nama_ukpd: user.nama_ukpd || "",
      wilayah: user.wilayah || ""
    } : null,
    defaultPegawai: user?.role === ROLES.ADMIN_UKPD && user.nama_ukpd ? {
      nama_ukpd: user.nama_ukpd
    } : {}
  };
}

export async function validatePegawaiReferenceFields(payload, { validateRiwayat = true } = {}) {
  const options = await getPegawaiFormOptions();
  const errors = {};
  const isPjlp = normalizeUpper(payload?.jenis_pegawai) === "PJLP";

  const checks = [
    ["agama", options.agamaOptions, normalizeAgamaOption, "Agama harus dipilih dari daftar yang tersedia."],
    ["jenis_kontrak", options.jenisKontrakOptions, normalizeJenisKontrakOption, "Jenis kontrak harus dipilih dari daftar yang tersedia."],
    ["status_rumpun", options.statusRumpunOptions, normalizeUpper],
    ["nama_jabatan_menpan", options.jabatanMenpanOptions, normalizeUpper, "Jabatan Kepmenpan harus dipilih dari Peta Jabatan."],
    ["nama_jabatan_orb", options.jabatanOrbOptions, normalizeUpper, "Jabatan ORB/Pergub harus dipilih dari Peta Jabatan."],
    ["struktur_atasan_langsung", options.atasanLangsungOptions, normalizeUpper, "Atasan langsung harus dipilih dari Peta Jabatan."],
    ["pangkat_golongan", options.pangkatGolonganOptions, normalizePangkatGolonganOption],
    ["nama_ukpd", options.ukpdOptions]
  ].filter(([field]) => !isPjlp || !["status_rumpun", "nama_jabatan_menpan", "nama_jabatan_orb", "struktur_atasan_langsung"].includes(field));

  for (const [field, allowed, normalize = normalizeText, message] of checks) {
    validateValue(errors, field, payload?.[field], allowed, message || `${field} harus dipilih dari daftar yang tersedia.`, normalize);
  }

  const selectedUkpd = normalizeText(payload?.nama_ukpd);
  const selectedTemplate = options.petaUkpdTemplates?.[normalizeUpper(selectedUkpd)];
  const ukpdKey = normalizeUkpdKey(selectedUkpd);
  const scopedPetaRows = (options.petaJabatanOptions || []).filter((item) => {
    if (!selectedTemplate || item.template_ukpd !== selectedTemplate) return false;
    const sourceKey = normalizeUkpdKey(item.nama_ukpd_source);
    return !sourceKey || sourceKey === ukpdKey;
  });
  const selectedOrb = normalizeUpper(payload?.nama_jabatan_orb);
  const matchingPositions = scopedPetaRows.filter((item) => normalizeUpper(item.nama_jabatan_orb) === selectedOrb);
  if (!isPjlp && selectedUkpd && selectedOrb && !matchingPositions.length) {
    addError(errors, "nama_jabatan_orb", "Jabatan ORB/Pergub tidak tersedia pada Peta Jabatan UKPD yang dipilih.");
  } else if (!isPjlp && matchingPositions.length) {
    const selectedRumpun = normalizeUpper(payload?.status_rumpun);
    const selectedAtasan = normalizeUpper(payload?.struktur_atasan_langsung);
    const selectedMenpan = normalizeUpper(payload?.nama_jabatan_menpan);
    if (selectedMenpan && !matchingPositions.some((item) => normalizeUpper(item.nama_jabatan_menpan) === selectedMenpan)) {
      addError(errors, "nama_jabatan_menpan", "Jabatan Kepmenpan tidak sesuai dengan posisi pada Peta Jabatan.");
    }
    if (selectedRumpun && !matchingPositions.some((item) => normalizeUpper(item.status_rumpun) === selectedRumpun)) {
      addError(errors, "status_rumpun", "Rumpun Jabatan tidak sesuai dengan posisi pada Peta Jabatan.");
    }
    if (selectedAtasan && !matchingPositions.some((item) => normalizeUpper(item.struktur_atasan_langsung) === selectedAtasan)) {
      addError(errors, "struktur_atasan_langsung", "Atasan Langsung tidak sesuai dengan posisi pada Peta Jabatan.");
    }
  }

  validateValue(
    errors,
    "jenjang_pendidikan",
    payload?.jenjang_pendidikan,
    options.pendidikanOptions,
    "Jenjang pendidikan harus dipilih dari daftar yang tersedia.",
    normalizeUpper
  );

  if (validateRiwayat) {
    for (const [index, row] of Array.isArray(payload?.riwayat_pendidikan) ? payload.riwayat_pendidikan.entries() : []) {
      validateValue(
        errors,
        `riwayat_pendidikan.${index}.jenjang_pendidikan`,
        row?.jenjang_pendidikan,
        options.pendidikanOptions,
        "Jenjang pendidikan riwayat harus dipilih dari daftar yang tersedia.",
        normalizeUpper
      );
    }

    for (const [index, row] of Array.isArray(payload?.riwayat_prestasi_pendidikan) ? payload.riwayat_prestasi_pendidikan.entries() : []) {
      validateValue(
        errors,
        `riwayat_prestasi_pendidikan.${index}.jenjang_pendidikan`,
        row?.jenjang_pendidikan,
        options.pendidikanOptions,
        "Jenjang pendidikan prestasi harus dipilih dari daftar yang tersedia.",
        normalizeUpper
      );
    }

    for (const [index, row] of Array.isArray(payload?.riwayat_jabatan) ? payload.riwayat_jabatan.entries() : []) {
      validateValue(errors, `riwayat_jabatan.${index}.nama_ukpd`, row?.nama_ukpd, options.ukpdOptions, "UKPD riwayat jabatan harus dipilih dari daftar yang tersedia.");
      if (!isPjlp) {
        validateValue(errors, `riwayat_jabatan.${index}.status_rumpun`, row?.status_rumpun, options.statusRumpunOptions, "Rumpun riwayat jabatan harus dipilih dari daftar yang tersedia.");
        validateValue(errors, `riwayat_jabatan.${index}.nama_jabatan_menpan`, row?.nama_jabatan_menpan, options.jabatanMenpanOptions, "Jabatan Kepmenpan 11 riwayat harus dipilih dari master jabatan Kepmenpan.", normalizeText);
        validateValue(errors, `riwayat_jabatan.${index}.nama_jabatan_orb`, row?.nama_jabatan_orb, options.jabatanOrbOptions, "Jabatan Pergub 1 Tahun 2017 riwayat harus dipilih dari daftar yang tersedia.");
      }
      validateValue(errors, `riwayat_jabatan.${index}.pangkat_golongan`, row?.pangkat_golongan, options.pangkatGolonganOptions, "Pangkat/golongan riwayat jabatan harus dipilih dari daftar yang tersedia.", normalizePangkatGolonganOption);
    }

    for (const [index, row] of Array.isArray(payload?.riwayat_pangkat) ? payload.riwayat_pangkat.entries() : []) {
      validateValue(errors, `riwayat_pangkat.${index}.pangkat_golongan`, row?.pangkat_golongan, options.pangkatGolonganOptions, "Pangkat/golongan riwayat pangkat harus dipilih dari daftar yang tersedia.", normalizePangkatGolonganOption);
    }

    for (const [index, row] of Array.isArray(payload?.riwayat_gaji_pokok) ? payload.riwayat_gaji_pokok.entries() : []) {
      validateValue(errors, `riwayat_gaji_pokok.${index}.pangkat_golongan`, row?.pangkat_golongan, options.pangkatGolonganOptions, "Pangkat/golongan riwayat gaji harus dipilih dari daftar yang tersedia.", normalizePangkatGolonganOption);
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    options
  };
}
