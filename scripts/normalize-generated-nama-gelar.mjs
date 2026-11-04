import fs from "node:fs";
import path from "node:path";

const targetPath = path.resolve("src/data/generated/pegawai.json");

const PREFIX_MAP = new Map([
  ["dr", "dr."],
  ["drg", "drg."],
  ["prof", "Prof."],
  ["ir", "Ir."],
  ["ns", "Ns."],
  ["h", "H."],
  ["hj", "Hj."]
]);

const SUFFIX_PLAIN_SET = new Set([
  "apt",
  "ners",
  "skm",
  "s.km",
  "se",
  "s.e",
  "ssi",
  "s.si",
  "skep",
  "s.kep",
  "amdkeb",
  "a.md.keb",
  "amd",
  "a.md",
  "mkes",
  "m.kes",
  "mars",
  "m.a.r.s",
  "mph",
  "m.ph",
  "mm",
  "m.m",
  "phd",
  "mpsi",
  "m.psi"
]);

function normalizeSpace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSuffixKey(value) {
  return normalizeSpace(value).toLowerCase().replace(/\s+/g, "").replace(/,/g, "");
}

function titleCaseName(value) {
  return normalizeSpace(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (!word) return word;
      return word
        .split("-")
        .map((part) => {
          if (!part) return part;
          const first = part[0].toUpperCase();
          const rest = part.slice(1).toLowerCase();
          return `${first}${rest}`;
        })
        .join("-");
    })
    .join(" ");
}

function splitCommaParts(rawName) {
  return normalizeSpace(rawName)
    .split(",")
    .map((part) => normalizeSpace(part))
    .filter(Boolean);
}

function takePrefixTokens(namePart) {
  const tokens = normalizeSpace(namePart).split(" ").filter(Boolean);
  const prefix = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    const key = token.toLowerCase().replace(/[^a-z]/g, "");
    if (!PREFIX_MAP.has(key)) break;
    prefix.push(PREFIX_MAP.get(key));
    index += 1;
  }

  const remaining = tokens.slice(index).join(" ");
  return { prefix, remaining };
}

function isDegreeToken(token) {
  const cleaned = normalizeSpace(token).replace(/,$/, "");
  if (!cleaned) return false;
  const key = normalizeSuffixKey(cleaned);
  if (SUFFIX_PLAIN_SET.has(key)) return true;
  if (/^(sp|subsp)\.[a-z]{1,6}\.?$/i.test(cleaned)) return true;
  if (/^(?:[A-Za-z]{1,6}\.){1,5}[A-Za-z]{0,6}$/i.test(cleaned)) return true;
  return false;
}

function takeSuffixTokens(namePart) {
  const tokens = normalizeSpace(namePart).split(" ").filter(Boolean);
  const suffix = [];

  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (!isDegreeToken(last)) break;
    suffix.unshift(last.replace(/,$/, ""));
    tokens.pop();
  }

  return { suffix, remaining: tokens.join(" ") };
}

function mergeUniqueParts(...groups) {
  const seen = new Set();
  const result = [];

  for (const group of groups) {
    for (const item of group) {
      const normalized = normalizeSpace(item);
      if (!normalized) continue;
      const key = normalizeSuffixKey(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}

function normalizeRecord(record) {
  const commaParts = splitCommaParts(record.nama);
  const mainPart = commaParts[0] || "";
  const commaSuffix = commaParts.slice(1);

  const { prefix, remaining: afterPrefix } = takePrefixTokens(mainPart);
  const { suffix: endSuffix, remaining: rawName } = takeSuffixTokens(afterPrefix);

  const mergedPrefix = mergeUniqueParts(prefix, [record.gelar_depan]);
  const mergedSuffix = mergeUniqueParts([record.gelar_belakang], commaSuffix, endSuffix);

  const normalizedPrefix = [];
  const movedToSuffix = [];
  for (const item of mergedPrefix) {
    const key = item.toLowerCase().replace(/[^a-z]/g, "");
    if (key === "apt") {
      movedToSuffix.push("Apt.");
      continue;
    }
    normalizedPrefix.push(PREFIX_MAP.get(key) || item);
  }
  const normalizedSuffix = mergeUniqueParts(mergedSuffix, movedToSuffix);

  return {
    ...record,
    nama: titleCaseName(rawName),
    gelar_depan: normalizedPrefix.join(", "),
    gelar_belakang: normalizedSuffix.join(", ")
  };
}

const pegawai = JSON.parse(fs.readFileSync(targetPath, "utf8"));
const normalized = pegawai.map(normalizeRecord);
fs.writeFileSync(targetPath, JSON.stringify(normalized), "utf8");

const changedName = normalized.filter((item, index) => item.nama !== pegawai[index].nama).length;
const changedDepan = normalized.filter((item, index) => item.gelar_depan !== pegawai[index].gelar_depan).length;
const changedBelakang = normalized.filter((item, index) => item.gelar_belakang !== pegawai[index].gelar_belakang).length;

console.log(`Normalized: nama=${changedName}, gelar_depan=${changedDepan}, gelar_belakang=${changedBelakang}`);
