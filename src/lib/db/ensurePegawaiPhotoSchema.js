async function hasColumn(connection, databaseName, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function ensureColumn(connection, databaseName, tableName, columnName, ddl) {
  if (await hasColumn(connection, databaseName, tableName, columnName)) return;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
}

export async function ensurePegawaiPhotoSchema(poolOrConnection) {
  const [[databaseRow]] = await poolOrConnection.query("SELECT DATABASE() AS database_name");
  const databaseName = databaseRow?.database_name || "public";
  await ensureColumn(poolOrConnection, databaseName, "pegawai", "foto_profil_url", "`foto_profil_url` TEXT NULL");
  await ensureColumn(poolOrConnection, databaseName, "pegawai", "foto_profil_path", "`foto_profil_path` TEXT NULL");
  await ensureColumn(poolOrConnection, databaseName, "pegawai", "foto_profil_content_type", "`foto_profil_content_type` VARCHAR(80) NULL");
  await ensureColumn(poolOrConnection, databaseName, "pegawai", "foto_profil_size", "`foto_profil_size` INT NULL");
  await ensureColumn(poolOrConnection, databaseName, "pegawai", "foto_profil_updated_at", "`foto_profil_updated_at` TIMESTAMP NULL");
}
