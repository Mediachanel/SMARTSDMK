import { getClientIp } from "@/lib/security/requestIdentity";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getStore() {
  if (!globalThis.__sisdmkLoginRateLimit) {
    globalThis.__sisdmkLoginRateLimit = new Map();
  }
  return globalThis.__sisdmkLoginRateLimit;
}

function getKey(request, username) {
  return `${getClientIp(request)}|${String(username || "").trim().toLowerCase()}`;
}

function prune(store, now) {
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) store.delete(key);
  }
}

export function checkLoginRateLimit(request, username) {
  const now = Date.now();
  const store = getStore();
  prune(store, now);

  const key = getKey(request, username);
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) return { allowed: true, retryAfter: 0 };

  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return { allowed: entry.count < MAX_ATTEMPTS, retryAfter };
}

export function recordFailedLogin(request, username) {
  const now = Date.now();
  const store = getStore();
  const key = getKey(request, username);
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count += 1;
}

export function clearLoginRateLimit(request, username) {
  getStore().delete(getKey(request, username));
}
