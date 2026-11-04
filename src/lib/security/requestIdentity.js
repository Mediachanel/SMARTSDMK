import { isIP } from "node:net";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function trustProxyHeaders() {
  return process.env.TRUST_PROXY_HEADERS === "true" || !isProduction();
}

function validIp(value) {
  const candidate = String(value || "").trim().replace(/^\[|\]$/g, "");
  return isIP(candidate) ? candidate : "";
}

export function getClientIp(request) {
  const cloudflareIp = validIp(request?.headers?.get("cf-connecting-ip"));
  if (cloudflareIp) return cloudflareIp;

  if (trustProxyHeaders()) {
    const forwardedIp = validIp(request?.headers?.get("x-forwarded-for")?.split(",")[0]);
    const realIp = validIp(request?.headers?.get("x-real-ip"));
    return forwardedIp || realIp || "unknown";
  }

  return validIp(request?.ip) || "direct";
}
