import crypto from "node:crypto";
import wilayahRows from "@/data/generated/wilayah-resmi-kemendagri.json";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

const FRONT_TITLE_PATTERN = /^\s*(drg|dr|apt|ns)\.\s*/i;
const FRONT_TITLE_KEYS = new Set(["dr", "drg", "apt", "ns"]);

function normalizeFrontTitle(value) {
  const key = String(value || "").replace(/[^a-z]/gi, "").toLowerCase();
  if (key === "dr") return "dr.";
  if (key === "drg") return "drg.";
  if (key === "apt") return "Apt.";
  if (key === "ns") return "Ns.";
  return normalizeText(value);
}

function splitLeadingFrontTitles(value) {
  const original = normalizeText(value);
  let remaining = original;
  const titles = [];

  while (remaining) {
    const match = remaining.match(FRONT_TITLE_PATTERN);
    if (!match) break;
    titles.push(normalizeFrontTitle(match[1]));
    remaining = remaining.slice(match[0].length).trim();
  }

  const tokens = remaining.split(/\s+/).filter(Boolean);
  while (tokens.length) {
    const key = tokens[0].replace(/[^a-z]/gi, "").toLowerCase();
    if (!FRONT_TITLE_KEYS.has(key)) break;
    titles.push(normalizeFrontTitle(tokens[0]));
    tokens.shift();
    remaining = tokens.join(" ");
  }

  return {
    gelar_depan: titles.join(", "),
    nama: normalizeText(remaining) || original,
  };
}

function normalizePegawaiTitle(pegawai = {}) {
  const splitNama = splitLeadingFrontTitles(pegawai.nama);
  const splitNamaLengkap = splitLeadingFrontTitles(pegawai.nama_lengkap);
  const splitSource = splitNama.gelar_depan ? splitNama : splitNamaLengkap;

  return {
    ...pegawai,
    nama: splitSource.gelar_depan ? splitSource.nama : pegawai.nama,
    gelar_depan: normalizeNullableText(pegawai.gelar_depan) || normalizeNullableText(splitSource.gelar_depan),
  };
}

function normalizeAddressToken(value) {
  return normalizeText(value)
    .replace(/[.,;:()/-]+/g, " ")
    .replace(/\bKEL(?:URAHAN)?\b/gi, " ")
    .replace(/\bKEC(?:AMATAN)?\b/gi, " ")
    .replace(/\bKOTA\b/gi, " ")
    .replace(/\bKAB(?:UPATEN)?\b/gi, " ")
    .replace(/\bADMINISTRASI\b/gi, " ")
    .replace(/\bPROV(?:INSI)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cleanAddressPart(value) {
  return normalizeText(value)
    .replace(/^(kel(?:urahan)?|kec(?:amatan)?|kota|kab(?:upaten)?|prov(?:insi)?)\.?\s*/i, "")
    .replace(/[.,;:\s]+$/g, "")
    .trim();
}

function normalizeCityName(value) {
  const text = cleanAddressPart(value);
  const key = normalizeAddressToken(text);
  if (!key) return null;
  if (key.includes("KEPULAUAN SERIBU")) return "Kepulauan Seribu";
  const jakartaMatch = key.match(/JAKARTA\s+(PUSAT|UTARA|BARAT|SELATAN|TIMUR)/);
  if (!jakartaMatch) return text;
  return `Jakarta ${jakartaMatch[1].charAt(0)}${jakartaMatch[1].slice(1).toLowerCase()}`;
}

function normalizeProvinceName(value) {
  const key = normalizeAddressToken(value);
  if (!key) return null;
  if (key === "JAKARTA" || key.includes("DKI JAKARTA") || key.includes("DAERAH KHUSUS IBUKOTA JAKARTA")) {
    return "DKI Jakarta";
  }
  return cleanAddressPart(value);
}

function getDkiAddressRows() {
  if (!globalThis.__sisdmkDkiAddressRows) {
    globalThis.__sisdmkDkiAddressRows = wilayahRows
      .filter((row) => normalizeAddressToken(row.provinsi).includes("DKI JAKARTA"))
      .map((row) => ({
        ...row,
        provinsi: "DKI Jakarta",
        kota_kabupaten: normalizeCityName(row.kota_kabupaten) || row.kota_kabupaten,
        _cityKey: normalizeAddressToken(normalizeCityName(row.kota_kabupaten) || row.kota_kabupaten),
        _districtKey: normalizeAddressToken(row.kecamatan),
        _villageKey: normalizeAddressToken(row.kelurahan)
      }));
  }
  return globalThis.__sisdmkDkiAddressRows;
}

function normalizedTextContains(textKey, partKey) {
  return Boolean(partKey) && new RegExp(`(?:^|\\s)${partKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(textKey);
}

function findBestDkiAddressMatch(rawAddress, cityName = "") {
  const textKey = normalizeAddressToken(rawAddress);
  if (!textKey) return null;
  const cityKey = normalizeAddressToken(cityName);
  let best = null;

  for (const row of getDkiAddressRows()) {
    if (cityKey && normalizeAddressToken(row.kota_kabupaten) !== cityKey && !normalizedTextContains(textKey, row._cityKey)) {
      continue;
    }
    const hasDistrict = normalizedTextContains(textKey, row._districtKey);
    const hasVillage = normalizedTextContains(textKey, row._villageKey);
    const hasCity = normalizedTextContains(textKey, row._cityKey) || Boolean(cityKey);
    if (!hasCity || (!hasVillage && !hasDistrict)) continue;

    const score = (hasVillage ? 1000 + row._villageKey.length : 0)
      + (hasDistrict ? 100 + row._districtKey.length : 0)
      + (hasCity ? 10 : 0);
    if (!best || score > best.score) best = { row, score, hasVillage, hasDistrict };
  }

  return best?.row || null;
}

function removeAddressSegment(text, segment) {
  const cleanSegment = cleanAddressPart(segment);
  if (!cleanSegment) return text;
  const escaped = cleanSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return text
    .replace(new RegExp(`\\b(?:kel(?:urahan)?|kel\\.|kec(?:amatan)?|kec\\.|kota|kab(?:upaten)?|prov(?:insi)?)\\s*:?\\s*${escaped}\\b`, "ig"), " ")
    .replace(new RegExp(`[,;\\s]+${escaped}\\s*$`, "i"), " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,;])/g, "$1")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

function extractLabeledAddressPart(text, labelPattern, stopPattern) {
  const match = text.match(new RegExp(`\\b${labelPattern}\\s*:?\\s*(.+?)(?=\\s+(?:${stopPattern})\\b|[,;]|$)`, "i"));
  return match ? cleanAddressPart(match[1]) : "";
}

function parseDrhAddress(rawAddress) {
  const raw = normalizeText(rawAddress);
  if (!raw) {
    return {
      jalan: null,
      kelurahan: null,
      kecamatan: null,
      kota_kabupaten: null,
      provinsi: null,
      kode_provinsi: null,
      kode_kota_kab: null,
      kode_kecamatan: null,
      kode_kelurahan: null
    };
  }

  const cityPattern = "(?:KOTA\\s+ADMINISTRASI\\s+)?JAKARTA\\s+(?:PUSAT|UTARA|BARAT|SELATAN|TIMUR)|(?:KAB(?:UPATEN)?\\s+ADMINISTRASI\\s+)?KEPULAUAN\\s+SERIBU";
  const stopPattern = `KEL(?:URAHAN)?\\.?|KEC(?:AMATAN)?\\.?|KOTA|KAB(?:UPATEN)?\\.?|PROV(?:INSI)?\\.?|${cityPattern}|DKI\\s+JAKARTA|DAERAH\\s+KHUSUS\\s+IBUKOTA\\s+JAKARTA`;
  const kelurahan = extractLabeledAddressPart(raw, "KEL(?:URAHAN)?\\.?", stopPattern);
  const kecamatan = extractLabeledAddressPart(raw, "KEC(?:AMATAN)?\\.?", stopPattern);
  const cityMatch = raw.match(new RegExp(`\\b(${cityPattern})\\b`, "i"));
  const explicitCity = cityMatch ? normalizeCityName(cityMatch[1]) : null;
  const provinceMatch = raw.match(/\b(?:PROV(?:INSI)?\.?\s*)?(DKI\s+JAKARTA|DAERAH\s+KHUSUS\s+IBUKOTA\s+JAKARTA)\b/i);
  const explicitProvince = provinceMatch ? normalizeProvinceName(provinceMatch[1]) : null;
  const official = findBestDkiAddressMatch(raw, explicitCity || "");

  const parsed = {
    jalan: raw,
    kelurahan: kelurahan || official?.kelurahan || null,
    kecamatan: kecamatan || official?.kecamatan || null,
    kota_kabupaten: explicitCity || official?.kota_kabupaten || null,
    provinsi: explicitProvince || official?.provinsi || (explicitCity || official ? "DKI Jakarta" : null),
    kode_provinsi: official?.kode_provinsi || null,
    kode_kota_kab: official?.kode_kota_kab || null,
    kode_kecamatan: official?.kode_kecamatan || null,
    kode_kelurahan: official?.kode_kelurahan || null
  };

  for (const part of [
    kelurahan,
    kecamatan,
    cityMatch?.[1],
    provinceMatch?.[1]
  ]) {
    parsed.jalan = removeAddressSegment(parsed.jalan, part);
  }

  parsed.jalan = normalizeNullableText(parsed.jalan) || raw;
  return parsed;
}

function normalizePersonName(value) {
  const text = normalizeText(value);
  if (!text) return null;

  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeIdentifier(value) {
  const text = normalizeText(value);
  if (!text) return "";
  return text.replace(/[`'".\s-]+/g, "");
}

function normalizeComparableName(value) {
  const text = normalizeText(value);
  if (!text) return "";
  return text.toUpperCase();
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return text;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizeDecimal(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function hashToInt(value) {
  const hex = hashText(value).slice(0, 12);
  return Number.parseInt(hex, 16) % 2000000000;
}

function sourceKeyFor(idPegawai, section, payload) {
  return `drh_pdf:${idPegawai}:${section}:${hashText(JSON.stringify(payload))}`;
}

function compareIsoDateDesc(left, right) {
  const a = normalizeDate(left) || "";
  const b = normalizeDate(right) || "";
  return b.localeCompare(a);
}

function pickLatestByDate(items, field) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return [...items].sort((left, right) => compareIsoDateDesc(left?.[field], right?.[field]))[0] || null;
}

function pickHighestFormalEducation(items) {
  const formal = (Array.isArray(items) ? items : []).filter((item) => normalizeText(item?.jenis_riwayat).toLowerCase() === "formal");
  return formal[formal.length - 1] || formal[0] || null;
}

async function nextPegawaiId(connection) {
  const [[row]] = await connection.query("SELECT COALESCE(MAX(`id_pegawai`), 0) + 1 AS next_id FROM `pegawai`");
  return Number(row?.next_id || 1);
}

async function nextAlamatId(connection) {
  const [[row]] = await connection.query("SELECT COALESCE(MAX(`id`), 0) + 1 AS next_id FROM `alamat`");
  return Number(row?.next_id || 1);
}

async function findUkpd(connection, unitKerja) {
  const normalized = normalizeText(unitKerja);
  if (!normalized) return null;
  const [rows] = await connection.query(
    "SELECT `id_ukpd`, `nama_ukpd`, `jenis_ukpd`, `wilayah` FROM `ukpd` WHERE UPPER(TRIM(`nama_ukpd`)) = UPPER(TRIM(?)) LIMIT 1",
    [normalized]
  );
  return rows[0] || null;
}

async function findPegawai(connection, pegawai) {
  const normalizedNip = normalizeIdentifier(pegawai?.nip);
  const normalizedNrk = normalizeIdentifier(pegawai?.nrk);
  const normalizedNama = normalizeComparableName(pegawai?.nama || pegawai?.nama_lengkap);
  const matches = new Map();

  const pushMatches = (rows) => {
    for (const row of rows) {
      matches.set(Number(row.id_pegawai), row);
    }
  };

  if (normalizedNip) {
    const [rows] = await connection.query(
      "SELECT * FROM `pegawai` WHERE REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(`nip`, '')), '`', ''), ' ', ''), '-', ''), '.', '') = ?",
      [normalizedNip]
    );
    pushMatches(rows);
  }

  if (normalizedNrk) {
    const [rows] = await connection.query(
      "SELECT * FROM `pegawai` WHERE REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(`nrk`, '')), '`', ''), ' ', ''), '-', ''), '.', '') = ?",
      [normalizedNrk]
    );
    pushMatches(rows);
  }

  if (normalizedNama) {
    const [rows] = await connection.query(
      "SELECT * FROM `pegawai` WHERE UPPER(TRIM(COALESCE(`nama`, ''))) = ?",
      [normalizedNama]
    );
    pushMatches(rows);
  }

  const candidates = [...matches.values()];
  if (!candidates.length) return null;

  const scoreCandidate = (row) => {
    let score = 0;
    if (normalizedNip && normalizeIdentifier(row?.nip) === normalizedNip) score += 4;
    if (normalizedNrk && normalizeIdentifier(row?.nrk) === normalizedNrk) score += 3;
    if (normalizedNama && normalizeComparableName(row?.nama) === normalizedNama) score += 2;
    return score;
  };

  candidates.sort((left, right) => {
    const scoreDiff = scoreCandidate(right) - scoreCandidate(left);
    if (scoreDiff !== 0) return scoreDiff;
    return Number(left.id_pegawai) - Number(right.id_pegawai);
  });

  return candidates[0] || null;
}

function assertAllowedUkpdImport({ allowedUkpdName, existing, ukpd, parsedUnitKerja }) {
  const allowed = normalizeComparableName(allowedUkpdName);
  if (!allowed) return;
  const deny = (message) => {
    const error = new Error(message);
    error.status = 403;
    throw error;
  };

  if (existing?.nama_ukpd && normalizeComparableName(existing.nama_ukpd) !== allowed) {
    deny(
      `Admin UKPD hanya dapat import DRH pegawai dari UKPD miliknya. Pegawai ini sudah terdaftar di database pada UKPD "${existing.nama_ukpd}", sedangkan UKPD akun Anda "${allowedUkpdName}". Jika pegawai memang pindah unit, ubah UKPD pegawai lewat Data Pegawai atau gunakan akun Super Admin.`
    );
  }

  if (ukpd?.nama_ukpd && normalizeComparableName(ukpd.nama_ukpd) !== allowed) {
    deny(
      `Unit kerja pada PDF DRH tidak sesuai dengan UKPD akun Anda. Unit kerja terbaca/diedit "${ukpd.nama_ukpd}", sedangkan UKPD akun Anda "${allowedUkpdName}".`
    );
  }

  if (!existing && !ukpd) {
    deny(
      `Unit kerja pada PDF DRH "${normalizeText(parsedUnitKerja) || "-"}" tidak ditemukan di referensi UKPD. Admin UKPD belum dapat membuat data pegawai tanpa UKPD yang valid sesuai akun "${allowedUkpdName}".`
    );
  }
}

async function upsertPegawai(connection, parsed, options = {}) {
  const pegawai = parsed?.pegawai || {};
  const latestPangkat = pickLatestByDate(parsed?.riwayat_pangkat, "tmt_pangkat");
  const latestJabatan = pickLatestByDate(parsed?.riwayat_jabatan, "tmt_jabatan");
  const latestEducation = pickHighestFormalEducation(parsed?.riwayat_pendidikan);
  const ukpd = await findUkpd(connection, pegawai.unit_kerja);
  const existing = await findPegawai(connection, pegawai);
  assertAllowedUkpdImport({ allowedUkpdName: options.allowedUkpdName, existing, ukpd, parsedUnitKerja: pegawai.unit_kerja });

  const baseData = {
    nama: normalizePersonName(pegawai.nama || pegawai.nama_lengkap),
    gelar_depan: normalizeNullableText(pegawai.gelar_depan),
    gelar_belakang: normalizeNullableText(pegawai.gelar_belakang),
    nrk: normalizeNullableText(pegawai.nrk),
    nip: normalizeNullableText(pegawai.nip),
    tempat_lahir: normalizeNullableText(pegawai.tempat_lahir),
    tanggal_lahir: normalizeDate(pegawai.tanggal_lahir),
    agama: normalizeNullableText(pegawai.agama),
    jenis_kelamin: normalizeNullableText(pegawai.jenis_kelamin),
    status_perkawinan: normalizeNullableText(pegawai.status_pernikahan),
    nama_jabatan_menpan: normalizeNullableText(pegawai.jabatan || latestJabatan?.nama_jabatan_menpan),
    pangkat_golongan: normalizeNullableText(latestPangkat?.pangkat_golongan || latestJabatan?.pangkat_golongan),
    jenjang_pendidikan: normalizeNullableText(latestEducation?.jenjang_pendidikan),
    program_studi: normalizeNullableText(latestEducation?.program_studi),
    nama_universitas: normalizeNullableText(latestEducation?.nama_universitas || latestEducation?.nama_institusi),
    email: normalizeNullableText(pegawai.email),
    no_hp_pegawai: normalizeNullableText(pegawai.no_hp),
    kondisi: existing?.kondisi || "Aktif",
    jenis_pegawai: existing?.jenis_pegawai || (normalizeText(pegawai.nip) ? "PNS" : "Pegawai"),
    id_ukpd: ukpd?.id_ukpd || existing?.id_ukpd || null,
    ukpd_id: ukpd?.id_ukpd || existing?.ukpd_id || null,
    nama_ukpd: ukpd?.nama_ukpd || existing?.nama_ukpd || null,
    jenis_ukpd: ukpd?.jenis_ukpd || existing?.jenis_ukpd || null,
    wilayah: ukpd?.wilayah || existing?.wilayah || null,
  };

  if (existing) {
    const mutableEntries = Object.entries(baseData).filter(([, value]) => value !== undefined && value !== null);
    if (mutableEntries.length) {
      await connection.query(
        `UPDATE \`pegawai\` SET ${mutableEntries.map(([key]) => `\`${key}\` = ?`).join(", ")} WHERE \`id_pegawai\` = ?`,
        [...mutableEntries.map(([, value]) => value), Number(existing.id_pegawai)]
      );
    }
    return {
      id_pegawai: Number(existing.id_pegawai),
      nip: baseData.nip || existing.nip || null,
      nama: baseData.nama || existing.nama || null,
      created: false,
    };
  }

  const idPegawai = await nextPegawaiId(connection);
  const insertData = {
    id_pegawai: idPegawai,
    nama: baseData.nama || normalizePersonName(pegawai.nama_lengkap) || `Pegawai ${idPegawai}`,
    jenis_pegawai: baseData.jenis_pegawai,
    nama_ukpd: baseData.nama_ukpd,
    id_ukpd: baseData.id_ukpd,
    ukpd_id: baseData.ukpd_id,
    jenis_ukpd: baseData.jenis_ukpd,
    wilayah: baseData.wilayah,
    nrk: baseData.nrk,
    nip: baseData.nip,
    tempat_lahir: baseData.tempat_lahir,
    tanggal_lahir: baseData.tanggal_lahir,
    agama: baseData.agama,
    jenis_kelamin: baseData.jenis_kelamin,
    status_perkawinan: baseData.status_perkawinan,
    nama_jabatan_menpan: baseData.nama_jabatan_menpan,
    pangkat_golongan: baseData.pangkat_golongan,
    jenjang_pendidikan: baseData.jenjang_pendidikan,
    program_studi: baseData.program_studi,
    nama_universitas: baseData.nama_universitas,
    email: baseData.email,
    no_hp_pegawai: baseData.no_hp_pegawai,
    kondisi: baseData.kondisi,
    gelar_depan: baseData.gelar_depan,
    gelar_belakang: baseData.gelar_belakang,
    created_at: new Date().toISOString().slice(0, 10),
  };

  const columns = Object.keys(insertData);
  await connection.query(
    `INSERT INTO \`pegawai\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((column) => insertData[column] ?? null)
  );

  return {
    id_pegawai: idPegawai,
    nip: insertData.nip || null,
    nama: insertData.nama || null,
    created: true,
  };
}

async function upsertDomisiliAlamat(connection, idPegawai, alamat) {
  const parsed = parseDrhAddress(alamat);
  if (!parsed.jalan) return false;

  const [rows] = await connection.query(
    "SELECT * FROM `alamat` WHERE `id_pegawai` = ? AND LOWER(`tipe`) = 'domisili' ORDER BY `id` ASC",
    [Number(idPegawai)]
  );
  const existing = rows[0] || null;

  if (existing) {
    await connection.query(
      `UPDATE \`alamat\`
       SET
         \`jalan\` = ?,
         \`kelurahan\` = COALESCE(?, \`kelurahan\`),
         \`kecamatan\` = COALESCE(?, \`kecamatan\`),
         \`kota_kabupaten\` = COALESCE(?, \`kota_kabupaten\`),
         \`provinsi\` = COALESCE(?, \`provinsi\`),
         \`kode_provinsi\` = COALESCE(?, \`kode_provinsi\`),
         \`kode_kota_kab\` = COALESCE(?, \`kode_kota_kab\`),
         \`kode_kecamatan\` = COALESCE(?, \`kode_kecamatan\`),
         \`kode_kelurahan\` = COALESCE(?, \`kode_kelurahan\`)
       WHERE \`id\` = ?`,
      [
        parsed.jalan,
        parsed.kelurahan,
        parsed.kecamatan,
        parsed.kota_kabupaten,
        parsed.provinsi,
        parsed.kode_provinsi,
        parsed.kode_kota_kab,
        parsed.kode_kecamatan,
        parsed.kode_kelurahan,
        Number(existing.id)
      ]
    );
    return true;
  }

  const nextId = await nextAlamatId(connection);
  await connection.query(
    `INSERT INTO \`alamat\` (
      \`id\`, \`id_pegawai\`, \`tipe\`, \`jalan\`, \`kelurahan\`, \`kecamatan\`, \`kota_kabupaten\`, \`provinsi\`,
      \`kode_provinsi\`, \`kode_kota_kab\`, \`kode_kecamatan\`, \`kode_kelurahan\`, \`created_at\`
    ) VALUES (?, ?, 'domisili', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nextId,
      Number(idPegawai),
      parsed.jalan,
      parsed.kelurahan,
      parsed.kecamatan,
      parsed.kota_kabupaten,
      parsed.provinsi,
      parsed.kode_provinsi,
      parsed.kode_kota_kab,
      parsed.kode_kecamatan,
      parsed.kode_kelurahan,
      new Date().toISOString().slice(0, 10)
    ]
  );
  return true;
}

async function replaceKeluargaFromDrh(connection, idPegawai, keluargaItems) {
  await connection.query("DELETE FROM `keluarga` WHERE `id_pegawai` = ? AND `sumber_tabel` = 'drh_pdf_keluarga'", [Number(idPegawai)]);
  let inserted = 0;
  for (const [index, item] of (Array.isArray(keluargaItems) ? keluargaItems : []).entries()) {
    const payload = {
      hubungan: normalizeText(item.hubungan),
      hubungan_detail: normalizeText(item.hubungan_detail),
      urutan: item.urutan || index + 1,
      nama: normalizeText(item.nama),
      tanggal_lahir: normalizeDate(item.tanggal_lahir),
    };
    await connection.query(
      `INSERT INTO \`keluarga\`
       (\`id_pegawai\`, \`hubungan\`, \`hubungan_detail\`, \`status_punya\`, \`status_tunjangan\`, \`urutan\`, \`nama\`, \`jenis_kelamin\`, \`tempat_lahir\`, \`tanggal_lahir\`, \`no_tlp\`, \`email\`, \`pekerjaan\`, \`sumber_tabel\`, \`sumber_id\`, \`created_at\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'drh_pdf_keluarga', ?, NOW())`,
      [
        Number(idPegawai),
        normalizeNullableText(item.hubungan),
        normalizeNullableText(item.hubungan_detail),
        normalizeNullableText(item.status_punya),
        normalizeNullableText(item.status_tunjangan),
        item.urutan ? Number(item.urutan) : null,
        normalizePersonName(item.nama),
        normalizeNullableText(item.jenis_kelamin),
        normalizeNullableText(item.tempat_lahir),
        normalizeDate(item.tanggal_lahir),
        normalizeNullableText(item.pekerjaan),
        hashToInt(`${idPegawai}|keluarga|${JSON.stringify(payload)}`)
      ]
    );
    inserted += 1;
  }
  return inserted;
}

async function replaceSectionRows(connection, { table, idPegawai, rows, buildRecord }) {
  await connection.query(`DELETE FROM \`${table}\` WHERE \`id_pegawai\` = ? AND \`sumber\` = 'drh_pdf'`, [Number(idPegawai)]);
  let inserted = 0;
  const seenSourceKeys = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const record = buildRecord(row);
    const sourceKey = normalizeText(record.source_key);
    if (sourceKey && seenSourceKeys.has(sourceKey)) {
      continue;
    }

    const columns = Object.keys(record);
    const updateColumns = columns.filter((column) => column !== "id" && column !== "source_key" && column !== "created_at");
    await connection.query(
      `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})
       ON CONFLICT (\`source_key\`) DO UPDATE SET ${updateColumns.map((column) => `\`${column}\` = EXCLUDED.\`${column}\``).join(", ")}`,
      columns.map((column) => record[column] ?? null)
    );
    if (sourceKey) {
      seenSourceKeys.add(sourceKey);
    }
    inserted += 1;
  }

  return inserted;
}

export async function importDrhToDatabase(connection, parsed, options = {}) {
  parsed = {
    ...parsed,
    pegawai: normalizePegawaiTitle(parsed?.pegawai || {}),
  };
  const pegawaiResult = await upsertPegawai(connection, parsed, options);
  const idPegawai = Number(pegawaiResult.id_pegawai);
  const namaPegawai = normalizeNullableText(pegawaiResult.nama || parsed?.pegawai?.nama || parsed?.pegawai?.nama_lengkap);
  const nipPegawai = normalizeNullableText(pegawaiResult.nip || parsed?.pegawai?.nip);

  const alamatInserted = await upsertDomisiliAlamat(connection, idPegawai, parsed?.pegawai?.alamat);
  const keluargaInserted = await replaceKeluargaFromDrh(connection, idPegawai, parsed?.keluarga);

  const pendidikanInserted = await replaceSectionRows(connection, {
    table: "riwayat_pendidikan",
    idPegawai,
    rows: parsed?.riwayat_pendidikan,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      jenis_riwayat: normalizeNullableText(item.jenis_riwayat),
      jenjang_pendidikan: normalizeNullableText(item.jenjang_pendidikan),
      program_studi: normalizeNullableText(item.program_studi),
      nama_institusi: normalizeNullableText(item.nama_institusi),
      nama_universitas: normalizeNullableText(item.nama_universitas),
      kota_institusi: normalizeNullableText(item.kota_institusi),
      tahun_lulus: normalizeNullableText(item.tahun_lulus),
      nomor_ijazah: normalizeNullableText(item.nomor_ijazah),
      tanggal_ijazah: normalizeDate(item.tanggal_ijazah),
      keterangan: normalizeNullableText(item.keterangan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_pendidikan", item),
    }),
  });

  const jabatanInserted = await replaceSectionRows(connection, {
    table: "riwayat_jabatan",
    idPegawai,
    rows: parsed?.riwayat_jabatan,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      gelar_depan: normalizeNullableText(parsed?.pegawai?.gelar_depan),
      gelar_belakang: normalizeNullableText(parsed?.pegawai?.gelar_belakang),
      jenis_jabatan: normalizeNullableText(item.jenis_jabatan),
      lokasi: normalizeNullableText(item.lokasi),
      nama_jabatan_orb: null,
      nama_jabatan_menpan: normalizeNullableText(item.nama_jabatan_menpan),
      struktur_atasan_langsung: null,
      nama_ukpd: normalizeNullableText(parsed?.pegawai?.unit_kerja),
      wilayah: null,
      jenis_pegawai: null,
      status_rumpun: null,
      pangkat_golongan: normalizeNullableText(item.pangkat_golongan),
      eselon: normalizeNullableText(item.eselon),
      tmt_jabatan: normalizeDate(item.tmt_jabatan),
      nomor_sk: normalizeNullableText(item.nomor_sk),
      tanggal_sk: normalizeDate(item.tanggal_sk),
      keterangan: normalizeNullableText(item.keterangan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_jabatan", item),
    }),
  });

  const gajiInserted = await replaceSectionRows(connection, {
    table: "riwayat_gaji_pokok",
    idPegawai,
    rows: parsed?.riwayat_gaji_pokok,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      tmt_gaji: normalizeDate(item.tmt_gaji),
      pangkat_golongan: normalizeNullableText(item.pangkat_golongan),
      gaji_pokok: normalizeDecimal(item.gaji_pokok),
      nomor_sk: normalizeNullableText(item.nomor_sk),
      tanggal_sk: normalizeDate(item.tanggal_sk),
      keterangan: normalizeNullableText(item.keterangan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_gaji_pokok", item),
    }),
  });

  const pangkatInserted = await replaceSectionRows(connection, {
    table: "riwayat_pangkat",
    idPegawai,
    rows: parsed?.riwayat_pangkat,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      pangkat_golongan: normalizeNullableText(item.pangkat_golongan),
      tmt_pangkat: normalizeDate(item.tmt_pangkat),
      lokasi: normalizeNullableText(item.lokasi),
      nomor_sk: normalizeNullableText(item.nomor_sk),
      tanggal_sk: normalizeDate(item.tanggal_sk),
      keterangan: normalizeNullableText(item.keterangan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_pangkat", item),
    }),
  });

  const penghargaanInserted = await replaceSectionRows(connection, {
    table: "riwayat_penghargaan",
    idPegawai,
    rows: parsed?.riwayat_penghargaan,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      nama_penghargaan: normalizeNullableText(item.nama_penghargaan),
      asal_penghargaan: normalizeNullableText(item.asal_penghargaan),
      nomor_sk: normalizeNullableText(item.nomor_sk),
      tanggal_sk: normalizeDate(item.tanggal_sk),
      keterangan: normalizeNullableText(item.keterangan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_penghargaan", item),
    }),
  });

  const skpInserted = await replaceSectionRows(connection, {
    table: "riwayat_skp",
    idPegawai,
    rows: parsed?.riwayat_skp,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      tahun: normalizeNullableText(item.tahun),
      nilai_skp: normalizeDecimal(item.nilai_skp),
      nilai_perilaku: normalizeDecimal(item.nilai_perilaku),
      nilai_prestasi: normalizeDecimal(item.nilai_prestasi),
      keterangan_prestasi: normalizeNullableText(item.keterangan_prestasi),
      keterangan: normalizeNullableText(item.keterangan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_skp", item),
    }),
  });

  const hukumanInserted = await replaceSectionRows(connection, {
    table: "riwayat_hukuman_disiplin",
    idPegawai,
    rows: parsed?.riwayat_hukuman_disiplin,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      tanggal_mulai: normalizeDate(item.tanggal_mulai),
      tanggal_akhir: normalizeDate(item.tanggal_akhir),
      hukuman_disiplin: normalizeNullableText(item.hukuman_disiplin),
      nomor_sk: normalizeNullableText(item.nomor_sk),
      tanggal_sk: normalizeDate(item.tanggal_sk),
      keterangan: normalizeNullableText(item.keterangan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_hukuman_disiplin", item),
    }),
  });

  const prestasiInserted = await replaceSectionRows(connection, {
    table: "riwayat_prestasi_pendidikan",
    idPegawai,
    rows: parsed?.informasi_pendukung?.prestasi_pendidikan,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      kategori: normalizeNullableText(item.kategori),
      jenjang_pendidikan: normalizeNullableText(item.jenjang_pendidikan),
      prestasi: normalizeNullableText(item.prestasi),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_prestasi_pendidikan", item),
    }),
  });

  const narasumberInserted = await replaceSectionRows(connection, {
    table: "riwayat_narasumber",
    idPegawai,
    rows: parsed?.informasi_pendukung?.narasumber,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      kegiatan: normalizeNullableText(item.kegiatan),
      judul_materi: normalizeNullableText(item.judul_materi),
      lembaga_penyelenggara: normalizeNullableText(item.lembaga_penyelenggara),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_narasumber", item),
    }),
  });

  const kegiatanStrategisInserted = await replaceSectionRows(connection, {
    table: "riwayat_kegiatan_strategis",
    idPegawai,
    rows: parsed?.informasi_pendukung?.kegiatan_strategis,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      kegiatan: normalizeNullableText(item.kegiatan),
      tahun_anggaran: normalizeNullableText(item.tahun_anggaran),
      jumlah_anggaran: normalizeDecimal(item.jumlah_anggaran),
      kedudukan_dalam_kegiatan: normalizeNullableText(item.kedudukan_dalam_kegiatan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_kegiatan_strategis", item),
    }),
  });

  const keberhasilanInserted = await replaceSectionRows(connection, {
    table: "riwayat_keberhasilan",
    idPegawai,
    rows: parsed?.informasi_pendukung?.keberhasilan,
    buildRecord: (item) => ({
      id_pegawai: idPegawai,
      nip: nipPegawai,
      nama_pegawai: namaPegawai,
      jabatan: normalizeNullableText(item.jabatan),
      tahun: normalizeNullableText(item.tahun),
      keberhasilan: normalizeNullableText(item.keberhasilan),
      kendala_yang_dihadapi: normalizeNullableText(item.kendala_yang_dihadapi),
      solusi_yang_dilakukan: normalizeNullableText(item.solusi_yang_dilakukan),
      sumber: "drh_pdf",
      source_key: sourceKeyFor(idPegawai, "riwayat_keberhasilan", item),
    }),
  });

  return {
    fileName: options.fileName || null,
    idPegawai,
    namaPegawai,
    nip: nipPegawai,
    createdPegawai: pegawaiResult.created,
    importedCounts: {
      alamat: alamatInserted ? 1 : 0,
      keluarga: keluargaInserted,
      riwayat_pendidikan: pendidikanInserted,
      riwayat_jabatan: jabatanInserted,
      riwayat_gaji_pokok: gajiInserted,
      riwayat_pangkat: pangkatInserted,
      riwayat_penghargaan: penghargaanInserted,
      riwayat_skp: skpInserted,
      riwayat_hukuman_disiplin: hukumanInserted,
      riwayat_prestasi_pendidikan: prestasiInserted,
      riwayat_narasumber: narasumberInserted,
      riwayat_kegiatan_strategis: kegiatanStrategisInserted,
      riwayat_keberhasilan: keberhasilanInserted,
    },
  };
}
