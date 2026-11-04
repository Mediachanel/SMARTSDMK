export async function ensurePegawaiStatusSchema(poolOrConnection) {
  await poolOrConnection.query(
    "ALTER TABLE `pegawai` ADD COLUMN IF NOT EXISTS `tanggal_kondisi` DATE NULL"
  );
}
