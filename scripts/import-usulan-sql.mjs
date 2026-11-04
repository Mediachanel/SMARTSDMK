import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const OUTPUT_DIR = path.join(ROOT_DIR, "src", "data", "generated");

const TABLES = {
  usulan_mutasi: {
    output: "usulan-mutasi.json",
    normalize: normalizeMutasi
  },
  usulan_pjf_stop: {
    output: "usulan-putus-jf.json",
    normalize: normalizePutusJf
  }
};

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
  if (!text || text === "0000-00-00") return "";
  return text.slice(0, 10);
}

function normalizeMutasi(row) {
  const namaPegawai = cleanText(row.nama_pegawai || row.nama);
  const namaUkpd = cleanText(row.nama_ukpd || row.asal);
  const ukpdTujuan = cleanText(row.ukpd_tujuan || row.tujuan);

  return {
    ...row,
    nama_pegawai: namaPegawai,
    nama: namaPegawai,
    nama_ukpd: namaUkpd,
    asal: namaUkpd,
    ukpd_tujuan: ukpdTujuan,
    tujuan: ukpdTujuan,
    nip: cleanText(row.nip),
    jabatan: cleanText(row.jabatan),
    jabatan_baru: cleanText(row.jabatan_baru),
    alasan: cleanText(row.alasan),
    keterangan: cleanText(row.keterangan),
    tanggal_usulan: normalizeDate(row.tanggal_usulan),
    status: normalizeStatus(row.status),
    jenis_mutasi: cleanText(row.jenis_mutasi)
  };
}

function normalizePutusJf(row) {
  const namaPegawai = cleanText(row.nama_pegawai || row.nama);
  const alasan = cleanText(row.alasan_pemutusan || row.alasan || row.keterangan);

  return {
    ...row,
    nama_pegawai: namaPegawai,
    nama: namaPegawai,
    nip: cleanText(row.nip),
    nama_ukpd: cleanText(row.nama_ukpd),
    jabatan: cleanText(row.jabatan),
    jabatan_baru: cleanText(row.jabatan_baru),
    alasan_pemutusan: cleanText(row.alasan_pemutusan),
    alasan,
    nomor_surat: cleanText(row.nomor_surat),
    tanggal_surat: normalizeDate(row.tanggal_surat),
    tanggal_usulan: normalizeDate(row.tanggal_usulan),
    status: normalizeStatus(row.status),
    keterangan: cleanText(row.keterangan)
  };
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

function parseTable(sql, tableName) {
  const insertPattern = new RegExp(
    `INSERT\\s+INTO\\s+\`${tableName}\`\\s*\\(([\\s\\S]*?)\\)\\s+VALUES\\s*([\\s\\S]*?);`,
    "gi"
  );
  const records = [];
  let match;

  while ((match = insertPattern.exec(sql))) {
    const columns = parseColumns(match[1]);
    const rows = parseValues(match[2]);

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

function dedupeById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()]
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Gunakan: node scripts/import-usulan-sql.mjs <path-file-sql>");
  }

  const sql = await readFile(path.resolve(inputPath), "utf8");
  const summary = {};

  for (const [tableName, config] of Object.entries(TABLES)) {
    const rows = dedupeById(parseTable(sql, tableName).map(config.normalize));
    await writeFile(path.join(OUTPUT_DIR, config.output), `${JSON.stringify(rows, null, 2)}\n`);
    summary[tableName] = rows.length;
  }

  await writeFile(
    path.join(OUTPUT_DIR, "usulan-summary.json"),
    `${JSON.stringify({ generated_at: new Date().toISOString(), source: path.resolve(inputPath), ...summary }, null, 2)}\n`
  );

  console.log(`Imported ${summary.usulan_mutasi || 0} usulan mutasi and ${summary.usulan_pjf_stop || 0} usulan putus JF.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
