import { fail } from "@/lib/helpers/response";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function trustProxyHeaders() {
  return process.env.TRUST_PROXY_HEADERS === "true" || !isProduction();
}

function getRequestOrigins(request) {
  const url = new URL(request.url);
  const origins = new Set([
    `${url.protocol}//${url.host}`,
    ...splitList(process.env.APP_URL),
    ...splitList(process.env.APP_ORIGIN),
    ...splitList(process.env.ALLOWED_ORIGINS)
  ].filter(Boolean));

  if (trustProxyHeaders()) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || url.host;
    const protocol = forwardedProto || url.protocol.replace(":", "");
    origins.add(`${protocol}://${host}`);
  }

  return origins;
}

function getSuppliedOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin) return origin;

  const referer = request.headers.get("referer");
  if (!referer) return "";

  try {
    const refererUrl = new URL(referer);
    return refererUrl.origin;
  } catch {
    return "";
  }
}

function isLocalDevelopmentOrigin(origin) {
  if (isProduction()) return false;

  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return true;
    if (host.startsWith("10.")) return true;
    if (host.startsWith("192.168.")) return true;
    const private172 = host.match(/^172\.(\d{1,2})\./);
    return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
  } catch {
    return false;
  }
}

export function isUnsafeMethod(request) {
  return !SAFE_METHODS.has(String(request?.method || "GET").toUpperCase());
}

export function validateSameOrigin(request) {
  if (!request || !isUnsafeMethod(request)) return null;

  const suppliedOrigin = getSuppliedOrigin(request);
  if (!suppliedOrigin) {
    if (process.env.NODE_ENV === "production") {
      return fail("Origin request tidak valid.", 403);
    }
    return null;
  }

  if (!getRequestOrigins(request).has(suppliedOrigin) && !isLocalDevelopmentOrigin(suppliedOrigin)) {
    return fail("Origin request tidak diizinkan.", 403);
  }

  return null;
}
