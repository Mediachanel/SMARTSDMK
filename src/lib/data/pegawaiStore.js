import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool, isClosedConnectionError, resetPostgresPools } from "@/lib/db/postgres";

const PEGAWAI_COLUMNS = [
  "id_pegawai",
  "nama",
  "jenis_kelamin",
  "tempat_lahir",
  "tanggal_lahir",
  "nik",
  "agama",
  "nama_ukpd",
  "jenis_ukpd",
  "wilayah",
  "jenis_pegawai",
  "status_rumpun",
  "jenis_kontrak",
  "nrk",
  "nip",
  "nama_jabatan_orb",
  "nama_jabatan_menpan",
  "struktur_atasan_langsung",
  "pangkat_golongan",
  "tmt_pangkat_terakhir",
  "jenjang_pendidikan",
  "program_studi",
  "nama_universitas",
  "no_hp_pegawai",
  "email",
  "no_bpjs",
  "kondisi",
  "tanggal_kondisi",
  "status_perkawinan",
  "gelar_depan",
  "gelar_belakang",
  "foto_profil_url",
  "foto_profil_path",
  "foto_profil_content_type",
  "foto_profil_size",
  "foto_profil_updated_at",
  "tmt_kerja_ukpd",
  "created_at",
  "id_ukpd",
  "ukpd_id",
  "jenjang_pendidikan_raw",
  "status_rumpun_raw",
  "nama_jabatan_menpan_raw",
  "jenis_kelamin_raw"
];

const PEGAWAI_MUTABLE_COLUMNS = PEGAWAI_COLUMNS.filter((column) => !["id_pegawai", "created_at"].includes(column));

const PEGAWAI_DATE_COLUMNS = new Set([
  "tanggal_lahir",
  "tanggal_kondisi",
  "tmt_pangkat_terakhir",
  "tmt_kerja_ukpd",
  "foto_profil_updated_at",
  "created_at"
]);

const PEGAWAI_NUMBER_COLUMNS = new Set([
  "id_ukpd",
  "ukpd_id",
  "foto_profil_size"
]);

const PEGAWAI_DASHBOARD_COLUMNS = [
  "id_pegawai",
  "nama",
  "nip",
  "jenis_kelamin",
  "tanggal_lahir",
  "status_perkawinan",
  "nama_ukpd",
  "id_ukpd",
  "jenis_ukpd",
  "wilayah",
  "jenis_pegawai",
  "status_rumpun",
  "nama_jabatan_orb",
  "nama_jabatan_menpan",
  "pangkat_golongan",
  "tmt_pangkat_terakhir",
  "jenjang_pendidikan",
  "program_studi",
  "kondisi",
  "tanggal_kondisi",
  "tmt_kerja_ukpd",
  "created_at"
];

const ADDRESS_FIELDS = [
  "jalan",
  "kelurahan",
  "kecamatan",
  "kota_kabupaten",
  "provinsi",
  "kode_provinsi",
  "kode_kota_kab",
  "kode_kecamatan",
  "kode_kelurahan"
];

const PASANGAN_FIELDS = ["status_punya", "status_tunjangan", "nama", "no_tlp", "email", "pekerjaan"];

const ANAK_FIELDS = ["nama", "jenis_kelamin", "tempat_lahir", "tanggal_lahir", "pekerjaan", "status_tunjangan"];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

const RIWAYAT_TABLE_CONFIG = {
  riwayat_pendidikan: {
    orderBy: "COALESCE(`tanggal_ijazah`, `tahun_lulus`, '') DESC, `id` DESC",
    fields: ["jenis_riwayat", "jenjang_pendidikan", "program_studi", "nama_institusi", "nama_universitas", "kota_institusi", "tahun_lulus", "nomor_ijazah", "tanggal_ijazah", "keterangan"],
    dateFields: ["tanggal_ijazah"]
  },
  riwayat_jabatan: {
    orderBy: "COALESCE(`tmt_jabatan`, `tanggal_sk`, '') DESC, `id` DESC",
    fields: ["jenis_jabatan", "lokasi", "nama_jabatan_orb", "nama_jabatan_menpan", "struktur_atasan_langsung", "nama_ukpd", "wilayah", "jenis_pegawai", "status_rumpun", "pangkat_golongan", "eselon", "tmt_jabatan", "nomor_sk", "tanggal_sk", "keterangan"],
    dateFields: ["tmt_jabatan", "tanggal_sk"]
  },
  riwayat_gaji_pokok: {
    orderBy: "COALESCE(`tmt_gaji`, `tanggal_sk`, '') DESC, `id` DESC",
    fields: ["tmt_gaji", "pangkat_golongan", "gaji_pokok", "nomor_sk", "tanggal_sk", "keterangan"],
    dateFields: ["tmt_gaji", "tanggal_sk"]
  },
  riwayat_pangkat: {
    orderBy: "COALESCE(`tmt_pangkat`, `tanggal_sk`, '') DESC, `id` DESC",
    fields: ["pangkat_golongan", "tmt_pangkat", "lokasi", "nomor_sk", "tanggal_sk", "keterangan"],
    dateFields: ["tmt_pangkat", "tanggal_sk"]
  },
  riwayat_penghargaan: {
    orderBy: "COALESCE(`tanggal_sk`, '') DESC, `id` DESC",
    fields: ["nama_penghargaan", "asal_penghargaan", "nomor_sk", "tanggal_sk", "keterangan"],
    dateFields: ["tanggal_sk"]
  },
  riwayat_skp: {
    orderBy: "COALESCE(`tahun`, '') DESC, `id` DESC",
    fields: ["tahun", "nilai_skp", "nilai_perilaku", "nilai_prestasi", "keterangan_prestasi", "keterangan"],
    dateFields: []
  },
  riwayat_hukuman_disiplin: {
    orderBy: "COALESCE(`tanggal_mulai`, `tanggal_sk`, '') DESC, `id` DESC",
    fields: ["tanggal_mulai", "tanggal_akhir", "hukuman_disiplin", "nomor_sk", "tanggal_sk", "keterangan"],
    dateFields: ["tanggal_mulai", "tanggal_akhir", "tanggal_sk"]
  },
  riwayat_prestasi_pendidikan: {
    orderBy: "`id` DESC",
    fields: ["kategori", "jenjang_pendidikan", "prestasi"],
    dateFields: []
  },
  riwayat_narasumber: {
    orderBy: "`id` DESC",
    fields: ["kegiatan", "judul_materi", "lembaga_penyelenggara"],
    dateFields: []
  },
  riwayat_kegiatan_strategis: {
    orderBy: "COALESCE(`tahun_anggaran`, '') DESC, `id` DESC",
    fields: ["kegiatan", "tahun_anggaran", "jumlah_anggaran", "kedudukan_dalam_kegiatan"],
    dateFields: []
  },
  riwayat_keberhasilan: {
    orderBy: "COALESCE(`tahun`, '') DESC, `id` DESC",
    fields: ["jabatan", "tahun", "keberhasilan", "kendala_yang_dihadapi", "solusi_yang_dilakukan"],
    dateFields: []
  }
};

function toDateString(value) {
  if (!value || typeof value !== "object" || !("toISOString" in value)) return value;
  return value.toISOString().slice(0, 10);
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toDateString(value)]));
}

function normalizeUkpd(row) {
  return {
    ...normalizeRow(row),
    role: row.role || ROLES.ADMIN_UKPD
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeDateInput(value) {
  const text = normalizeText(value);
  if (!text || text === "0000-00-00" || text === "0000-00-00 00:00:00") return null;
  return text;
}

function normalizePegawaiColumnValue(column, value) {
  if (PEGAWAI_DATE_COLUMNS.has(column)) return normalizeDateInput(value);
  if (PEGAWAI_NUMBER_COLUMNS.has(column)) return normalizeNumberInput(value);
  return value ?? null;
}

function normalizeNumberInput(value) {
  const text = normalizeText(value);
  if (!text) return null;
  // Form HTML mengirim desimal memakai titik (84.34), sedangkan data lokal
  // dapat memakai format Indonesia (84,34 atau 5.000.000,00).
  // Menghapus semua titik membuat 84.34 berubah menjadi 8434 dan berlipat
  // lagi setiap kali data diedit.
  const commaIndex = text.lastIndexOf(",");
  const dotCount = (text.match(/\./g) || []).length;
  let normalized;
  if (commaIndex >= 0) {
    normalized = text.replace(/\./g, "").replace(/,/g, ".");
  } else if (dotCount > 1) {
    normalized = text.replace(/\./g, "");
  } else {
    normalized = text;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function buildAlamatLengkap(row) {
  const jalan = normalizeText(row.jalan);
  const jalanLower = jalan.toLowerCase();
  const tail = [row.kelurahan, row.kecamatan, row.kota_kabupaten, row.provinsi]
    .map(normalizeText)
    .filter(Boolean)
    .filter((part, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index)
    .filter((part) => !jalanLower || !jalanLower.includes(part.toLowerCase()));

  return [jalan, ...tail].filter(Boolean).join(", ");
}

async function queryRows(sql, params = []) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const pool = await getConnectedPool();
      const [rows] = await pool.query(sql, params);
      return rows.map(normalizeRow);
    } catch (error) {
      if (attempt === 0 && isClosedConnectionError(error)) {
        await resetPostgresPools();
        continue;
      }
      throw error;
    }
  }
  return [];
}

function getTableAvailabilityCache() {
  if (!globalThis.__sisdmkTableAvailability) {
    globalThis.__sisdmkTableAvailability = new Map();
  }
  return globalThis.__sisdmkTableAvailability;
}

function getColumnAvailabilityCache() {
  if (!globalThis.__sisdmkColumnAvailability) {
    globalThis.__sisdmkColumnAvailability = new Map();
  }
  return globalThis.__sisdmkColumnAvailability;
}

async function hasTable(table) {
  const cache = getTableAvailabilityCache();
  if (cache.has(table)) return cache.get(table);

  const rows = await queryRows(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  const available = Number(rows[0]?.total || 0) > 0;
  cache.set(table, available);
  return available;
}

async function hasColumn(table, column) {
  const cache = getColumnAvailabilityCache();
  const key = `${table}.${column}`;
  if (cache.has(key)) return cache.get(key);

  const rows = await queryRows(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [table, column]
  );
  const available = Number(rows[0]?.total || 0) > 0;
  cache.set(key, available);
  return available;
}

async function queryRowsIfTableExists(table, sql, params = []) {
  if (!(await hasTable(table))) return [];
  return queryRows(sql, params);
}

async function getPegawaiSectionRows(id, table, orderBy = "`id` DESC") {
  return queryRows(
    `SELECT * FROM \`${table}\`
     WHERE \`id_pegawai\` = ?
     ORDER BY ${orderBy}`,
    [Number(id)]
  );
}

async function nextTableId(connection, table) {
  const [[row]] = await connection.query(`SELECT COALESCE(MAX(\`id\`), 0) + 1 AS next_id FROM \`${table}\``);
  return Number(row?.next_id || 1);
}

function emptyAlamat(tipe) {
  return {
    id: null,
    tipe,
    jalan: "",
    kelurahan: "",
    kecamatan: "",
    kota_kabupaten: "",
    provinsi: "",
    kode_provinsi: "",
    kode_kota_kab: "",
    kode_kecamatan: "",
    kode_kelurahan: ""
  };
}

function normalizeAlamatEntry(entry, tipe) {
  const base = emptyAlamat(tipe);
  if (!entry || typeof entry !== "object") return base;
  return {
    ...base,
    id: entry.id ? Number(entry.id) : null,
    tipe,
    jalan: normalizeText(entry.jalan),
    kelurahan: normalizeText(entry.kelurahan),
    kecamatan: normalizeText(entry.kecamatan),
    kota_kabupaten: normalizeText(entry.kota_kabupaten),
    provinsi: normalizeText(entry.provinsi),
    kode_provinsi: normalizeText(entry.kode_provinsi),
    kode_kota_kab: normalizeText(entry.kode_kota_kab),
    kode_kecamatan: normalizeText(entry.kode_kecamatan),
    kode_kelurahan: normalizeText(entry.kode_kelurahan)
  };
}

function hasAlamatContent(entry) {
  return ADDRESS_FIELDS.some((field) => normalizeText(entry?.[field]));
}

function defaultPasangan() {
  return {
    id: null,
    status_punya: "Tidak",
    status_tunjangan: "",
    nama: "",
    no_tlp: "",
    email: "",
    pekerjaan: ""
  };
}

function normalizePasanganEntry(entry) {
  const base = defaultPasangan();
  if (!entry || typeof entry !== "object") return base;
  return {
    ...base,
    id: entry.id ? Number(entry.id) : null,
    status_punya: normalizeText(entry.status_punya) || "Tidak",
    status_tunjangan: normalizeText(entry.status_tunjangan),
    nama: normalizeText(entry.nama),
    no_tlp: normalizeText(entry.no_tlp),
    email: normalizeText(entry.email),
    pekerjaan: normalizeText(entry.pekerjaan)
  };
}

function hasPasanganContent(entry) {
  return PASANGAN_FIELDS.some((field) => normalizeText(entry?.[field])) && String(entry?.status_punya || "").toLowerCase() !== "tidak";
}

function normalizeLegacyPasanganRow(row) {
  if (!row) return defaultPasangan();
  return normalizePasanganEntry({
    id: row.id,
    status_punya: row.status_punya,
    status_tunjangan: row.status_tunjangan,
    nama: row.nama,
    no_tlp: row.no_tlp,
    email: row.email,
    pekerjaan: row.pekerjaan
  });
}

function normalizeAnakEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => ({
      id: entry.id ? Number(entry.id) : null,
      urutan: Number(entry.urutan) || index + 1,
      nama: normalizeText(entry.nama),
      jenis_kelamin: normalizeText(entry.jenis_kelamin),
      tempat_lahir: normalizeText(entry.tempat_lahir),
      tanggal_lahir: normalizeText(entry.tanggal_lahir),
      pekerjaan: normalizeText(entry.pekerjaan),
      status_tunjangan: normalizeText(entry.status_tunjangan)
    }))
    .filter((entry) => ANAK_FIELDS.some((field) => normalizeText(entry[field])));
}

function normalizeLegacyAnakRows(rows) {
  return normalizeAnakEntries(
    rows.map((row, index) => ({
      id: row.id,
      urutan: row.urutan || index + 1,
      nama: row.nama,
      jenis_kelamin: row.jenis_kelamin,
      tempat_lahir: row.tempat_lahir,
      tanggal_lahir: row.tanggal_lahir,
      pekerjaan: row.pekerjaan,
      status_tunjangan: row.status_tunjangan
    }))
  );
}

function buildLegacyKeluargaRows(pasanganRows, anakRows) {
  const keluarga = [];
  const pasangan = pasanganRows[0];
  if (pasangan) {
    keluarga.push({
      id: pasangan.id || null,
      hubungan: "pasangan",
      hubungan_detail: "Pasangan",
      status_punya: pasangan.status_punya || null,
      status_tunjangan: pasangan.status_tunjangan || null,
      urutan: null,
      nama: pasangan.nama || null,
      jenis_kelamin: pasangan.jenis_kelamin || null,
      tempat_lahir: pasangan.tempat_lahir || null,
      tanggal_lahir: pasangan.tanggal_lahir || null,
      no_tlp: pasangan.no_tlp || null,
      email: pasangan.email || null,
      pekerjaan: pasangan.pekerjaan || null,
      sumber_tabel: "pasangan",
      sumber_id: pasangan.id || null
    });
  }

  anakRows.forEach((anak, index) => {
    keluarga.push({
      id: anak.id || null,
      hubungan: "anak",
      hubungan_detail: anak.hubungan_detail || `Anak ${index + 1}`,
      status_punya: anak.status_punya || null,
      status_tunjangan: anak.status_tunjangan || null,
      urutan: anak.urutan || index + 1,
      nama: anak.nama || null,
      jenis_kelamin: anak.jenis_kelamin || null,
      tempat_lahir: anak.tempat_lahir || null,
      tanggal_lahir: anak.tanggal_lahir || null,
      no_tlp: anak.no_tlp || null,
      email: anak.email || null,
      pekerjaan: anak.pekerjaan || null,
      sumber_tabel: "anak",
      sumber_id: anak.id || null
    });
  });

  return keluarga.map(normalizeRow);
}

function normalizeKeluargaEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => ({
      id: entry.id ? Number(entry.id) : null,
      hubungan: normalizeText(entry.hubungan).toLowerCase() === "anak" ? "anak" : "pasangan",
      hubungan_detail: normalizeText(entry.hubungan_detail),
      status_punya: normalizeText(entry.status_punya),
      status_tunjangan: normalizeText(entry.status_tunjangan),
      urutan: entry.urutan ? Number(entry.urutan) : (normalizeText(entry.hubungan).toLowerCase() === "anak" ? index + 1 : null),
      nama: normalizeText(entry.nama),
      jenis_kelamin: normalizeText(entry.jenis_kelamin),
      tempat_lahir: normalizeText(entry.tempat_lahir),
      tanggal_lahir: normalizeText(entry.tanggal_lahir),
      no_tlp: normalizeText(entry.no_tlp),
      email: normalizeText(entry.email),
      pekerjaan: normalizeText(entry.pekerjaan)
    }))
    .filter((entry) => entry.nama || entry.hubungan_detail || entry.pekerjaan || entry.status_punya || entry.status_tunjangan);
}

function hasKeluargaContent(entry) {
  return ["nama", "hubungan_detail", "status_punya", "status_tunjangan", "pekerjaan", "no_tlp", "email", "tempat_lahir", "tanggal_lahir"].some((field) => normalizeText(entry?.[field]));
}

function normalizeRiwayatEntries(entries, config) {
  if (!Array.isArray(entries) || !config) return [];
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) =>
      Object.fromEntries(
        config.fields.map((field) => {
          if (config.dateFields.includes(field)) return [field, normalizeDateInput(entry[field])];
          if (["gaji_pokok", "nilai_skp", "nilai_perilaku", "nilai_prestasi", "jumlah_anggaran"].includes(field)) {
            return [field, normalizeNumberInput(entry[field])];
          }
          return [field, normalizeText(entry[field])];
        })
      )
    )
    .filter((entry) => config.fields.some((field) => {
      const value = entry[field];
      return value !== null && value !== undefined && String(value).trim() !== "";
    }));
}

function buildSourceId(connectionId, table, item, index) {
  const raw = `${connectionId}|${table}|${index}|${JSON.stringify(item)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || (index + 1);
}

async function savePegawaiAlamat(connection, idPegawai, alamatInput) {
  if (!alamatInput || typeof alamatInput !== "object") return;
  const requestedTypes = ["domisili", "ktp"].filter((tipe) => hasOwn(alamatInput, tipe));
  if (!requestedTypes.length) return;

  const alamat = {
    domisili: normalizeAlamatEntry(alamatInput?.domisili, "domisili"),
    ktp: normalizeAlamatEntry(alamatInput?.ktp, "ktp")
  };

  for (const tipe of requestedTypes) {
    const item = alamat[tipe];
    const [existingRows] = await connection.query(
      "SELECT * FROM `alamat` WHERE `id_pegawai` = ? AND LOWER(`tipe`) = ? ORDER BY `id` ASC",
      [Number(idPegawai), tipe]
    );
    const existing = existingRows[0] || null;
    const extraRows = existingRows.slice(1);

    if (!hasAlamatContent(item)) {
      if (existing) {
        await connection.query("DELETE FROM `alamat` WHERE `id_pegawai` = ? AND LOWER(`tipe`) = ?", [Number(idPegawai), tipe]);
      }
      continue;
    }

    const values = ADDRESS_FIELDS.map((field) => normalizeNullableText(item[field]));

    if (existing) {
      await connection.query(
        `UPDATE \`alamat\`
         SET ${ADDRESS_FIELDS.map((field) => `\`${field}\` = ?`).join(", ")}
         WHERE \`id\` = ?`,
        [...values, Number(existing.id)]
      );
      if (extraRows.length) {
        await connection.query(
          `DELETE FROM \`alamat\` WHERE \`id\` IN (${extraRows.map(() => "?").join(", ")})`,
          extraRows.map((row) => Number(row.id))
        );
      }
      continue;
    }

    const nextId = await nextTableId(connection, "alamat");
    await connection.query(
      `INSERT INTO \`alamat\` (\`id\`, \`id_pegawai\`, \`tipe\`, ${ADDRESS_FIELDS.map((field) => `\`${field}\``).join(", ")}, \`created_at\`)
       VALUES (?, ?, ?, ${ADDRESS_FIELDS.map(() => "?").join(", ")}, ?)`,
      [nextId, Number(idPegawai), tipe, ...values, new Date().toISOString().slice(0, 10)]
    );
  }
}

async function savePegawaiPasangan(connection, idPegawai, pasanganInput) {
  const pasangan = normalizePasanganEntry(pasanganInput);
  const [rows] = await connection.query(
    "SELECT * FROM `keluarga` WHERE `id_pegawai` = ? AND `hubungan` = 'pasangan' ORDER BY `id` ASC",
    [Number(idPegawai)]
  );
  const existing = rows[0] || null;
  const extraRows = rows.slice(1);

  if (!hasPasanganContent(pasangan)) {
    if (rows.length) {
      await connection.query("DELETE FROM `keluarga` WHERE `id_pegawai` = ? AND `hubungan` = 'pasangan'", [Number(idPegawai)]);
    }
    return;
  }

  const values = PASANGAN_FIELDS.map((field) => normalizeNullableText(pasangan[field]));

  if (existing) {
    await connection.query(
      `UPDATE \`keluarga\`
       SET \`status_punya\` = ?, \`status_tunjangan\` = ?, \`nama\` = ?, \`no_tlp\` = ?, \`email\` = ?, \`pekerjaan\` = ?
       WHERE \`id\` = ?`,
      [...values, Number(existing.id)]
    );
    if (extraRows.length) {
      await connection.query(
        `DELETE FROM \`keluarga\` WHERE \`id\` IN (${extraRows.map(() => "?").join(", ")})`,
        extraRows.map((row) => Number(row.id))
      );
    }
    return;
  }

  await connection.query(
    `INSERT INTO \`keluarga\`
     (\`id_pegawai\`, \`hubungan\`, \`hubungan_detail\`, \`status_punya\`, \`status_tunjangan\`, \`urutan\`, \`nama\`, \`jenis_kelamin\`, \`tempat_lahir\`, \`tanggal_lahir\`, \`no_tlp\`, \`email\`, \`pekerjaan\`, \`sumber_tabel\`, \`sumber_id\`, \`created_at\`)
     VALUES (?, 'pasangan', NULL, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?, ?, 'keluarga_pasangan', ?, ?)`,
    [Number(idPegawai), ...values, Number(idPegawai), new Date()]
  );
}

async function savePegawaiAnak(connection, idPegawai, anakInput) {
  const anak = normalizeAnakEntries(anakInput);
  await connection.query("DELETE FROM `keluarga` WHERE `id_pegawai` = ? AND `hubungan` = 'anak'", [Number(idPegawai)]);
  if (!anak.length) return;

  let nextSourceId = await nextTableId(connection, "keluarga");
  for (const [index, item] of anak.entries()) {
    await connection.query(
      `INSERT INTO \`keluarga\`
       (\`id_pegawai\`, \`hubungan\`, \`hubungan_detail\`, \`status_punya\`, \`status_tunjangan\`, \`urutan\`, \`nama\`, \`jenis_kelamin\`, \`tempat_lahir\`, \`tanggal_lahir\`, \`no_tlp\`, \`email\`, \`pekerjaan\`, \`sumber_tabel\`, \`sumber_id\`, \`created_at\`)
       VALUES (?, 'anak', NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'keluarga_anak', ?, ?)`,
      [
        Number(idPegawai),
        normalizeNullableText(item.status_tunjangan),
        item.urutan || index + 1,
        normalizeNullableText(item.nama),
        normalizeNullableText(item.jenis_kelamin),
        normalizeNullableText(item.tempat_lahir),
        normalizeDateInput(item.tanggal_lahir),
        normalizeNullableText(item.pekerjaan),
        nextSourceId,
        new Date()
      ]
    );
    nextSourceId += 1;
  }
}

async function savePegawaiKeluarga(connection, idPegawai, keluargaInput) {
  const keluarga = normalizeKeluargaEntries(keluargaInput);
  // The form submits the complete family collection. Replace it atomically so
  // legacy/import rows cannot survive and be inserted again as duplicates.
  await connection.query("DELETE FROM `keluarga` WHERE `id_pegawai` = ?", [Number(idPegawai)]);
  if (!keluarga.length) return;

  let childIndex = 1;
  for (const [index, item] of keluarga.entries()) {
    if (!hasKeluargaContent(item)) continue;
    const hubungan = item.hubungan === "anak" ? "anak" : "pasangan";
    const urutan = hubungan === "anak" ? (item.urutan || childIndex) : null;
    if (hubungan === "anak") childIndex += 1;
    const sourceTable = hubungan === "anak" ? "keluarga_form_anak" : "keluarga_form_pasangan";

    await connection.query(
      `INSERT INTO \`keluarga\`
       (\`id_pegawai\`, \`hubungan\`, \`hubungan_detail\`, \`status_punya\`, \`status_tunjangan\`, \`urutan\`, \`nama\`, \`jenis_kelamin\`, \`tempat_lahir\`, \`tanggal_lahir\`, \`no_tlp\`, \`email\`, \`pekerjaan\`, \`sumber_tabel\`, \`sumber_id\`, \`created_at\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(idPegawai),
        hubungan,
        normalizeNullableText(item.hubungan_detail),
        normalizeNullableText(item.status_punya),
        normalizeNullableText(item.status_tunjangan),
        urutan,
        normalizeNullableText(item.nama),
        normalizeNullableText(item.jenis_kelamin),
        normalizeNullableText(item.tempat_lahir),
        normalizeDateInput(item.tanggal_lahir),
        normalizeNullableText(item.no_tlp),
        normalizeNullableText(item.email),
        normalizeNullableText(item.pekerjaan),
        sourceTable,
        buildSourceId(idPegawai, sourceTable, item, index),
        new Date()
      ]
    );
  }
}

async function savePegawaiRiwayatTable(connection, idPegawai, table, entriesInput, identity = {}) {
  const config = RIWAYAT_TABLE_CONFIG[table];
  if (!config) return;
  const entries = normalizeRiwayatEntries(entriesInput, config);
  await connection.query(`DELETE FROM \`${table}\` WHERE \`id_pegawai\` = ? AND \`sumber\` IN ('form_manual', 'drh_pdf')`, [Number(idPegawai)]);
  if (!entries.length) return;

  for (const [index, entry] of entries.entries()) {
    const row = {
      id_pegawai: Number(idPegawai),
      nip: normalizeNullableText(identity.nip),
      nama_pegawai: normalizeNullableText(identity.nama) || `Pegawai ${idPegawai}`,
      ...Object.fromEntries(config.fields.map((field) => [field, entry[field] ?? null])),
      sumber: "form_manual",
      source_key: `${table}:form_manual:${idPegawai}:${buildSourceId(idPegawai, table, entry, index)}`
    };
    const columns = Object.keys(row);
    await connection.query(
      `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
      columns.map((column) => row[column])
    );
  }
}

async function savePegawaiRelations(connection, idPegawai, relations = {}) {
  if (hasOwn(relations, "alamat")) {
    await savePegawaiAlamat(connection, idPegawai, relations.alamat);
  }
  if (hasOwn(relations, "keluarga") && Array.isArray(relations.keluarga)) {
    await savePegawaiKeluarga(connection, idPegawai, relations.keluarga);
  } else {
    if (hasOwn(relations, "pasangan")) {
      await savePegawaiPasangan(connection, idPegawai, relations.pasangan);
    }
    if (hasOwn(relations, "anak")) {
      await savePegawaiAnak(connection, idPegawai, relations.anak);
    }
  }

  const identity = {
    nip: relations.nip,
    nama: relations.nama
  };

  for (const table of Object.keys(RIWAYAT_TABLE_CONFIG)) {
    if (hasOwn(relations, table)) {
      await savePegawaiRiwayatTable(connection, idPegawai, table, relations[table], identity);
    }
  }
}

function pickPegawaiRelations(data = {}) {
  const relations = {};
  for (const key of [
    "alamat",
    "pasangan",
    "anak",
    "keluarga",
    ...Object.keys(RIWAYAT_TABLE_CONFIG)
  ]) {
    if (hasOwn(data, key)) relations[key] = data[key];
  }
  return relations;
}

function pickEditablePegawaiRelations(data = {}) {
  const relations = {};
  for (const key of [
    "alamat",
    "pasangan",
    "anak",
    "keluarga",
    ...Object.keys(RIWAYAT_TABLE_CONFIG)
  ]) {
    if (hasOwn(data, key)) relations[key] = data[key];
  }
  return relations;
}

function withLatestPangkatSnapshot(data = {}) {
  if (!hasOwn(data, "riwayat_pangkat")) return data;
  const entries = normalizeRiwayatEntries(data.riwayat_pangkat, RIWAYAT_TABLE_CONFIG.riwayat_pangkat)
    .filter((entry) => entry.pangkat_golongan || entry.tmt_pangkat || entry.tanggal_sk)
    .sort((a, b) => String(b.tmt_pangkat || b.tanggal_sk || "").localeCompare(String(a.tmt_pangkat || a.tanggal_sk || "")));
  const latest = entries[0] || null;
  return {
    ...data,
    pangkat_golongan: latest?.pangkat_golongan || null,
    tmt_pangkat_terakhir: latest?.tmt_pangkat || latest?.tanggal_sk || null
  };
}

function withLatestEducationSnapshot(data = {}) {
  if (!hasOwn(data, "riwayat_pendidikan")) return data;
  const entries = normalizeRiwayatEntries(data.riwayat_pendidikan, RIWAYAT_TABLE_CONFIG.riwayat_pendidikan)
    .filter((entry) => ["formal", "pendidikan_terakhir"].includes(String(entry.jenis_riwayat || "").trim().toLowerCase().replace(/[\s-]+/g, "_")))
    .filter((entry) => entry.jenjang_pendidikan || entry.program_studi || entry.nama_institusi || entry.nama_universitas)
    .sort((a, b) => String(b.tanggal_ijazah || b.tahun_lulus || "").localeCompare(String(a.tanggal_ijazah || a.tahun_lulus || "")));
  const latest = entries[0] || null;
  return {
    ...data,
    jenjang_pendidikan: latest?.jenjang_pendidikan || null,
    program_studi: latest?.program_studi || null,
    nama_universitas: latest?.nama_universitas || latest?.nama_institusi || null
  };
}

function withLatestHistorySnapshots(data = {}) {
  const synchronized = withLatestEducationSnapshot(withLatestPangkatSnapshot(data));
  const needsConditionDate = ["TIDAK AKTIF", "RESIGN", "PENSIUN"].includes(String(synchronized.kondisi || "").trim().toUpperCase());
  return needsConditionDate ? synchronized : { ...synchronized, tanggal_kondisi: null };
}

export async function getUkpdData() {
  const rows = await queryRows("SELECT * FROM `ukpd` ORDER BY `nama_ukpd` ASC");
  return rows.map(normalizeUkpd);
}

export async function getPegawaiData() {
  return queryRows("SELECT * FROM `pegawai` ORDER BY `id_pegawai` DESC");
}

async function buildPegawaiDashboardWhere(scope = {}) {
  const user = scope.user;
  const ukpdList = scope.ukpdList || [];
  if (!user) return { sql: "", params: [] };

  if (user.role === ROLES.ADMIN_UKPD) {
    const clauses = [];
    const params = [];
    const matchedUkpd = ukpdList.find((ukpd) => (
      ukpd.nama_ukpd === user.nama_ukpd ||
      String(ukpd.id_ukpd || "") === String(user.username || "") ||
      String(ukpd.ukpd_id || "") === String(user.username || "")
    ));

    if (user.nama_ukpd && await hasColumn("pegawai", "nama_ukpd")) {
      clauses.push("p.`nama_ukpd` = ?");
      params.push(user.nama_ukpd);
    }
    if (matchedUkpd?.id_ukpd && await hasColumn("pegawai", "id_ukpd")) {
      clauses.push("p.`id_ukpd` = ?");
      params.push(matchedUkpd.id_ukpd);
    }
    if (!clauses.length) return { sql: "WHERE 1 = 0", params: [] };
    return { sql: `WHERE (${clauses.join(" OR ")})`, params };
  }

  if (user.role === ROLES.ADMIN_WILAYAH) {
    const clauses = [];
    const params = [];
    const allowedUkpd = ukpdList
      .filter((ukpd) => ukpd.wilayah === user.wilayah)
      .map((ukpd) => ukpd.nama_ukpd)
      .filter(Boolean);

    if (user.wilayah && await hasColumn("pegawai", "wilayah")) {
      clauses.push("p.`wilayah` = ?");
      params.push(user.wilayah);
    }
    if (allowedUkpd.length && await hasColumn("pegawai", "nama_ukpd")) {
      clauses.push(`p.\`nama_ukpd\` IN (${allowedUkpd.map(() => "?").join(", ")})`);
      params.push(...allowedUkpd);
    }
    if (!clauses.length) return { sql: "WHERE 1 = 0", params: [] };
    return { sql: `WHERE (${clauses.join(" OR ")})`, params };
  }

  return { sql: "", params: [] };
}

async function getLatestEselonByPegawai({
  hasRiwayatJabatan,
  hasRiwayatEselon,
  hasRiwayatIdPegawai,
  riwayatOrderBy,
  employeeIds = []
}) {
  if (!hasRiwayatJabatan || !hasRiwayatEselon || !hasRiwayatIdPegawai) return new Map();

  const ids = [...new Set(employeeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  const shouldScopeByIds = ids.length > 0 && ids.length <= 5000;
  const chunks = shouldScopeByIds
    ? Array.from({ length: Math.ceil(ids.length / 1000) }, (_, index) => ids.slice(index * 1000, (index + 1) * 1000))
    : [null];
  const eselonByPegawai = new Map();

  for (const chunk of chunks) {
    const scopedWhere = chunk?.length ? ` AND rj.\`id_pegawai\` IN (${chunk.map(() => "?").join(", ")})` : "";
    const rows = await queryRows(
      `SELECT rj.\`id_pegawai\`, rj.\`eselon\`
       FROM \`riwayat_jabatan\` rj
       WHERE rj.\`id_pegawai\` IS NOT NULL${scopedWhere}
       ORDER BY rj.\`id_pegawai\` ASC${riwayatOrderBy ? `, ${riwayatOrderBy}` : ""}`,
      chunk || []
    );

    for (const row of rows) {
      const id = String(row.id_pegawai || "");
      if (!id || eselonByPegawai.has(id)) continue;
      eselonByPegawai.set(id, row.eselon || null);
    }
  }

  return eselonByPegawai;
}

export async function getPegawaiDashboardData(scope = {}) {
  const selectColumns = (await Promise.all(PEGAWAI_DASHBOARD_COLUMNS.map(async (column) => (
    await hasColumn("pegawai", column)
      ? `p.\`${column}\``
      : `NULL AS \`${column}\``
  )))).join(", ");
  const where = await buildPegawaiDashboardWhere(scope);
  const hasRiwayatJabatan = await hasTable("riwayat_jabatan");
  const hasRiwayatEselon = hasRiwayatJabatan && await hasColumn("riwayat_jabatan", "eselon");
  const hasRiwayatIdPegawai = hasRiwayatJabatan && await hasColumn("riwayat_jabatan", "id_pegawai");
  const hasRiwayatId = hasRiwayatJabatan && await hasColumn("riwayat_jabatan", "id");
  const riwayatOrderColumns = [];
  if (hasRiwayatJabatan && await hasColumn("riwayat_jabatan", "tmt_jabatan")) riwayatOrderColumns.push("rj.`tmt_jabatan`");
  if (hasRiwayatJabatan && await hasColumn("riwayat_jabatan", "tanggal_sk")) riwayatOrderColumns.push("rj.`tanggal_sk`");
  if (hasRiwayatJabatan && await hasColumn("riwayat_jabatan", "created_at")) riwayatOrderColumns.push("rj.`created_at`");
  const riwayatOrderExpressions = riwayatOrderColumns.map((column) => `CAST(${column} AS CHAR)`);
  const riwayatOrderBy = [
    riwayatOrderExpressions.length ? `COALESCE(${riwayatOrderExpressions.join(", ")}, '') DESC` : "",
    hasRiwayatId ? "rj.`id` DESC" : ""
  ].filter(Boolean).join(", ");

  const rows = await queryRows(
    `SELECT ${selectColumns}
     FROM \`pegawai\` p
     ${where.sql}
     ORDER BY p.\`id_pegawai\` DESC`,
    where.params
  );
  const eselonByPegawai = await getLatestEselonByPegawai({
    hasRiwayatJabatan,
    hasRiwayatEselon,
    hasRiwayatIdPegawai,
    riwayatOrderBy,
    employeeIds: rows.map((row) => row.id_pegawai)
  });

  return rows.map((row) => ({
    ...row,
    eselon: eselonByPegawai.get(String(row.id_pegawai || "")) || null
  }));
}

export async function getPegawaiById(id) {
  const rows = await queryRows("SELECT * FROM `pegawai` WHERE `id_pegawai` = ? LIMIT 1", [Number(id)]);
  return rows[0] || null;
}

export async function getPegawaiAlamat(id) {
  const rows = await queryRows(
    `SELECT * FROM \`alamat\`
     WHERE \`id_pegawai\` = ?
     ORDER BY CASE
       WHEN LOWER(\`tipe\`) = 'ktp' THEN 0
       WHEN LOWER(\`tipe\`) = 'domisili' THEN 1
       ELSE 2
     END, \`id\` ASC`,
    [Number(id)]
  );

  return rows.map((row) => ({
    ...row,
    alamat_lengkap: buildAlamatLengkap(row)
  }));
}

export async function getPegawaiPasangan(id) {
  const rows = await queryRowsIfTableExists(
    "keluarga",
    `SELECT * FROM \`keluarga\`
     WHERE \`id_pegawai\` = ?
       AND \`hubungan\` = 'pasangan'
     ORDER BY CASE WHEN \`sumber_tabel\` = 'drh_pdf_keluarga' THEN 0 ELSE 1 END, \`id\` ASC
     LIMIT 1`,
    [Number(id)]
  );

  if (rows[0]) return normalizePasanganEntry(rows[0]);

  const legacyRows = await queryRowsIfTableExists(
    "pasangan",
    `SELECT * FROM \`pasangan\`
     WHERE \`id_pegawai\` = ?
     ORDER BY \`id\` ASC
     LIMIT 1`,
    [Number(id)]
  );
  return legacyRows[0] ? normalizeLegacyPasanganRow(legacyRows[0]) : defaultPasangan();
}

export async function getPegawaiAnak(id) {
  const rows = await queryRowsIfTableExists(
    "keluarga",
    `SELECT * FROM \`keluarga\`
     WHERE \`id_pegawai\` = ?
       AND \`hubungan\` = 'anak'
     ORDER BY CASE WHEN \`sumber_tabel\` = 'drh_pdf_keluarga' THEN 0 ELSE 1 END, \`urutan\` ASC, \`id\` ASC`,
    [Number(id)]
  );

  if (rows.length) {
    const preferredRows = rows.some((row) => row.sumber_tabel === "drh_pdf_keluarga")
      ? rows.filter((row) => row.sumber_tabel === "drh_pdf_keluarga")
      : rows;

    return normalizeAnakEntries(preferredRows);
  }

  const legacyRows = await queryRowsIfTableExists(
    "anak",
    `SELECT * FROM \`anak\`
     WHERE \`id_pegawai\` = ?
     ORDER BY \`urutan\` ASC, \`id\` ASC`,
    [Number(id)]
  );
  return normalizeLegacyAnakRows(legacyRows);
}

export async function getPegawaiKeluarga(id) {
  const rows = await queryRowsIfTableExists(
    "keluarga",
    `SELECT * FROM \`keluarga\`
     WHERE \`id_pegawai\` = ?
     ORDER BY CASE WHEN \`sumber_tabel\` = 'drh_pdf_keluarga' THEN 0 ELSE 1 END, \`hubungan\` ASC, \`urutan\` ASC, \`id\` ASC`,
    [Number(id)]
  );

  if (rows.length) {
    return rows.some((row) => row.sumber_tabel === "drh_pdf_keluarga")
      ? rows.filter((row) => row.sumber_tabel === "drh_pdf_keluarga")
      : rows;
  }

  const [legacyPasanganRows, legacyAnakRows] = await Promise.all([
    queryRowsIfTableExists(
      "pasangan",
      `SELECT * FROM \`pasangan\`
       WHERE \`id_pegawai\` = ?
       ORDER BY \`id\` ASC`,
      [Number(id)]
    ),
    queryRowsIfTableExists(
      "anak",
      `SELECT * FROM \`anak\`
       WHERE \`id_pegawai\` = ?
       ORDER BY \`urutan\` ASC, \`id\` ASC`,
      [Number(id)]
    )
  ]);

  return buildLegacyKeluargaRows(legacyPasanganRows, legacyAnakRows);
}

export async function getPegawaiRiwayatPendidikan(id) {
  return getPegawaiSectionRows(id, "riwayat_pendidikan", "COALESCE(`tanggal_ijazah`, `tahun_lulus`, '') DESC, `id` DESC");
}

export async function getPegawaiRiwayatJabatan(id) {
  return getPegawaiSectionRows(id, "riwayat_jabatan", "COALESCE(`tmt_jabatan`, `tanggal_sk`, '') DESC, `id` DESC");
}

export async function getPegawaiRiwayatGajiPokok(id) {
  return getPegawaiSectionRows(id, "riwayat_gaji_pokok", "COALESCE(`tmt_gaji`, `tanggal_sk`, '') DESC, `id` DESC");
}

export async function getPegawaiRiwayatPangkat(id) {
  return getPegawaiSectionRows(id, "riwayat_pangkat", "COALESCE(`tmt_pangkat`, `tanggal_sk`, '') DESC, `id` DESC");
}

export async function getPegawaiRiwayatPenghargaan(id) {
  return getPegawaiSectionRows(id, "riwayat_penghargaan", "COALESCE(`tanggal_sk`, '') DESC, `id` DESC");
}

export async function getPegawaiRiwayatSkp(id) {
  return getPegawaiSectionRows(id, "riwayat_skp", "COALESCE(`tahun`, '') DESC, `id` DESC");
}

export async function getPegawaiRiwayatHukumanDisiplin(id) {
  return getPegawaiSectionRows(id, "riwayat_hukuman_disiplin", "COALESCE(`tanggal_mulai`, `tanggal_sk`, '') DESC, `id` DESC");
}

export async function getPegawaiRiwayatPrestasiPendidikan(id) {
  return getPegawaiSectionRows(id, "riwayat_prestasi_pendidikan", "`id` DESC");
}

export async function getPegawaiRiwayatNarasumber(id) {
  return getPegawaiSectionRows(id, "riwayat_narasumber", "`id` DESC");
}

export async function getPegawaiRiwayatKegiatanStrategis(id) {
  return getPegawaiSectionRows(id, "riwayat_kegiatan_strategis", "COALESCE(`tahun_anggaran`, '') DESC, `id` DESC");
}

export async function getPegawaiRiwayatKeberhasilan(id) {
  return getPegawaiSectionRows(id, "riwayat_keberhasilan", "COALESCE(`tahun`, '') DESC, `id` DESC");
}

export async function createPegawaiData(data) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pool = await getConnectedPool();
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [[maxRow]] = await connection.query("SELECT COALESCE(MAX(`id_pegawai`), 0) + 1 AS next_id FROM `pegawai`");
      const synchronizedData = withLatestHistorySnapshots(data);
      const relations = {
        ...pickPegawaiRelations(synchronizedData),
        nip: synchronizedData.nip,
        nama: synchronizedData.nama
      };
      const item = {
        ...synchronizedData,
        id_pegawai: Number(maxRow.next_id),
        created_at: new Date().toISOString()
      };
      const columns = PEGAWAI_COLUMNS.filter((column) => Object.prototype.hasOwnProperty.call(item, column));
      const placeholders = columns.map(() => "?").join(", ");
      const values = columns.map((column) => normalizePegawaiColumnValue(column, item[column]));
      await connection.query(
        `INSERT INTO \`pegawai\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${placeholders})`,
        values
      );
      await savePegawaiRelations(connection, item.id_pegawai, relations);
      await connection.commit();
      return normalizeRow(item);
    } catch (error) {
      await connection?.rollback().catch(() => {});
      if (attempt === 0 && isClosedConnectionError(error)) {
        await resetPostgresPools();
        continue;
      }
      throw error;
    } finally {
      connection?.release();
    }
  }
  return null;
}

export async function updatePegawaiData(id, data) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pool = await getConnectedPool();
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const synchronizedData = withLatestHistorySnapshots(data);
      const columns = PEGAWAI_MUTABLE_COLUMNS.filter((column) => Object.prototype.hasOwnProperty.call(synchronizedData, column));
      if (columns.length) {
        await connection.query(
          `UPDATE \`pegawai\` SET ${columns.map((column) => `\`${column}\` = ?`).join(", ")} WHERE \`id_pegawai\` = ?`,
          [...columns.map((column) => normalizePegawaiColumnValue(column, synchronizedData[column])), Number(id)]
        );
      }
      await savePegawaiRelations(connection, Number(id), {
        ...pickEditablePegawaiRelations(synchronizedData),
        nip: synchronizedData.nip ?? synchronizedData.current_nip,
        nama: synchronizedData.nama ?? synchronizedData.current_nama
      });
      const [rows] = await connection.query("SELECT * FROM `pegawai` WHERE `id_pegawai` = ? LIMIT 1", [Number(id)]);
      await connection.commit();
      return rows[0] ? normalizeRow(rows[0]) : null;
    } catch (error) {
      await connection?.rollback().catch(() => {});
      if (attempt === 0 && isClosedConnectionError(error)) {
        await resetPostgresPools();
        continue;
      }
      throw error;
    } finally {
      connection?.release();
    }
  }
  return null;
}

export async function deletePegawaiData(id) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pool = await getConnectedPool();
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query("DELETE FROM `alamat` WHERE `id_pegawai` = ?", [Number(id)]);
      await connection.query("DELETE FROM `keluarga` WHERE `id_pegawai` = ?", [Number(id)]);
      for (const table of Object.keys(RIWAYAT_TABLE_CONFIG)) {
        await connection.query(`DELETE FROM \`${table}\` WHERE \`id_pegawai\` = ?`, [Number(id)]);
      }
      await connection.query("DELETE FROM `pegawai` WHERE `id_pegawai` = ?", [Number(id)]);
      await connection.commit();
      return { id_pegawai: Number(id) };
    } catch (error) {
      await connection?.rollback().catch(() => {});
      if (attempt === 0 && isClosedConnectionError(error)) {
        await resetPostgresPools();
        continue;
      }
      throw error;
    } finally {
      connection?.release();
    }
  }
  return { id_pegawai: Number(id) };
}
