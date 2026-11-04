import fs from "node:fs";
import pg from "pg";

function numberPort(value) {
  const port = Number(value || 5432);
  return Number.isFinite(port) ? port : 5432;
}

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (inSingle && char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble && !inBacktick) {
      inSingle = !inSingle;
      continue;
    }
    if (char === "\"" && !inSingle && !inBacktick) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "`" && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
      continue;
    }
    if (char !== ";" || inSingle || inDouble || inBacktick) continue;

    const statement = sql.slice(start, index + 1).trim();
    if (statement) statements.push(statement);
    start = index + 1;
  }

  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function stripLineComments(statement) {
  return statement
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("--") && !trimmed.startsWith("/*!");
    })
    .join("\n")
    .trim();
}

function rewriteIdentifiers(sql) {
  return sql.replace(/`([^`]+)`/g, (_, identifier) => `"${identifier.replace(/"/g, "\"\"")}"`);
}

function rewriteCommonSql(sql) {
  return rewriteIdentifiers(sql)
    .replace(/\bint\(\d+\)(?:\s+unsigned)?/gi, "integer")
    .replace(/\bbigint\(\d+\)(?:\s+unsigned)?/gi, "bigint")
    .replace(/\bsmallint\(\d+\)(?:\s+unsigned)?/gi, "smallint")
    .replace(/\btinyint\(\d+\)/gi, "smallint")
    .replace(/\bmediumtext\b/gi, "text")
    .replace(/\blongtext\b/gi, "text")
    .replace(/\bdatetime\b/gi, "timestamp")
    .replace(/\bdate\b/gi, "varchar(30)")
    .replace(/\bcurrent_timestamp\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, "")
    .replace(/\s+CHARACTER\s+SET\s+\w+/gi, "")
    .replace(/\s+COLLATE\s+\w+/gi, "")
    .replace(/\s+COMMENT\s+'(?:\\'|''|[^'])*'/gi, "")
    .replace(/\benum\([^)]+\)/gi, "varchar(50)")
    .replace(/\s+ENGINE=\w+(?:\s+DEFAULT\s+CHARSET=\w+)?(?:\s+COLLATE=\w+)?/gi, "")
    .replace(/'0000-00-00(?: 00:00:00)?'/g, "NULL")
    .replace(/\\'/g, "''");
}

function convertStatement(statement) {
  const cleaned = stripLineComments(statement).replace(/;\s*$/, "").trim();
  if (!cleaned) return null;

  if (/^(SET|START\s+TRANSACTION|COMMIT|ROLLBACK|LOCK\s+TABLES|UNLOCK\s+TABLES)\b/i.test(cleaned)) return null;
  if (/^ALTER\s+TABLE\b/i.test(cleaned)) return null;
  if (/^DROP\s+TABLE\b/i.test(cleaned)) return null;

  if (/^CREATE\s+TABLE\b/i.test(cleaned)) {
    return `${rewriteCommonSql(cleaned)};`;
  }

  if (/^INSERT\s+INTO\b/i.test(cleaned)) {
    return `${rewriteCommonSql(cleaned)};`;
  }

  return null;
}

async function addPrimaryKey(client, table, column) {
  await client.query(`ALTER TABLE "${table}" ADD PRIMARY KEY ("${column}")`).catch(() => {});
}

async function addSerialDefault(client, table, column) {
  const sequence = `${table}_${column}_seq`;
  await client.query(`CREATE SEQUENCE IF NOT EXISTS "${sequence}" OWNED BY "${table}"."${column}"`);
  const { rows } = await client.query(`SELECT COALESCE(MAX("${column}"), 0) AS max_value FROM "${table}"`);
  const maxValue = Number(rows[0]?.max_value || 0);
  if (maxValue > 0) {
    await client.query(`SELECT setval($1::regclass, $2, true)`, [sequence, maxValue]);
  }
  await client.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT nextval('"${sequence}"'::regclass)`);
}

async function finishSchema(client) {
  const primaryKeys = [
    ["alamat", "id"],
    ["keluarga", "id"],
    ["pegawai", "id_pegawai"],
    ["riwayat_gaji_pokok", "id"],
    ["riwayat_hukuman_disiplin", "id"],
    ["riwayat_jabatan", "id"],
    ["riwayat_keberhasilan", "id"],
    ["riwayat_kegiatan_strategis", "id"],
    ["riwayat_narasumber", "id"],
    ["riwayat_pangkat", "id"],
    ["riwayat_pendidikan", "id"],
    ["riwayat_penghargaan", "id"],
    ["riwayat_prestasi_pendidikan", "id"],
    ["riwayat_skp", "id"],
    ["ukpd", "id_ukpd"],
    ["usulan_mutasi", "id"],
    ["usulan_pjf_stop", "id"]
  ];

  for (const [table, column] of primaryKeys) {
    await addPrimaryKey(client, table, column);
  }

  for (const [table, column] of primaryKeys.filter(([table]) => table !== "pegawai" && table !== "ukpd")) {
    await addSerialDefault(client, table, column);
  }
}

const [, , dumpPath = "sql/si_data.sql", envPath = ".env.local"] = process.argv;
loadEnvFile(envPath);

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || process.env.PGHOST || "localhost",
  port: numberPort(process.env.POSTGRES_PORT || process.env.PGPORT),
  user: process.env.POSTGRES_USER || process.env.PGUSER || "postgres",
  password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "",
  database: process.env.POSTGRES_DATABASE || process.env.PGDATABASE || "si_data",
  connectionTimeoutMillis: numberPort(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 5000)
});

const client = await pool.connect();

try {
  const raw = fs.readFileSync(dumpPath, "utf8");
  const statements = splitStatements(raw);
  let executed = 0;
  let skipped = 0;

  await client.query("SET client_min_messages TO warning");
  await client.query("SET standard_conforming_strings TO off");
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.query("BEGIN");

  for (const statement of statements) {
    const converted = convertStatement(statement);
    if (!converted) {
      skipped += 1;
      continue;
    }

    try {
      await client.query(converted);
    } catch (error) {
      console.error("Gagal menjalankan statement hasil konversi:");
      console.error(converted.slice(0, 1200));
      throw error;
    }
    executed += 1;
    if (executed % 100 === 0) {
      console.log(`Imported ${executed} statement(s), skipped ${skipped}.`);
    }
  }

  await finishSchema(client);
  await client.query("COMMIT");
  console.log(`Import selesai. Executed=${executed}, skipped=${skipped}.`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
