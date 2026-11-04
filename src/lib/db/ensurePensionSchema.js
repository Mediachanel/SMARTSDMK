export async function ensurePensionSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS \`usulan_pensiun\` (
    \`id\` SERIAL PRIMARY KEY,
    \`id_pegawai\` INTEGER NULL,
    \`nrk\` VARCHAR(32) NULL,
    \`nip\` VARCHAR(64) NULL,
    \`nama_pegawai\` VARCHAR(255) NULL,
    \`nama_ukpd\` VARCHAR(255) NULL,
    \`wilayah\` VARCHAR(120) NULL,
    \`pangkat_golongan\` VARCHAR(120) NULL,
    \`jabatan\` VARCHAR(255) NULL,
    \`jenis_pensiun\` VARCHAR(50) NULL,
    \`tmt_pensiun\` VARCHAR(30) NULL,
    \`status\` VARCHAR(80) NULL DEFAULT 'Draft UKPD',
    \`catatan\` TEXT NULL,
    \`dokumen\` TEXT NULL,
    \`verifikasi\` TEXT NULL,
    \`created_by\` VARCHAR(120) NULL,
    \`created_by_ukpd\` VARCHAR(255) NULL,
    \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const [name, def] of [
    ["id_pegawai", "INTEGER NULL"], ["nrk", "VARCHAR(32) NULL"], ["nip", "VARCHAR(64) NULL"],
    ["nama_pegawai", "VARCHAR(255) NULL"], ["nama_ukpd", "VARCHAR(255) NULL"], ["wilayah", "VARCHAR(120) NULL"],
    ["pangkat_golongan", "VARCHAR(120) NULL"], ["jabatan", "VARCHAR(255) NULL"], ["jenis_pensiun", "VARCHAR(50) NULL"],
    ["tmt_pensiun", "VARCHAR(30) NULL"], ["status", "VARCHAR(80) NULL DEFAULT 'Draft UKPD'"], ["catatan", "TEXT NULL"],
    ["dokumen", "TEXT NULL"], ["verifikasi", "TEXT NULL"], ["created_by", "VARCHAR(120) NULL"],
    ["created_by_ukpd", "VARCHAR(255) NULL"], ["created_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"], ["updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"]
  ]) await pool.query(`ALTER TABLE \`usulan_pensiun\` ADD COLUMN IF NOT EXISTS \`${name}\` ${def}`);
}
