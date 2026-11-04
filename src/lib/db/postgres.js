import pg from "pg";

const { Pool } = pg;

function numberPort(value) {
  const port = Number(value || 5432);
  return Number.isFinite(port) ? port : 5432;
}

function numberOption(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseHostCandidate(value, defaultPort) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [host, port] = raw.split(":");
  return {
    host,
    port: port ? numberPort(port) : defaultPort
  };
}

export function getPostgresDatabaseCandidates() {
  const configuredDatabases = [
    ...splitList(process.env.POSTGRES_DATABASES),
    process.env.POSTGRES_DATABASE,
    process.env.PGDATABASE
  ];
  const fallbackDatabases = isProduction() ? [] : ["si_data", "sisdmk2"];
  const seen = new Set();

  return [...configuredDatabases, ...fallbackDatabases]
    .map((database) => String(database || "").trim())
    .filter(Boolean)
    .filter((database) => {
      if (seen.has(database)) return false;
      seen.add(database);
      return true;
    });
}

export function getPostgresCandidates() {
  const defaultPort = numberPort(process.env.POSTGRES_PORT || process.env.PGPORT);
  const configuredHosts = [
    ...splitList(process.env.POSTGRES_HOSTS),
    process.env.POSTGRES_HOST,
    process.env.PGHOST
  ];
  const fallbackHosts = isProduction() ? [] : [
    "postgres",
    "db",
    "host.docker.internal",
    "172.17.0.1",
    "127.0.0.1:5433",
    "localhost:5433",
    "127.0.0.1",
    "localhost"
  ];
  const seen = new Set();

  return [...configuredHosts, ...fallbackHosts]
    .map((host) => parseHostCandidate(host, defaultPort))
    .filter(Boolean)
    .filter((candidate) => {
      const key = `${candidate.host}:${candidate.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getInsertIdColumn(sql) {
  const match = sql.match(/^\s*insert\s+into\s+"?([a-zA-Z0-9_]+)"?/i);
  const table = match?.[1];
  if (!table) return "";
  if (table === "pegawai") return "id_pegawai";
  if (table === "ukpd") return "id_ukpd";
  return "id";
}

function appendReturning(sql) {
  if (!/^\s*insert\s+into\s+/i.test(sql) || /\breturning\b/i.test(sql)) return sql;
  const idColumn = getInsertIdColumn(sql);
  if (!idColumn) return sql;
  return `${sql.replace(/;\s*$/, "")} RETURNING "${idColumn}"`;
}

function rewriteBackticks(sql) {
  let result = "";
  let inSingle = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (char === "'" && inSingle && next === "'") {
      result += "''";
      i += 1;
      continue;
    }

    if (char === "'") {
      inSingle = !inSingle;
      result += char;
      continue;
    }

    result += !inSingle && char === "`" ? "\"" : char;
  }

  return result;
}

function rewritePlaceholders(sql) {
  let result = "";
  let index = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (char === "'" && inSingle && next === "'") {
      result += "''";
      i += 1;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      result += char;
      continue;
    }

    if (char === "\"" && !inSingle) {
      inDouble = !inDouble;
      result += char;
      continue;
    }

    if (char === "?" && !inSingle && !inDouble) {
      index += 1;
      result += `$${index}`;
      continue;
    }

    result += char;
  }

  return result;
}

function rewriteCompatSql(sql) {
  const raw = String(sql || "").trim();
  const showTables = raw.match(/^SHOW\s+TABLES\s+LIKE\s+'([^']+)'$/i);
  if (showTables) {
    return {
      sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1",
      params: [showTables[1]]
    };
  }

  const converted = rewriteBackticks(raw)
    .replace(/\bDATABASE\(\)/gi, "current_database()")
    .replace(/table_schema\s*=\s*current_database\(\)/gi, "table_schema = current_schema()")
    .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bDATETIME\b/gi, "TIMESTAMP")
    .replace(/\bTINYINT\b/gi, "SMALLINT")
    .replace(/\bINT\s+NOT\s+NULL\s+AUTO_INCREMENT\b/gi, "SERIAL")
    .replace(/\bENUM\([^)]+\)/gi, "VARCHAR(50)")
    .replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, "")
    .replace(/\s+AFTER\s+"[^"]+"/gi, "")
    .replace(/AS\s+CHAR\)/gi, "AS TEXT)")
    .replace(/CONVERT\(([^)]+)\s+USING\s+utf8mb4\)\s+COLLATE\s+utf8mb4_unicode_ci/gi, "CAST($1 AS TEXT)")
    .replace(/\sCOLLATE\s+utf8mb4_unicode_ci/gi, "")
    .replace(/,\s*UNIQUE\s+KEY\s+"([^"]+)"\s*\(([^)]+)\)/gi, ', CONSTRAINT "$1" UNIQUE ($2)')
    .replace(/,\s*KEY\s+"[^"]+"\s*\([^)]+\)/gi, "")
    .replace(/\)\s*ENGINE=InnoDB\s+DEFAULT\s+CHARSET=utf8mb4(?:\s+COLLATE=utf8mb4_unicode_ci)?/gi, ")")
    .replace(/\sLIKE\s/gi, " ILIKE ");

  const rewritten = appendReturning(
    rewritePlaceholders(
      converted
    )
  );

  return { sql: rewritten, params: null };
}

function createPostgresCompatResult(result, sql) {
  const rows = result.rows || [];
  const idColumn = getInsertIdColumn(sql);
  return {
    insertId: idColumn ? Number(rows[0]?.[idColumn] || rows[0]?.id || 0) : 0,
    affectedRows: result.rowCount || 0,
    changedRows: result.rowCount || 0,
    rowCount: result.rowCount || 0
  };
}

function normalizeRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value instanceof Date) return [key, value.toISOString().slice(0, 10)];
    return [key, value];
  })));
}

function shouldReturnRows(sql) {
  return /^\s*(select|show|with)\b/i.test(String(sql || ""));
}

function createPostgresCompatConnection(client) {
  return {
    async query(sql, params = []) {
      const rewritten = rewriteCompatSql(sql);
      const result = await client.query(rewritten.sql, rewritten.params || params);
      const normalizedRows = normalizeRows(result.rows || []);
      return [shouldReturnRows(sql) ? normalizedRows : createPostgresCompatResult(result, rewritten.sql), result];
    },
    async beginTransaction() {
      await client.query("BEGIN");
    },
    async commit() {
      await client.query("COMMIT");
    },
    async rollback() {
      await client.query("ROLLBACK");
    },
    release() {
      client.release();
    }
  };
}

function createPostgresCompatPool(pool) {
  return {
    async query(sql, params = []) {
      const rewritten = rewriteCompatSql(sql);
      const result = await pool.query(rewritten.sql, rewritten.params || params);
      const normalizedRows = normalizeRows(result.rows || []);
      return [shouldReturnRows(sql) ? normalizedRows : createPostgresCompatResult(result, rewritten.sql), result];
    },
    async getConnection() {
      const client = await pool.connect();
      return createPostgresCompatConnection(client);
    },
    async end() {
      return pool.end();
    }
  };
}

export function createPool(config = {}) {
  if (isProduction() && !process.env.POSTGRES_HOST && !process.env.PGHOST && !process.env.POSTGRES_HOSTS) {
    throw new Error("POSTGRES_HOST atau POSTGRES_HOSTS wajib diset di production.");
  }
  if (isProduction() && !process.env.POSTGRES_PASSWORD && !process.env.PGPASSWORD) {
    throw new Error("POSTGRES_PASSWORD wajib diset di production.");
  }
  const pool = new Pool({
    host: config.host || process.env.POSTGRES_HOST || process.env.PGHOST,
    port: numberPort(config.port || process.env.POSTGRES_PORT || process.env.PGPORT),
    user: config.user || process.env.POSTGRES_USER || process.env.PGUSER || "postgres",
    password: config.password !== undefined ? config.password : process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "",
    database: config.database || process.env.POSTGRES_DATABASE || process.env.PGDATABASE || "si_data",
    connectionTimeoutMillis: numberOption(process.env.POSTGRES_CONNECT_TIMEOUT_MS, 5000, { min: 500, max: 30000 }),
    idleTimeoutMillis: numberOption(process.env.POSTGRES_IDLE_TIMEOUT_MS, 30000, { min: 1000, max: 300000 }),
    max: numberOption(process.env.POSTGRES_POOL_MAX, 10, { min: 1, max: 50 }),
    statement_timeout: config.statementTimeoutMillis || undefined,
    query_timeout: config.queryTimeoutMillis || undefined,
    keepAlive: true,
    application_name: config.applicationName || process.env.POSTGRES_APPLICATION_NAME || "sisdmk2-app"
  });
  return createPostgresCompatPool(pool);
}

export function hasPostgresConfig() {
  return true;
}

export function getPool() {
  if (!globalThis.__sisdmkPostgresCompatPool) {
    globalThis.__sisdmkPostgresCompatPool = createPool();
  }
  return globalThis.__sisdmkPostgresCompatPool;
}

function getPoolMap() {
  if (!globalThis.__sisdmkPostgresCompatPools) globalThis.__sisdmkPostgresCompatPools = new Map();
  return globalThis.__sisdmkPostgresCompatPools;
}

export function isClosedConnectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return message.includes("closed")
    || message.includes("terminated")
    || message.includes("connection")
    || message.includes("timeout")
    || message.includes("getaddrinfo")
    || ["EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"].includes(code);
}

export async function resetPostgresPools() {
  const pools = getPoolMap();
  const entries = [...pools.entries()];
  pools.clear();
  globalThis.__sisdmkPostgresCompatPool = null;
  globalThis.__sisdmkPostgresCompatHost = null;
  globalThis.__sisdmkPostgresCompatVerifiedAt = 0;
  await Promise.all(entries.map(([, pool]) => pool.end().catch(() => {})));
}

export async function getConnectedPool() {
  const candidates = getPostgresCandidates();
  const databases = getPostgresDatabaseCandidates();
  const pools = getPoolMap();
  const errors = [];
  const selectedPool = globalThis.__sisdmkPostgresCompatPool;
  const selectedHost = globalThis.__sisdmkPostgresCompatHost;
  const verifyIntervalMs = numberOption(process.env.POSTGRES_POOL_VERIFY_INTERVAL_MS, 15000, { min: 0, max: 300000 });
  const lastVerifiedAt = Number(globalThis.__sisdmkPostgresCompatVerifiedAt || 0);

  if (selectedPool && selectedHost) {
    if (verifyIntervalMs > 0 && Date.now() - lastVerifiedAt < verifyIntervalMs) {
      return selectedPool;
    }

    try {
      await selectedPool.query("SELECT 1");
      globalThis.__sisdmkPostgresCompatVerifiedAt = Date.now();
      return selectedPool;
    } catch (error) {
      errors.push(`host=${selectedHost} -> ${error.message}`);
      pools.delete(selectedHost);
      globalThis.__sisdmkPostgresCompatPool = null;
      globalThis.__sisdmkPostgresCompatHost = null;
      globalThis.__sisdmkPostgresCompatVerifiedAt = 0;
      await selectedPool.end().catch(() => {});
    }
  }

  for (const candidate of candidates) {
    for (const database of databases) {
      const key = `${candidate.host}:${candidate.port}/${database}`;
      let pool = pools.get(key);
      if (!pool) {
        pool = createPool({ ...candidate, database });
        pools.set(key, pool);
      }

      try {
        await pool.query("SELECT 1");
        globalThis.__sisdmkPostgresCompatPool = pool;
        globalThis.__sisdmkPostgresCompatHost = key;
        globalThis.__sisdmkPostgresCompatVerifiedAt = Date.now();
        return pool;
      } catch (error) {
        errors.push(`host=${key} -> ${error.message}`);
        pools.delete(key);
        await pool.end().catch(() => {});
      }
    }
  }

  throw new Error(`Koneksi PostgreSQL gagal. Percobaan: ${errors.slice(-5).join(" | ") || "tidak ada host yang dicoba"}`);
}
