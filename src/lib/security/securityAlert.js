import { isIP } from "node:net";
import { getClientIp } from "@/lib/security/requestIdentity";

const WINDOW_MS = 15 * 60 * 1000;
const FAILURE_THRESHOLD = 3;
const CRITICAL_ACTIONS = new Set([
  "auth.password.change",
  "admin.password.reset_default",
  "auth.passkey.register",
  "auth.passkey.delete",
  "pegawai.delete",
  "peta_jabatan.structure.delete",
]);

function alertState() {
  if (!globalThis.__sisdmkSecurityAlerts) {
    globalThis.__sisdmkSecurityAlerts = new Map();
  }
  return globalThis.__sisdmkSecurityAlerts;
}

function privateIp(ip) {
  return (
    !isIP(ip) ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  );
}

async function lookupLocation(ip) {
  if (privateIp(ip)) return "Jaringan internal/private";
  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,region,city,connection`,
      { cache: "no-store", signal: AbortSignal.timeout(4000) },
    );
    if (!response.ok) return "Tidak tersedia";
    const data = await response.json();
    if (!data.success) return "Tidak tersedia";
    const place = [data.city, data.region, data.country]
      .filter(Boolean)
      .join(", ");
    const network = [data.connection?.isp, data.connection?.org]
      .filter(Boolean)
      .join(" / ");
    return [place, network].filter(Boolean).join(" — ") || "Tidak tersedia";
  } catch {
    return "Tidak tersedia";
  }
}

async function sendWhatsApp(text) {
  const base = String(process.env.WAHA_API_URL || "").replace(/\/$/, "");
  const apiKey = process.env.WAHA_API_KEY;
  const session = process.env.WAHA_SESSION || "default";
  const phone = String(
    process.env.SECURITY_ALERT_PHONE || "6281286538754",
  ).replace(/\D/g, "");
  if (!base || !apiKey || !phone)
    throw new Error("Security alert belum dikonfigurasi.");
  const response = await fetch(`${base}/api/sendText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ session, chatId: `${phone}@c.us`, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`WAHA status ${response.status}`);
}

function timestampWib() {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

async function sendEventAlert(request, title, event, details, count = 1) {
  const ip = request ? getClientIp(request) : "Tidak tersedia";
  const url = request?.url ? new URL(request.url) : null;
  const location = await lookupLocation(ip);
  const identity = String(
    details.username || details.nrk || details.actor || "Tidak diketahui",
  ).slice(0, 100);
  const role = String(
    details.role || details.actorRole || "Tidak tersedia",
  ).slice(0, 60);
  const userAgent = String(
    request?.headers?.get("user-agent") || "Tidak tersedia",
  ).slice(0, 300);
  await sendWhatsApp(
    `*${title}*\n\n` +
      `Waktu: ${timestampWib()} WIB\n` +
      `Jenis: ${event}\n` +
      `Jumlah dalam 15 menit: ${count}\n` +
      `Akun/identitas: ${identity}\n` +
      `Role: ${role}\n` +
      `Detail: ${String(details.reason || "-").slice(0, 180)}\n` +
      `IP sumber: ${ip}\n` +
      `Perkiraan lokasi/jaringan: ${location}\n` +
      `Akses: ${request?.method || ""} ${url?.pathname || ""}\n` +
      `Perangkat/browser: ${userAgent}\n\n` +
      `_Lokasi IP hanya perkiraan dan bukan identitas pasti seseorang._`,
  );
}

export async function notifySuspiciousActivity(request, event, details = {}) {
  if (event === "login_success" && details.role !== "SUPER_ADMIN") return;
  const ip = getClientIp(request);
  const now = Date.now();
  const device = String(request?.headers?.get("user-agent") || "unknown").slice(
    0,
    160,
  );
  const key =
    event === "login_success"
      ? `super-admin-login|${ip}|${device}`
      : `${event.startsWith("login_") ? "login" : event}|${ip}`;
  const state = alertState();
  const previous = state.get(key);
  const entry =
    !previous || previous.resetAt <= now
      ? { count: 0, resetAt: now + WINDOW_MS, notified: false }
      : previous;
  entry.count += 1;
  state.set(key, entry);

  const superAdminLogin =
    event === "login_success" && details.role === "SUPER_ADMIN";
  const urgent = event === "login_rate_limited" || superAdminLogin;
  if ((!urgent && entry.count < FAILURE_THRESHOLD) || entry.notified) return;
  entry.notified = true;

  if (superAdminLogin) {
    return sendEventAlert(
      request,
      "LOGIN SUPER ADMIN TERDETEKSI",
      event,
      details,
      entry.count,
    );
  }

  const url = request?.url ? new URL(request.url) : null;
  const location = await lookupLocation(ip);
  const attemptedIdentity = String(
    details.username || details.nrk || "Tidak diketahui",
  ).slice(0, 80);
  const reason = String(details.reason || event).slice(0, 120);
  const userAgent = String(
    request?.headers?.get("user-agent") || "Tidak tersedia",
  ).slice(0, 300);
  const timestamp = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  await sendWhatsApp(
    `🚨 *WARNING KEAMANAN SERVER*\n\nTerdeteksi percobaan akses/login mencurigakan pada SMART SDMK Dinas Kesehatan DKI.\n\n` +
      `Waktu: ${timestamp} WIB\n` +
      `Jenis: ${event}\n` +
      `Jumlah dalam 15 menit: ${entry.count}\n` +
      `IP sumber: ${ip}\n` +
      `Perkiraan lokasi/jaringan: ${location}\n` +
      `Identitas yang dicoba: ${attemptedIdentity}\n` +
      `Alasan: ${reason}\n` +
      `Akses: ${request?.method || ""} ${url?.pathname || ""}\n` +
      `Perangkat/browser: ${userAgent}\n\n` +
      `_Lokasi berdasarkan IP hanya perkiraan. Sistem tidak dapat memastikan nama asli pelaku tanpa data resmi dari penyedia jaringan._`,
  );
}

export async function notifyAuditActivity({
  request,
  user,
  action,
  entityType,
  entityId,
  metadata = {},
}) {
  if (!CRITICAL_ACTIONS.has(action)) return;
  const details = {
    ...metadata,
    actor: user?.username || user?.nama || user?.id,
    actorRole: user?.role,
    reason: `${entityType || "data"}:${entityId || "-"}`,
  };
  await sendEventAlert(request, "PERUBAHAN KRITIS SMART SDMK", action, details);
}
