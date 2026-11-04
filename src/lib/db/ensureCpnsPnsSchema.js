import { CPNS_PNS_STAGE_ONE_CLOSES_AT } from "@/lib/usulan/cpnsPns";

const COLUMNS = [
  ["id", "SERIAL PRIMARY KEY"],
  ["id_pegawai", "INTEGER NULL"],
  ["nrk", "VARCHAR(32) NULL"],
  ["nip", "VARCHAR(64) NOT NULL"],
  ["nama_pegawai", "VARCHAR(255) NOT NULL"],
  ["nama_ukpd", "VARCHAR(255) NOT NULL"],
  ["wilayah", "VARCHAR(120) NULL"],
  ["pangkat_golongan", "VARCHAR(120) NULL"],
  ["jabatan", "VARCHAR(255) NULL"],
  ["tahap", "SMALLINT NOT NULL DEFAULT 1"],
  ["status_latsar", "VARCHAR(50) NULL DEFAULT 'Sudah STTPL'"],
  ["status", "VARCHAR(50) NOT NULL DEFAULT 'Draft CPNS'"],
  ["nomor_tanggal_sttpl", "VARCHAR(255) NULL"],
  ["nomor_tanggal_suket", "VARCHAR(255) NULL"],
  ["nomor_sttpl", "VARCHAR(160) NULL"],
  ["tanggal_sttpl", "VARCHAR(30) NULL"],
  ["nomor_suket", "VARCHAR(160) NULL"],
  ["tanggal_suket", "VARCHAR(30) NULL"],
  ["keterangan_lampiran", "TEXT NULL"],
  ["dokumen", "TEXT NULL"],
  ["verifikasi", "TEXT NULL"],
  ["catatan", "TEXT NULL"],
  ["created_by_ukpd", "VARCHAR(255) NULL"],
  ["created_by", "VARCHAR(120) NULL"],
  ["created_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
  ["updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"]
];

const AUTO_STAGE_TWO_STATUSES = ["Draft CPNS", "Dikembalikan ke CPNS", "Diajukan ke Admin UKPD"];
const CPNS_PNS_STAGE_ONE_BKD_SUBMITS_AT = new Date("2026-09-07T12:00:00+07:00");
const CPNS_PNS_STAGE_TWO_BKD_SUBMITS_AT = new Date("2026-10-07T10:00:00+07:00");

function columnSql([name, definition]) {
  return `\`${name}\` ${definition}`;
}

export async function autoAdvanceCpnsPnsToStageTwo(pool, now = new Date()) {
  if (now < CPNS_PNS_STAGE_ONE_CLOSES_AT) return 0;

  const placeholders = AUTO_STAGE_TWO_STATUSES.map(() => "?").join(", ");
  const [result] = await pool.query(
    `UPDATE \`usulan_cpns_pns\`
     SET \`tahap\` = 2,
         \`status_latsar\` = 'Proses Latsar/STTPL',
         \`status\` = CASE WHEN \`status\` = 'Diajukan ke Admin UKPD' THEN \`status\` ELSE 'Draft CPNS' END,
         \`updated_at\` = NOW()
     WHERE \`tahap\` = 1 AND \`status\` IN (${placeholders})`,
    AUTO_STAGE_TWO_STATUSES
  );
  return Number(result?.affectedRows || 0);
}

export async function autoProcessCpnsPnsStageOne(pool, now = new Date()) {
  if (now < CPNS_PNS_STAGE_ONE_CLOSES_AT) return { recapped: 0, submitted: 0 };

  const [recapResult] = await pool.query(
    `UPDATE \`usulan_cpns_pns\`
     SET \`status\` = 'Direkap Dinkes', \`updated_at\` = NOW()
     WHERE \`tahap\` = 1 AND \`status\` = 'Terverifikasi Admin UKPD'`
  );

  let submitted = 0;
  if (now >= CPNS_PNS_STAGE_ONE_BKD_SUBMITS_AT) {
    const [submitResult] = await pool.query(
      `UPDATE \`usulan_cpns_pns\`
       SET \`status\` = 'Diusulkan ke BKD', \`updated_at\` = NOW()
       WHERE \`tahap\` = 1 AND \`status\` = 'Direkap Dinkes'`
    );
    submitted = Number(submitResult?.affectedRows || 0);
  }

  if (now >= CPNS_PNS_STAGE_TWO_BKD_SUBMITS_AT) {
    const [stageTwoSubmitResult] = await pool.query(
      `UPDATE \`usulan_cpns_pns\`
       SET \`status\` = 'Diusulkan ke BKD', \`updated_at\` = NOW()
       WHERE \`tahap\` = 2 AND \`status\` = 'Terverifikasi Admin UKPD'`
    );
    submitted += Number(stageTwoSubmitResult?.affectedRows || 0);
  }

  return { recapped: Number(recapResult?.affectedRows || 0), submitted };
}

export async function ensureCpnsPnsSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS \`usulan_cpns_pns\` (${COLUMNS.map(columnSql).join(", ")})`);
  for (const [name, definition] of COLUMNS.filter(([name]) => name !== "id")) {
    await pool.query(`ALTER TABLE \`usulan_cpns_pns\` ADD COLUMN IF NOT EXISTS \`${name}\` ${definition}`);
  }
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS `usulan_cpns_pns_nip_unique` ON `usulan_cpns_pns` (`nip`)");
  await pool.query("CREATE INDEX IF NOT EXISTS `usulan_cpns_pns_ukpd_idx` ON `usulan_cpns_pns` (`nama_ukpd`)");
  await pool.query("CREATE INDEX IF NOT EXISTS `usulan_cpns_pns_status_idx` ON `usulan_cpns_pns` (`status`)");
  await pool.query("UPDATE `usulan_cpns_pns` SET `status` = 'Draft CPNS' WHERE `status` IN ('Belum Lengkap', 'Draft UKPD')");
  await pool.query("UPDATE `usulan_cpns_pns` SET `status` = 'Diajukan ke Admin UKPD' WHERE `status` IN ('Diajukan UKPD', 'Diajukan ke Sudin', 'Verifikasi Sudin')");
  await pool.query("UPDATE `usulan_cpns_pns` SET `status` = 'Dikembalikan ke CPNS' WHERE `status` IN ('Dikembalikan', 'Dikembalikan ke UKPD')");
  await pool.query("UPDATE `usulan_cpns_pns` SET `status` = 'Terverifikasi Admin UKPD' WHERE `status` IN ('Valid', 'Terverifikasi Sudin')");
  await pool.query("UPDATE `usulan_cpns_pns` SET `status` = 'Diusulkan ke BKD' WHERE `status` = 'Siap Dikirim ke BKD'");
  await autoAdvanceCpnsPnsToStageTwo(pool);
  await autoProcessCpnsPnsStageOne(pool);
}
