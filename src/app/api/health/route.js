import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { getConnectedPool } from "@/lib/db/postgres";

export const runtime = "nodejs";

async function writableDirectory(path) {
  try {
    await mkdir(path, { recursive: true });
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const startedAt = Date.now();
  const checks = {
    postgres: { ok: false },
    storage: {
      local_storage_writable: await writableDirectory(process.env.STORAGE_LOCAL_PATH || "/app/storage"),
      next_cache_writable: await writableDirectory("/app/.next/cache")
    }
  };

  let status = 200;
  try {
    const pool = await getConnectedPool();
    await pool.query("SELECT 1");
    checks.postgres = { ok: true };
  } catch (error) {
    status = 503;
    checks.postgres = { ok: false, error: "unavailable" };
  }

  if (!checks.storage.local_storage_writable || !checks.storage.next_cache_writable) {
    status = 503;
  }

  return Response.json({
    success: status < 500,
    service: "sisdmk2-app",
    environment: process.env.NODE_ENV || "development",
    uptime_seconds: Math.round(process.uptime()),
    latency_ms: Date.now() - startedAt,
    checks
  }, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
