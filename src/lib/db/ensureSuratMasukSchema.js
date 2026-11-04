let ensurePromise;

export function ensureSuratMasukSchema(pool) {
  if (!ensurePromise) {
    ensurePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS surat_masuk (
        id BIGSERIAL PRIMARY KEY,
        id_dokumen VARCHAR(80) NOT NULL UNIQUE,
        tanggal_terima VARCHAR(20), jam_terima VARCHAR(20), sumber VARCHAR(80),
        pengirim_wa VARCHAR(80), asal_surat TEXT, nomor_surat VARCHAR(240),
        tanggal_surat VARCHAR(80), perihal TEXT, nama_pegawai_subjek TEXT,
        nip_nrk VARCHAR(80), kategori_layanan VARCHAR(180), sifat VARCHAR(80),
        prioritas VARCHAR(80), tujuan_disposisi TEXT, pelaksana VARCHAR(240),
        status VARCHAR(120), batas_waktu VARCHAR(80), tanggal_disposisi_arsip VARCHAR(80),
        catatan TEXT, tindak_lanjut TEXT, tanggal_selesai VARCHAR(80),
        nomor_eoffice VARCHAR(240), nomor_surat_kabid VARCHAR(240), nomor_surat_umum VARCHAR(240),
        dokumen_path TEXT, dokumen_nama TEXT, dokumen_mime VARCHAR(160), dokumen_ukuran BIGINT,
        ringkasan TEXT, confidence VARCHAR(80), sumber_input VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
        dibuat_oleh VARCHAR(160), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS surat_masuk_tanggal_idx ON surat_masuk (tanggal_terima);
      CREATE INDEX IF NOT EXISTS surat_masuk_pelaksana_idx ON surat_masuk (pelaksana);
      CREATE INDEX IF NOT EXISTS surat_masuk_status_idx ON surat_masuk (status);
      ALTER TABLE surat_masuk ADD COLUMN IF NOT EXISTS notifikasi_wa_at TIMESTAMPTZ;
      ALTER TABLE surat_masuk ADD COLUMN IF NOT EXISTS notifikasi_wa_nomor VARCHAR(40);
    `).catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}
