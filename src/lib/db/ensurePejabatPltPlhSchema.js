const COLUMNS = [
  ["id", "SERIAL PRIMARY KEY"],
  ["jenis_penugasan", "VARCHAR(10) NOT NULL DEFAULT 'PLT'"],
  ["id_pegawai", "INTEGER NULL"],
  ["nama_pejabat", "VARCHAR(255) NOT NULL"],
  ["jabatan_saat_ini", "TEXT NULL"],
  ["ukpd_asal", "VARCHAR(255) NULL"],
  ["pangkat_golongan", "VARCHAR(100) NULL"],
  ["ukpd_tujuan", "VARCHAR(255) NOT NULL"],
  ["jabatan_tujuan", "TEXT NOT NULL"],
  ["mulai_penugasan", "DATE NOT NULL"],
  ["selesai_penugasan", "DATE NOT NULL"],
  ["created_by", "VARCHAR(100) NULL"],
  ["created_by_role", "VARCHAR(50) NULL"],
  ["created_by_ukpd", "VARCHAR(255) NULL"],
  ["created_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
  ["updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"]
];

function columnSql([name, definition]) {
  return `\`${name}\` ${definition}`;
}

export async function ensurePejabatPltPlhSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS \`pejabat_plt_plh\` (${COLUMNS.map(columnSql).join(", ")})`);
  for (const [name, definition] of COLUMNS) {
    if (name === "id") continue;
    await pool.query(`ALTER TABLE \`pejabat_plt_plh\` ADD COLUMN IF NOT EXISTS \`${name}\` ${definition}`);
  }
  await pool.query("ALTER TABLE `pejabat_plt_plh` DROP COLUMN IF EXISTS `nrk`");
  await pool.query("ALTER TABLE `pejabat_plt_plh` DROP COLUMN IF EXISTS `nip`");
}
