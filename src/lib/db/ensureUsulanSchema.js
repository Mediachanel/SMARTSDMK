const USULAN_TABLES = {
  usulan_mutasi: [
    ["id", "SERIAL PRIMARY KEY"],
    ["nrk", "VARCHAR(32) NULL"],
    ["nip", "VARCHAR(64) NULL"],
    ["nama_pegawai", "VARCHAR(255) NULL"],
    ["gelar_depan", "VARCHAR(120) NULL"],
    ["gelar_belakang", "VARCHAR(255) NULL"],
    ["nama_ukpd", "VARCHAR(255) NULL"],
    ["ukpd_tujuan", "VARCHAR(255) NULL"],
    ["jabatan", "VARCHAR(255) NULL"],
    ["jabatan_baru", "VARCHAR(255) NULL"],
    ["pangkat_golongan", "VARCHAR(120) NULL"],
    ["abk_j_lama", "INTEGER NULL"],
    ["bezetting_j_lama", "INTEGER NULL"],
    ["nonasn_bezetting_lama", "INTEGER NULL"],
    ["nonasn_abk_lama", "INTEGER NULL"],
    ["abk_j_baru", "INTEGER NULL"],
    ["bezetting_j_baru", "INTEGER NULL"],
    ["nonasn_bezetting_baru", "INTEGER NULL"],
    ["nonasn_abk_baru", "INTEGER NULL"],
    ["jenis_mutasi", "VARCHAR(120) NULL"],
    ["alasan", "TEXT NULL"],
    ["berkas_path", "TEXT NULL"],
    ["status", "VARCHAR(50) NULL DEFAULT 'Diusulkan'"],
    ["verif_checklist", "TEXT NULL"],
    ["dokumen_checklist", "TEXT NULL"],
    ["keterangan", "TEXT NULL"],
    ["tanggal_usulan", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["created_by_ukpd", "VARCHAR(255) NULL"],
    ["created_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["mutasi_id", "INTEGER NULL"]
  ],
  usulan_pjf_stop: [
    ["id", "SERIAL PRIMARY KEY"],
    ["nrk", "VARCHAR(32) NULL"],
    ["nip", "VARCHAR(64) NULL"],
    ["nama_pegawai", "VARCHAR(255) NULL"],
    ["gelar_depan", "VARCHAR(120) NULL"],
    ["gelar_belakang", "VARCHAR(255) NULL"],
    ["pangkat_golongan", "VARCHAR(120) NULL"],
    ["nama_ukpd", "VARCHAR(255) NULL"],
    ["ukpd_tujuan", "VARCHAR(255) NULL"],
    ["jabatan", "VARCHAR(255) NULL"],
    ["jabatan_baru", "VARCHAR(255) NULL"],
    ["angka_kredit", "DECIMAL(12,2) NULL"],
    ["abk_j_lama", "INTEGER NULL"],
    ["bezetting_j_lama", "INTEGER NULL"],
    ["nonasn_bezetting_lama", "INTEGER NULL"],
    ["nonasn_abk_lama", "INTEGER NULL"],
    ["abk_j_baru", "INTEGER NULL"],
    ["bezetting_j_baru", "INTEGER NULL"],
    ["nonasn_bezetting_baru", "INTEGER NULL"],
    ["nonasn_abk_baru", "INTEGER NULL"],
    ["nomor_surat", "VARCHAR(120) NULL"],
    ["tanggal_surat", "VARCHAR(30) NULL"],
    ["hal", "TEXT NULL"],
    ["pimpinan", "VARCHAR(255) NULL"],
    ["asal_surat", "VARCHAR(255) NULL"],
    ["alasan_pemutusan", "TEXT NULL"],
    ["berkas_path", "TEXT NULL"],
    ["status", "VARCHAR(50) NULL DEFAULT 'Diusulkan'"],
    ["verif_checklist", "TEXT NULL"],
    ["dokumen_checklist", "TEXT NULL"],
    ["keterangan", "TEXT NULL"],
    ["tanggal_usulan", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["created_by_ukpd", "VARCHAR(255) NULL"],
    ["created_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"]
  ]
};

function columnSql([name, definition]) {
  return `\`${name}\` ${definition}`;
}

async function ensureTable(pool, table, columns) {
  await pool.query(`CREATE TABLE IF NOT EXISTS \`${table}\` (${columns.map(columnSql).join(", ")})`);
  for (const [name, definition] of columns.filter(([name]) => name !== "id")) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN IF NOT EXISTS \`${name}\` ${definition}`);
  }
}

export async function ensureUsulanSchema(pool) {
  for (const [table, columns] of Object.entries(USULAN_TABLES)) {
    await ensureTable(pool, table, columns);
  }
}
