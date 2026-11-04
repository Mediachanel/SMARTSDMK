const WEAK_JWT_SECRETS = new Set([
  "dev-secret-change-me",
  "sisdmk2-secret-ganti-nanti",
  "change-this-secret-in-production",
  "dev-local-secret",
  "dev-local-only-change-me",
  "ganti-dengan-secret-yang-panjang-dan-acak"
]);

const encoder = new TextEncoder();
const SESSION_ISSUER = "sisdmk-si-data";
const SESSION_AUDIENCE = "sisdmk-web";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function allowInsecureLocalHttp() {
  return process.env.ALLOW_INSECURE_LOCAL_HTTP === "true";
}

function normalizeSecret(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

export function getJwtSecret() {
  const configured = normalizeSecret(process.env.JWT_SECRET);
  const fallback = isProduction() ? "" : "dev-secret-change-me";
  const secret = configured || fallback;

  if (!secret) {
    throw new Error("JWT_SECRET wajib diset di production.");
  }

  if (isProduction() && (secret.length < 32 || WEAK_JWT_SECRETS.has(secret))) {
    throw new Error("JWT_SECRET production harus acak, kuat, dan minimal 32 karakter.");
  }

  return encoder.encode(secret);
}

export function getSessionJwtClaims() {
  return {
    issuer: process.env.JWT_ISSUER || SESSION_ISSUER,
    audience: process.env.JWT_AUDIENCE || SESSION_AUDIENCE
  };
}

export function getSessionCookieOptions(overrides = {}) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: (isProduction() && !allowInsecureLocalHttp()) || process.env.COOKIE_SECURE === "true",
    priority: "high",
    path: "/",
    ...overrides
  };
}
