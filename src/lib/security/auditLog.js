import { getClientIp } from "@/lib/security/requestIdentity";
import { getConnectedPool } from "@/lib/db/postgres";
import {
  notifyAuditActivity,
  notifySuspiciousActivity,
} from "@/lib/security/securityAlert";

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "secret",
  "jwt",
  "cookie",
  "credential",
]);
const MAX_METADATA_LENGTH = 4000;

function sanitizeDetails(details) {
  return Object.fromEntries(
    Object.entries(details || {}).map(([key, value]) => {
      if (REDACTED_KEYS.has(String(key).toLowerCase()))
        return [key, "[REDACTED]"];
      if (value === undefined) return [key, null];
      return [key, typeof value === "string" ? value.slice(0, 160) : value];
    }),
  );
}

function safeJson(details) {
  const sanitized = sanitizeDetails(details);
  const text = JSON.stringify(sanitized).slice(0, MAX_METADATA_LENGTH);
  try {
    return JSON.parse(text);
  } catch {
    return sanitized;
  }
}

async function ensureAuditLogTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_id VARCHAR(120),
      actor_role VARCHAR(50),
      action VARCHAR(120) NOT NULL,
      entity_type VARCHAR(120),
      entity_id VARCHAR(120),
      ip_address VARCHAR(80),
      user_agent TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function writeAuditLog({
  request = null,
  user = null,
  action,
  entityType = null,
  entityId = null,
  metadata = {},
}) {
  if (!action) return;
  const payload = safeJson(metadata);
  try {
    const pool = await getConnectedPool();
    await ensureAuditLogTable(pool);
    await pool.query(
      `INSERT INTO audit_logs
       (actor_id, actor_role, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb))`,
      [
        user?.id ? String(user.id) : null,
        user?.role || null,
        action,
        entityType,
        entityId ? String(entityId) : null,
        request ? getClientIp(request) : null,
        request?.headers?.get("user-agent") || null,
        JSON.stringify(payload),
      ],
    );
    void notifyAuditActivity({
      request,
      user,
      action,
      entityType,
      entityId,
      metadata: payload,
    }).catch((error) => {
      console.warn("[SECURITY_AUDIT_ALERT_FAILED]", error.message);
    });
  } catch (error) {
    console.warn("[AUDIT_LOG_WRITE_FAILED]", error.message);
  }
}

export function auditSecurityEvent(request, event, details = {}) {
  const url = request?.url ? new URL(request.url) : null;
  console.info(
    "[SECURITY_AUDIT]",
    JSON.stringify({
      at: new Date().toISOString(),
      event,
      ip: request ? getClientIp(request) : "unknown",
      method: request?.method || "",
      path: url?.pathname || "",
      ...sanitizeDetails(details),
    }),
  );
  writeAuditLog({
    request,
    action: event,
    entityType: "security",
    metadata: details,
  });
  if (
    event === "login_rate_limited" ||
    event === "login_success" ||
    event === "authorization_denied" ||
    event === "sensitive_data_access"
  ) {
    void notifySuspiciousActivity(request, event, details).catch((error) => {
      console.warn("[SECURITY_ALERT_FAILED]", error.message);
    });
  }
}
