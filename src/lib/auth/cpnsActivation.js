import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { getConnectedPool } from "@/lib/db/postgres";

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_SENDS_PER_HOUR = 5;
const ACTIVATION_TTL_MINUTES = 15;

function digest(value) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET belum dikonfigurasi.");
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

function safeDigestEqual(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function maskEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return "email terdaftar";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(3, Math.min(8, local.length - 2)))}@${domain}`;
}

export async function ensureCpnsAuthSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS \`cpns_auth\` (
    \`id_pegawai\` INTEGER PRIMARY KEY,
    \`nrk\` VARCHAR(32) NOT NULL UNIQUE,
    \`password_hash\` VARCHAR(255) NOT NULL,
    \`activated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS \`cpns_activation_otp\` (
    \`nrk\` VARCHAR(32) PRIMARY KEY,
    \`id_pegawai\` INTEGER NOT NULL,
    \`phone\` VARCHAR(24) NOT NULL DEFAULT '',
    \`email\` VARCHAR(320) NULL,
    \`otp_hash\` VARCHAR(64) NULL,
    \`expires_at\` TIMESTAMP NULL,
    \`attempts\` SMALLINT NOT NULL DEFAULT 0,
    \`resend_after\` TIMESTAMP NULL,
    \`activation_token_hash\` VARCHAR(64) NULL,
    \`activation_expires_at\` TIMESTAMP NULL,
    \`hour_started_at\` TIMESTAMP NULL,
    \`hour_send_count\` SMALLINT NOT NULL DEFAULT 0,
    \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query("ALTER TABLE `cpns_activation_otp` ADD COLUMN IF NOT EXISTS `email` VARCHAR(320) NULL");
  await pool.query("ALTER TABLE `cpns_activation_otp` ADD COLUMN IF NOT EXISTS `hour_started_at` TIMESTAMP NULL");
  await pool.query("ALTER TABLE `cpns_activation_otp` ADD COLUMN IF NOT EXISTS `hour_send_count` SMALLINT NOT NULL DEFAULT 0");
}

async function findCpns(pool, nrk) {
  const [rows] = await pool.query(
    `SELECT \`id_pegawai\`, BTRIM(\`nrk\`) AS \`nrk\`, \`nama\`, \`nama_ukpd\`, \`wilayah\`, \`email\`
     FROM \`pegawai\`
     WHERE LOWER(COALESCE(\`jenis_pegawai\`, '')) = 'cpns'
       AND LOWER(COALESCE(\`kondisi\`, 'aktif')) = 'aktif'
       AND BTRIM(COALESCE(\`nrk\`, '')) = ?
       AND (SELECT COUNT(*) FROM \`pegawai\` p2 WHERE LOWER(COALESCE(p2.\`jenis_pegawai\`, '')) = 'cpns' AND LOWER(COALESCE(p2.\`kondisi\`, 'aktif')) = 'aktif' AND BTRIM(COALESCE(p2.\`nrk\`, '')) = ?) = 1
     LIMIT 1`,
    [nrk, nrk],
  );
  return rows[0] || null;
}

async function sendOtp(email, otp, name) {
  const user = String(process.env.EMAIL_SMTP_USER || "").trim();
  const pass = String(process.env.EMAIL_SMTP_PASS || "").replace(/\s/g, "");
  if (!user || !pass) throw new Error("Layanan email OTP belum dikonfigurasi.");
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_SMTP_PORT || 465),
    secure: String(process.env.EMAIL_SMTP_SECURE || "true") === "true",
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  const safeName = escapeHtml(name || "CPNS");
  await transporter.sendMail({
    from: `SMART SDMK Dinas Kesehatan <${user}>`,
    to: email,
    subject: "Kode OTP Aktivasi Usulan CPNS menjadi PNS",
    text: `Yth. ${name || "CPNS"},\n\nKode OTP aktivasi SMART SDMK Anda: ${otp}\n\nKode berlaku ${OTP_TTL_MINUTES} menit dan hanya dapat digunakan satu kali. Jangan berikan kode ini kepada siapa pun.\n\nSMART SDMK\nDinas Kesehatan Provinsi DKI Jakarta`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a"><div style="background:#083b72;color:white;padding:22px;border-radius:16px 16px 0 0"><b>SMART SDMK</b><br><span style="font-size:13px">Dinas Kesehatan Provinsi DKI Jakarta</span></div><div style="border:1px solid #dbeafe;padding:24px;border-radius:0 0 16px 16px"><p>Yth. <b>${safeName}</b>,</p><p>Kode OTP aktivasi Usulan CPNS menjadi PNS:</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;background:#eff6ff;color:#1d4ed8;padding:18px;border-radius:12px">${otp}</div><p style="font-size:13px;color:#475569">Berlaku ${OTP_TTL_MINUTES} menit dan hanya dapat digunakan satu kali. Jangan berikan kode ini kepada siapa pun.</p></div></div>`,
  });
}

export async function requestCpnsOtp(nrk) {
  const pool = await getConnectedPool();
  await ensureCpnsAuthSchema(pool);
  const cpns = await findCpns(pool, nrk);
  if (!cpns)
    return {
      ok: false,
      status: 404,
      message: "NRK CPNS tidak ditemukan atau tidak aktif.",
    };
  const email = normalizeEmail(cpns.email);
  if (!email)
    return {
      ok: false,
      status: 422,
      message:
        "Email pada data pegawai belum tersedia atau belum valid. Hubungi Admin UKPD.",
    };
  const [existingRows] = await pool.query(
    "SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (`resend_after` - NOW())))) AS `retry_after_seconds`, CASE WHEN `hour_started_at` > NOW() - INTERVAL '1 hour' THEN `hour_send_count` ELSE 0 END AS `hour_send_count` FROM `cpns_activation_otp` WHERE `nrk` = ? LIMIT 1",
    [nrk],
  );
  const retryAfter = Number(existingRows[0]?.retry_after_seconds || 0);
  if (retryAfter > 0)
    return {
      ok: false,
      status: 429,
      message: `Tunggu ${Math.ceil(retryAfter)} detik sebelum meminta OTP baru.`,
    };
  const hourSendCount = Number(existingRows[0]?.hour_send_count || 0);
  if (hourSendCount >= OTP_MAX_SENDS_PER_HOUR)
    return { ok: false, status: 429, message: "Batas pengiriman OTP per jam tercapai. Coba kembali satu jam lagi." };
  const otp = String(randomInt(100000, 1000000));
  await pool.query(
    `INSERT INTO \`cpns_activation_otp\` (\`nrk\`, \`id_pegawai\`, \`phone\`, \`email\`, \`otp_hash\`, \`expires_at\`, \`attempts\`, \`resend_after\`, \`activation_token_hash\`, \`activation_expires_at\`, \`hour_started_at\`, \`hour_send_count\`, \`updated_at\`)
     VALUES (?, ?, '', ?, ?, NOW() + INTERVAL '${OTP_TTL_MINUTES} minutes', 0, NOW() + INTERVAL '${OTP_RESEND_SECONDS} seconds', NULL, NULL, NOW(), 1, NOW())
     ON CONFLICT (\`nrk\`) DO UPDATE SET \`id_pegawai\` = EXCLUDED.\`id_pegawai\`, \`email\` = EXCLUDED.\`email\`, \`otp_hash\` = EXCLUDED.\`otp_hash\`, \`expires_at\` = EXCLUDED.\`expires_at\`, \`attempts\` = 0, \`resend_after\` = EXCLUDED.\`resend_after\`, \`activation_token_hash\` = NULL, \`activation_expires_at\` = NULL, \`hour_send_count\` = CASE WHEN \`cpns_activation_otp\`.\`hour_started_at\` > NOW() - INTERVAL '1 hour' THEN \`cpns_activation_otp\`.\`hour_send_count\` + 1 ELSE 1 END, \`hour_started_at\` = CASE WHEN \`cpns_activation_otp\`.\`hour_started_at\` > NOW() - INTERVAL '1 hour' THEN \`cpns_activation_otp\`.\`hour_started_at\` ELSE NOW() END, \`updated_at\` = NOW() RETURNING \`nrk\``,
    [nrk, cpns.id_pegawai, email, digest(`${nrk}:${otp}`)],
  );
  try {
    await sendOtp(email, otp, cpns.nama);
  } catch (error) {
    await pool.query("DELETE FROM `cpns_activation_otp` WHERE `nrk` = ?", [
      nrk,
    ]);
    throw error;
  }
  return { ok: true, maskedEmail: maskEmail(email) };
}

export async function verifyCpnsOtp(nrk, otp) {
  const pool = await getConnectedPool();
  await ensureCpnsAuthSchema(pool);
  const [rows] = await pool.query(
    "SELECT *, (`expires_at` > NOW()) AS `otp_active` FROM `cpns_activation_otp` WHERE `nrk` = ? LIMIT 1",
    [nrk],
  );
  const record = rows[0];
  if (!record || !record.otp_hash || !record.otp_active)
    return {
      ok: false,
      status: 410,
      message: "Kode OTP sudah kedaluwarsa. Minta kode baru.",
    };
  if (Number(record.attempts) >= OTP_MAX_ATTEMPTS)
    return {
      ok: false,
      status: 429,
      message: "Batas percobaan OTP tercapai. Minta kode baru.",
    };
  const valid = safeDigestEqual(digest(`${nrk}:${otp}`), record.otp_hash);
  if (!valid) {
    await pool.query(
      "UPDATE `cpns_activation_otp` SET `attempts` = `attempts` + 1, `updated_at` = NOW() WHERE `nrk` = ?",
      [nrk],
    );
    return { ok: false, status: 401, message: "Kode OTP tidak sesuai." };
  }
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `UPDATE \`cpns_activation_otp\` SET \`otp_hash\` = NULL, \`activation_token_hash\` = ?, \`activation_expires_at\` = NOW() + INTERVAL '${ACTIVATION_TTL_MINUTES} minutes', \`updated_at\` = NOW() WHERE \`nrk\` = ?`,
    [digest(`${nrk}:${token}`), nrk],
  );
  return { ok: true, token };
}

export async function activateCpnsPassword(nrk, token, password) {
  const pool = await getConnectedPool();
  await ensureCpnsAuthSchema(pool);
  const [rows] = await pool.query(
    "SELECT *, (`activation_expires_at` > NOW()) AS `activation_active` FROM `cpns_activation_otp` WHERE `nrk` = ? LIMIT 1",
    [nrk],
  );
  const record = rows[0];
  const valid =
    record?.activation_token_hash &&
    record.activation_active &&
    safeDigestEqual(digest(`${nrk}:${token}`), record.activation_token_hash);
  if (!valid)
    return {
      ok: false,
      status: 401,
      message: "Sesi aktivasi tidak valid atau sudah kedaluwarsa.",
    };
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO \`cpns_auth\` (\`id_pegawai\`, \`nrk\`, \`password_hash\`, \`activated_at\`, \`updated_at\`) VALUES (?, ?, ?, NOW(), NOW())
     ON CONFLICT (\`id_pegawai\`) DO UPDATE SET \`nrk\` = EXCLUDED.\`nrk\`, \`password_hash\` = EXCLUDED.\`password_hash\`, \`activated_at\` = NOW(), \`updated_at\` = NOW() RETURNING \`id_pegawai\``,
    [record.id_pegawai, nrk, passwordHash],
  );
  await pool.query("DELETE FROM `cpns_activation_otp` WHERE `nrk` = ?", [nrk]);
  return { ok: true };
}

export async function findActivatedCpns(nrk) {
  const pool = await getConnectedPool();
  await ensureCpnsAuthSchema(pool);
  const cpns = await findCpns(pool, nrk);
  if (!cpns) return null;
  const [rows] = await pool.query(
    "SELECT `password_hash` FROM `cpns_auth` WHERE `id_pegawai` = ? AND `nrk` = ? LIMIT 1",
    [cpns.id_pegawai, nrk],
  );
  if (!rows[0]) return null;
  return {
    id: cpns.id_pegawai,
    id_pegawai: cpns.id_pegawai,
    username: cpns.nrk,
    nama: cpns.nama,
    nama_ukpd: cpns.nama_ukpd,
    wilayah: cpns.wilayah || "-",
    role: "CPNS",
    passwordHash: rows[0].password_hash,
  };
}
