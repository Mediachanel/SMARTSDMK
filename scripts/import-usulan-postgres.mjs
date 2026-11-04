import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const ROOT_DIR = process.cwd();

const TABLE_FILES = {
  usulan_mutasi: path.join(ROOT_DIR, "sql", "usulan_mutasi.sql"),
  usulan_pjf_stop: path.join(ROOT_DIR, "sql", "usulan_pjf_stop.sql")
};

const EXTRA_COLUMNS = {
  usulan_mutasi: [
    ["nrk", "VARCHAR(32) NULL"],
    ["updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["verif_checklist", "TEXT NULL"],
    ["dokumen_checklist", "TEXT NULL"],
    ["mutasi_id", "INTEGER NULL"]
  ],
  usulan_pjf_stop: [
    ["nrk", "VARCHAR(32) NULL"],
    ["updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["verif_checklist", "TEXT NULL"],
    ["dokumen_checklist", "TEXT NULL"]
  ]
};

function loadEnvFile(filePath = ".env") {
  if (!fs.existsSync(filePath)) return;
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

function numberPort(value) {
  const port = Number(value || 5432);
  return Number.isFinite(port) ? port : 5432;
}

function cleanText(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function normalizeStatus(value) {
  const status = cleanText(value);
  if (!status) return "Diusulkan";
  const lower = status.toLowerCase();
  if (lower === "selesai") return "Selesai";
  if (lower === "ditolak") return "Ditolak";
  if (lower === "diproses") return "Diproses";
  if (lower === "diusulkan" || lower === "diajukan") return "Diusulkan";
  return status;
}

function normalizeDate(value) {
  const text = cleanText(value);
  if (!text || text === "0000-00-00" || text === "0000-00-00 00:00:00") return null;
  return text;
}

function parseColumns(rawColumns) {
  return [...rawColumns.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function readQuotedValue(input, start) {
  let index = start + 1;
  let value = "";

  while (index < input.length) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\\") {
      if (next === "r") value += "\r";
      else if (next === "n") value += "\n";
      else if (next === "t") value += "\t";
      else if (next != null) value += next;
      index += 2;
      continue;
    }

    if (char === "'") {
      if (next === "'") {
        value += "'";
        index += 2;
        continue;
      }
      return { value, nextIndex: index + 1 };
    }

    value += char;
    index += 1;
  }

  return { value, nextIndex: index };
}

function coerceValue(raw) {
  const text = raw.trim();
  if (!text || /^NULL$/i.test(text)) return null;
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return Number.parseFloat(text);
  return text;
}

function parseValues(valuesSql) {
  const rows = [];
  let index = 0;

  while (index < valuesSql.length) {
    while (index < valuesSql.length && /[\s,]/.test(valuesSql[index])) index += 1;
    if (valuesSql[index] !== "(") {
      index += 1;
      continue;
    }

    index += 1;
    const row = [];
    let token = "";

    while (index < valuesSql.length) {
      const char = valuesSql[index];

      if (char === "'") {
        const parsed = readQuotedValue(valuesSql, index);
        row.push(parsed.value);
        token = "";
        index = parsed.nextIndex;
        continue;
      }

      if (char === ",") {
        if (token.trim()) row.push(coerceValue(token));
        token = "";
        index += 1;
        continue;
      }

      if (char === ")") {
        if (token.trim()) row.push(coerceValue(token));
        rows.push(row);
        index += 1;
        break;
      }

      token += char;
      index += 1;
    }
  }

  return rows;
}

function findStatementEnd(sql, start) {
  let inSingle = false;

  for (let index = start; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (inSingle && char === "\\") {
      index += 1;
      continue;
    }

    if (char === "'") {
      if (inSingle && next === "'") {
        index += 1;
        continue;
      }
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && char === ";") return index;
  }

  return sql.length;
}

function parseTable(sql, tableName) {
  const insertPattern = new RegExp(`INSERT\\s+INTO\\s+\`${tableName}\`\\s*\\(([\\s\\S]*?)\\)\\s+VALUES\\s*`, "gi");
  const records = [];
  let match;

  while ((match = insertPattern.exec(sql))) {
    const columns = parseColumns(match[1]);
    const valuesStart = match.index + match[0].length;
    const valuesEnd = findStatementEnd(sql, valuesStart);
    const rows = parseValues(sql.slice(valuesStart, valuesEnd));
    insertPattern.lastIndex = valuesEnd + 1;

    for (const values of rows) {
      const record = {};
      columns.forEach((column, columnIndex) => {
        record[column] = values[columnIndex] ?? null;
      });
      records.push(record);
    }
  }

  return records;
}

function normalizeRecord(tableName, record) {
  const normalized = { ...record };
  normalized.status = normalizeStatus(record.status);
  normalized.tanggal_usulan = normalizeDate(record.tanggal_usulan);
  normalized.created_at = normalizeDate(record.created_at);
  normalized.updated_at = normalizeDate(record.updated_at);

  if (tableName === "usulan_pjf_stop") {
    normalized.tanggal_surat = normalizeDate(record.tanggal_surat);
    if (normalized.alasan_pemutusan == null) {
      normalized.alasan_pemutusan = cleanText(record.keterangan);
    }
  }

  if (tableName === "usulan_mutasi" && normalized.alasan == null) {
    normalized.alasan = "";
  }

  return normalized;
}

function dedupeById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()]
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
}

function sqlIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function ensureSchema(pool, tableName) {
  for (const [column, definition] of EXTRA_COLUMNS[tableName] || []) {
    await pool.query(`ALTER TABLE ${sqlIdentifier(tableName)} ADD COLUMN IF NOT EXISTS ${sqlIdentifier(column)} ${definition}`);
  }

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = ${sqlLiteral(tableName)}::regclass
          AND contype = 'p'
      ) THEN
        EXECUTE 'ALTER TABLE ${sqlIdentifier(tableName)} ADD PRIMARY KEY ("id")';
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ${sqlLiteral(tableName)}
          AND column_name = 'id'
          AND identity_generation IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ${sqlLiteral(tableName)}
          AND column_name = 'id'
          AND column_default IS NOT NULL
      ) THEN
        EXECUTE 'ALTER TABLE ${sqlIdentifier(tableName)} ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY';
      END IF;
    END $$;
  `);
}

async function loadTableColumns(pool, tableName) {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function importTable(pool, tableName, filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`${tableName}: skipped, file not found ${filePath}`);
    return { tableName, rows: 0 };
  }

  await ensureSchema(pool, tableName);
  const tableColumns = await loadTableColumns(pool, tableName);
  const sql = fs.readFileSync(filePath, "utf8");
  const rows = dedupeById(parseTable(sql, tableName).map((record) => normalizeRecord(tableName, record)));

  if (!rows.length) {
    console.log(`${tableName}: no rows found in ${filePath}`);
    return { tableName, rows: 0 };
  }

  await pool.query("BEGIN");
  try {
    for (const row of rows) {
      const columns = Object.keys(row).filter((column) => tableColumns.has(column));
      const placeholders = columns.map((_, index) => `$${index + 1}`);
      const assignments = columns
        .filter((column) => column !== "id")
        .map((column) => `${sqlIdentifier(column)} = EXCLUDED.${sqlIdentifier(column)}`);

      await pool.query(
        `INSERT INTO ${sqlIdentifier(tableName)} (${columns.map(sqlIdentifier).join(", ")})
         VALUES (${placeholders.join(", ")})
         ON CONFLICT ("id") DO UPDATE SET ${assignments.join(", ")}`,
        columns.map((column) => row[column])
      );
    }

    const sequence = await pool.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence_name", [tableName]);
    const sequenceName = sequence.rows[0]?.sequence_name;
    if (sequenceName) {
      await pool.query(
        `SELECT setval($1::regclass, GREATEST((SELECT COALESCE(MAX("id"), 0) FROM ${sqlIdentifier(tableName)}), 1), true)`,
        [sequenceName]
      );
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  console.log(`${tableName}: imported ${rows.length} rows from ${path.relative(ROOT_DIR, filePath)}`);
  return { tableName, rows: rows.length };
}

async function main() {
  loadEnvFile(process.argv[2] || ".env");

  const pool = new pg.Pool({
    host: process.env.POSTGRES_HOST || process.env.PGHOST || "localhost",
    port: numberPort(process.env.POSTGRES_PORT || process.env.PGPORT),
    user: process.env.POSTGRES_USER || process.env.PGUSER || "postgres",
    password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "",
    database: process.env.POSTGRES_DATABASE || process.env.PGDATABASE || "si_data",
    connectionTimeoutMillis: numberPort(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 1500)
  });

  try {
    for (const [tableName, filePath] of Object.entries(TABLE_FILES)) {
      await importTable(pool, tableName, filePath);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
