import { filterPegawaiByRole } from "@/lib/auth/access";
import { getPegawaiDashboardData, getUkpdData } from "@/lib/data/pegawaiStore";

const DEFAULT_SCOPED_DASHBOARD_DATA_TTL_MS = 30000;

function getScopedDashboardDataTtlMs() {
  const ttl = Number(
    process.env.DASHBOARD_DATA_CACHE_TTL_MS
    ?? process.env.DASHBOARD_CACHE_TTL_MS
    ?? DEFAULT_SCOPED_DASHBOARD_DATA_TTL_MS
  );
  if (!Number.isFinite(ttl)) return DEFAULT_SCOPED_DASHBOARD_DATA_TTL_MS;
  return Math.min(300000, Math.max(0, Math.floor(ttl)));
}

function getScopedDashboardDataCache() {
  if (!globalThis.__sisdmkScopedDashboardDataCache) {
    globalThis.__sisdmkScopedDashboardDataCache = new Map();
  }
  return globalThis.__sisdmkScopedDashboardDataCache;
}

function createScopedDashboardDataKey(user) {
  return [
    user?.role,
    user?.id,
    user?.username,
    user?.nama_ukpd,
    user?.wilayah
  ].map((value) => encodeURIComponent(String(value || ""))).join("|");
}

function getCachedScopedDashboardData(cacheKey) {
  const ttl = getScopedDashboardDataTtlMs();
  if (ttl <= 0) return null;

  const cache = getScopedDashboardDataCache();
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > ttl) {
    cache.delete(cacheKey);
    return null;
  }
  return entry.payload;
}

function setCachedScopedDashboardData(cacheKey, payload) {
  const ttl = getScopedDashboardDataTtlMs();
  if (ttl <= 0) return;

  const cache = getScopedDashboardDataCache();
  if (cache.size > 100) {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now - entry.createdAt > ttl || cache.size > 80) cache.delete(key);
    }
  }
  cache.set(cacheKey, { createdAt: Date.now(), payload });
}

export async function getScopedDashboardData(user) {
  const cacheKey = createScopedDashboardDataKey(user);
  const cachedPayload = getCachedScopedDashboardData(cacheKey);
  if (cachedPayload) return cachedPayload;

  const ukpdList = await getUkpdData();
  const pegawaiMaster = await getPegawaiDashboardData({ user, ukpdList });
  const data = filterPegawaiByRole(pegawaiMaster, user, ukpdList);
  const payload = { data, ukpdList };
  setCachedScopedDashboardData(cacheKey, payload);
  return payload;
}
