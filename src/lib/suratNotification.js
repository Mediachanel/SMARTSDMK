import { createSignedDocumentUrl } from "@/lib/suratStorage";

export function normalizeWhatsApp(value) {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.startsWith("0")) phone = `62${phone.slice(1)}`;
  if (phone.startsWith("8")) phone = `62${phone}`;
  return /^62\d{8,14}$/.test(phone) ? phone : "";
}

export async function findPegawai(pool, search) {
  const term = String(search || "").trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const [rows] = await pool.query(
    `SELECT id_pegawai AS id, nama, nrk, nip, nama_ukpd, kondisi, no_hp_pegawai
       FROM pegawai
      WHERE nama ILIKE ? OR nrk ILIKE ? OR nip ILIKE ?
      ORDER BY CASE
        WHEN LOWER(nama) = LOWER(?) THEN 0
        WHEN LOWER(nama) LIKE LOWER(?) THEN 1
        ELSE 2
      END, LENGTH(nama), nama
      LIMIT 20`,
    [like, like, like, term, `${term}%`]
  );
  return (rows || []).map((row) => ({ ...row, no_hp_pegawai: normalizeWhatsApp(row.no_hp_pegawai) }));
}

export async function sendSuratWhatsApp({ pool, request, surat }) {
  const candidates = await findPegawai(pool, surat.pelaksana);
  const pegawai = candidates.find((item) => item.nama?.toLowerCase() === String(surat.pelaksana).toLowerCase()) || candidates[0];
  if (!pegawai) throw new Error(`Pegawai ${surat.pelaksana || "pelaksana"} tidak ditemukan di PostgreSQL.`);
  const phone = normalizeWhatsApp(pegawai.no_hp_pegawai);
  if (!phone) throw new Error(`Nomor WhatsApp ${pegawai.nama} belum tersedia atau tidak valid di PostgreSQL.`);
  const base = String(process.env.WAHA_API_URL || "").replace(/\/$/, "");
  const apiKey = process.env.WAHA_API_KEY;
  const session = process.env.WAHA_SESSION || "default";
  if (!base || !apiKey) throw new Error("Konfigurasi WAHA aplikasi belum lengkap.");
  const link = surat.dokumen_path ? createSignedDocumentUrl(surat.dokumen_path, request) : "-";
  const text = `Yth. ${pegawai.nama}, ada disposisi surat masuk untuk Anda.\n\nID: ${surat.id_dokumen}\nPerihal: ${surat.perihal || "-"}\nAsal surat: ${surat.asal_surat || "-"}\nBatas waktu: ${surat.batas_waktu || "-"}\nDokumen: ${link}`;
  const response = await fetch(`${base}/api/sendText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ session, chatId: `${phone}@c.us`, text }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`WAHA menolak pengiriman (status ${response.status}).`);
  return { pegawai, phone };
}
