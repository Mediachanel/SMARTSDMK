import { fail } from "@/lib/helpers/response";
import { getClientIp } from "@/lib/security/requestIdentity";

function getStore() {
  if (!globalThis.__sisdmkApiRateLimit) {
    globalThis.__sisdmkApiRateLimit = new Map();
  }
  return globalThis.__sisdmkApiRateLimit;
}

function prune(store, now) {
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) store.delete(key);
  }
}

export function enforceRateLimit(request, { namespace = "api", limit = 60, windowMs = 60_000, key = "" } = {}) {
  const now = Date.now();
  const store = getStore();
  prune(store, now);

  const rateKey = `${namespace}|${getClientIp(request)}|${String(key || "").trim().toLowerCase()}`;
  const current = store.get(rateKey);
  if (!current || current.resetAt <= now) {
    store.set(rateKey, { count: 1, resetAt: now + windowMs });
    return null;
  }

  current.count += 1;
  if (current.count <= limit) return null;

  const retryAfter = Math.ceil((current.resetAt - now) / 1000);
  return fail(`Terlalu banyak permintaan. Coba lagi dalam ${Math.ceil(retryAfter / 60)} menit.`, 429);
}
