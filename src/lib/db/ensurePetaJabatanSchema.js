let ensurePromise;

export async function ensurePetaJabatanSchema(pool) {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS peta_jabatan (
          id BIGSERIAL PRIMARY KEY,
          source_key VARCHAR(120) NOT NULL UNIQUE,
          source_sheet VARCHAR(120) NOT NULL,
          source_row INTEGER NOT NULL,
          template_ukpd VARCHAR(120) NOT NULL,
          nama_ukpd_source VARCHAR(255),
          nama_jabatan_orb TEXT,
          kelas_jabatan_orb VARCHAR(30),
          nama_jabatan_menpan TEXT,
          kelas_jabatan_menpan VARCHAR(30),
          atasan_langsung TEXT,
          rumpun_jabatan TEXT,
          kebutuhan_asn INTEGER NOT NULL DEFAULT 0 CHECK (kebutuhan_asn >= 0),
          kebutuhan_non_asn INTEGER NOT NULL DEFAULT 0 CHECK (kebutuhan_non_asn >= 0),
          urutan INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query("ALTER TABLE peta_jabatan ADD COLUMN IF NOT EXISTS nama_ukpd_source VARCHAR(255)");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_peta_jabatan_template ON peta_jabatan (template_ukpd, urutan)");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_peta_jabatan_menpan ON peta_jabatan (lower(nama_jabatan_menpan))");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_peta_jabatan_orb ON peta_jabatan (lower(nama_jabatan_orb))");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_peta_jabatan_atasan ON peta_jabatan (lower(atasan_langsung))");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS peta_jabatan_kebutuhan_override (
          id BIGSERIAL PRIMARY KEY,
          peta_jabatan_id BIGINT NOT NULL REFERENCES peta_jabatan(id) ON DELETE CASCADE,
          nama_ukpd VARCHAR(255) NOT NULL,
          kebutuhan_asn INTEGER NOT NULL DEFAULT 0 CHECK (kebutuhan_asn >= 0),
          kebutuhan_non_asn INTEGER NOT NULL DEFAULT 0 CHECK (kebutuhan_non_asn >= 0),
          updated_by VARCHAR(120),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (peta_jabatan_id, nama_ukpd)
        )
      `);
      await pool.query("CREATE INDEX IF NOT EXISTS idx_peta_kebutuhan_override_ukpd ON peta_jabatan_kebutuhan_override (lower(nama_ukpd))");
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}
