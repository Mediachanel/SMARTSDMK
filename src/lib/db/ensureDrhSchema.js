async function getCurrentDatabase(connection) {
  const [[row]] = await connection.query("SELECT current_schema() AS db");
  return row?.db || null;
}

async function hasTable(connection, databaseName, tableName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?`,
    [databaseName, tableName]
  );
  return Number(row?.total || 0) > 0;
}

async function hasColumn(connection, databaseName, tableName, columnName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [databaseName, tableName, columnName]
  );
  return Number(row?.total || 0) > 0;
}

async function ensureColumn(connection, databaseName, tableName, columnName, ddl) {
  if (await hasColumn(connection, databaseName, tableName, columnName)) return;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
}

async function ensureTable(connection, createSql) {
  await connection.query(createSql);
}

async function ensureUniqueIndex(connection, indexName, tableName, columns) {
  await connection.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS \`${indexName}\` ON \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(", ")})`
  );
}

async function ensureDrhIndexes(connection) {
  await ensureUniqueIndex(connection, "uniq_keluarga_sumber", "keluarga", ["sumber_tabel", "sumber_id"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_jabatan_source", "riwayat_jabatan", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_pangkat_source", "riwayat_pangkat", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_pendidikan_source", "riwayat_pendidikan", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_gaji_pokok_source", "riwayat_gaji_pokok", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_penghargaan_source", "riwayat_penghargaan", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_skp_source", "riwayat_skp", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_hukuman_source", "riwayat_hukuman_disiplin", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_prestasi_pendidikan_source", "riwayat_prestasi_pendidikan", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_narasumber_source", "riwayat_narasumber", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_kegiatan_strategis_source", "riwayat_kegiatan_strategis", ["source_key"]);
  await ensureUniqueIndex(connection, "uniq_riwayat_keberhasilan_source", "riwayat_keberhasilan", ["source_key"]);
}

export async function ensureDrhSchema(connection) {
  const databaseName = await getCurrentDatabase(connection);
  if (!databaseName) {
    throw new Error("Database aktif tidak ditemukan untuk memastikan schema DRH.");
  }

  if (!(await hasTable(connection, databaseName, "keluarga"))) {
    await ensureTable(
      connection,
      `CREATE TABLE IF NOT EXISTS \`keluarga\` (
        \`id\` SERIAL,
        \`id_pegawai\` INT NOT NULL,
        \`hubungan\` VARCHAR(50) NOT NULL,
        \`hubungan_detail\` VARCHAR(120) NULL,
        \`status_punya\` VARCHAR(30) NULL,
        \`status_tunjangan\` VARCHAR(30) NULL,
        \`urutan\` SMALLINT NULL,
        \`nama\` VARCHAR(255) NULL,
        \`jenis_kelamin\` VARCHAR(30) NULL,
        \`tempat_lahir\` VARCHAR(100) NULL,
        \`tanggal_lahir\` DATE NULL,
        \`no_tlp\` VARCHAR(50) NULL,
        \`email\` VARCHAR(255) NULL,
        \`pekerjaan\` VARCHAR(255) NULL,
        \`sumber_tabel\` VARCHAR(30) NOT NULL,
        \`sumber_id\` INT NOT NULL,
        \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uniq_keluarga_sumber\` (\`sumber_tabel\`, \`sumber_id\`),
        KEY \`idx_keluarga_pegawai\` (\`id_pegawai\`),
        KEY \`idx_keluarga_hubungan\` (\`hubungan\`),
        CONSTRAINT \`fk_keluarga_pegawai\` FOREIGN KEY (\`id_pegawai\`) REFERENCES \`pegawai\` (\`id_pegawai\`) ON DELETE CASCADE ON UPDATE CASCADE
      )`
    );
  } else {
    await ensureColumn(connection, databaseName, "keluarga", "hubungan_detail", "`hubungan_detail` VARCHAR(120) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "status_punya", "`status_punya` VARCHAR(30) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "status_tunjangan", "`status_tunjangan` VARCHAR(30) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "urutan", "`urutan` SMALLINT NULL");
    await ensureColumn(connection, databaseName, "keluarga", "jenis_kelamin", "`jenis_kelamin` VARCHAR(30) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "tempat_lahir", "`tempat_lahir` VARCHAR(100) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "tanggal_lahir", "`tanggal_lahir` DATE NULL");
    await ensureColumn(connection, databaseName, "keluarga", "no_tlp", "`no_tlp` VARCHAR(50) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "email", "`email` VARCHAR(255) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "pekerjaan", "`pekerjaan` VARCHAR(255) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "sumber_tabel", "`sumber_tabel` VARCHAR(30) NULL");
    await ensureColumn(connection, databaseName, "keluarga", "sumber_id", "`sumber_id` INT NULL");
  }

  const createStatements = [
    `CREATE TABLE IF NOT EXISTS \`riwayat_jabatan\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`gelar_depan\` VARCHAR(120) NULL,
      \`gelar_belakang\` VARCHAR(255) NULL,
      \`jenis_jabatan\` VARCHAR(40) NULL,
      \`lokasi\` VARCHAR(255) NULL,
      \`nama_jabatan_orb\` VARCHAR(255) NULL,
      \`nama_jabatan_menpan\` VARCHAR(255) NULL,
      \`struktur_atasan_langsung\` VARCHAR(255) NULL,
      \`nama_ukpd\` VARCHAR(255) NULL,
      \`wilayah\` VARCHAR(100) NULL,
      \`jenis_pegawai\` VARCHAR(80) NULL,
      \`status_rumpun\` VARCHAR(255) NULL,
      \`pangkat_golongan\` VARCHAR(120) NULL,
      \`eselon\` VARCHAR(20) NULL,
      \`tmt_jabatan\` VARCHAR(30) NULL,
      \`nomor_sk\` VARCHAR(120) NULL,
      \`tanggal_sk\` VARCHAR(30) NULL,
      \`keterangan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_jabatan_source\` (\`source_key\`),
      KEY \`idx_riwayat_jabatan_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_pangkat\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`pangkat_golongan\` VARCHAR(120) NULL,
      \`tmt_pangkat\` VARCHAR(30) NULL,
      \`lokasi\` VARCHAR(255) NULL,
      \`nomor_sk\` VARCHAR(120) NULL,
      \`tanggal_sk\` VARCHAR(30) NULL,
      \`keterangan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_pangkat_source\` (\`source_key\`),
      KEY \`idx_riwayat_pangkat_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_pendidikan\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`jenis_riwayat\` VARCHAR(30) NULL,
      \`jenjang_pendidikan\` VARCHAR(80) NULL,
      \`program_studi\` VARCHAR(255) NULL,
      \`nama_institusi\` VARCHAR(255) NULL,
      \`nama_universitas\` VARCHAR(255) NULL,
      \`kota_institusi\` VARCHAR(255) NULL,
      \`tahun_lulus\` VARCHAR(10) NULL,
      \`nomor_ijazah\` VARCHAR(120) NULL,
      \`tanggal_ijazah\` VARCHAR(30) NULL,
      \`keterangan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_pendidikan_source\` (\`source_key\`),
      KEY \`idx_riwayat_pendidikan_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_gaji_pokok\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`tmt_gaji\` VARCHAR(30) NULL,
      \`pangkat_golongan\` VARCHAR(120) NULL,
      \`gaji_pokok\` DECIMAL(15,2) NULL,
      \`nomor_sk\` VARCHAR(120) NULL,
      \`tanggal_sk\` VARCHAR(30) NULL,
      \`keterangan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_gaji_pokok_source\` (\`source_key\`),
      KEY \`idx_riwayat_gaji_pokok_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_penghargaan\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`nama_penghargaan\` VARCHAR(255) NULL,
      \`asal_penghargaan\` VARCHAR(255) NULL,
      \`nomor_sk\` VARCHAR(120) NULL,
      \`tanggal_sk\` VARCHAR(30) NULL,
      \`keterangan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_penghargaan_source\` (\`source_key\`),
      KEY \`idx_riwayat_penghargaan_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_skp\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`tahun\` VARCHAR(10) NULL,
      \`nilai_skp\` DECIMAL(6,2) NULL,
      \`nilai_perilaku\` DECIMAL(6,2) NULL,
      \`nilai_prestasi\` DECIMAL(6,2) NULL,
      \`keterangan_prestasi\` TEXT NULL,
      \`keterangan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_skp_source\` (\`source_key\`),
      KEY \`idx_riwayat_skp_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_hukuman_disiplin\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`tanggal_mulai\` VARCHAR(30) NULL,
      \`tanggal_akhir\` VARCHAR(30) NULL,
      \`hukuman_disiplin\` VARCHAR(255) NULL,
      \`nomor_sk\` VARCHAR(120) NULL,
      \`tanggal_sk\` VARCHAR(30) NULL,
      \`keterangan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_hukuman_source\` (\`source_key\`),
      KEY \`idx_riwayat_hukuman_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_prestasi_pendidikan\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`kategori\` VARCHAR(30) NULL,
      \`jenjang_pendidikan\` VARCHAR(80) NULL,
      \`prestasi\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_prestasi_pendidikan_source\` (\`source_key\`),
      KEY \`idx_riwayat_prestasi_pendidikan_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_narasumber\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`kegiatan\` VARCHAR(255) NULL,
      \`judul_materi\` TEXT NULL,
      \`lembaga_penyelenggara\` VARCHAR(255) NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_narasumber_source\` (\`source_key\`),
      KEY \`idx_riwayat_narasumber_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_kegiatan_strategis\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`kegiatan\` VARCHAR(255) NULL,
      \`tahun_anggaran\` VARCHAR(20) NULL,
      \`jumlah_anggaran\` DECIMAL(18,2) NULL,
      \`kedudukan_dalam_kegiatan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_kegiatan_strategis_source\` (\`source_key\`),
      KEY \`idx_riwayat_kegiatan_strategis_pegawai\` (\`id_pegawai\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`riwayat_keberhasilan\` (
      \`id\` SERIAL,
      \`id_pegawai\` INT NOT NULL,
      \`nip\` VARCHAR(64) NULL,
      \`nama_pegawai\` VARCHAR(255) NOT NULL,
      \`jabatan\` VARCHAR(255) NULL,
      \`tahun\` VARCHAR(20) NULL,
      \`keberhasilan\` TEXT NULL,
      \`kendala_yang_dihadapi\` TEXT NULL,
      \`solusi_yang_dilakukan\` TEXT NULL,
      \`sumber\` VARCHAR(80) NULL,
      \`source_key\` VARCHAR(191) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_riwayat_keberhasilan_source\` (\`source_key\`),
      KEY \`idx_riwayat_keberhasilan_pegawai\` (\`id_pegawai\`)
    )`
  ];

  for (const statement of createStatements) {
    await ensureTable(connection, statement);
  }

  await ensureDrhIndexes(connection);
}
