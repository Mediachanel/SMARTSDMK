import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export const PUTUS_JF_DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "putus-jf-template.docx");
const OPEN_GUILLEMET = "\u00ab";
const CLOSE_GUILLEMET = "\u00bb";
const RUN_WITH_FIELD_BEGIN_PATTERN =
  '<w:r\\b[^>]*>(?:(?!<\\/w:r>)[\\s\\S])*?<w:fldChar\\b[^>]*w:fldCharType="begin"(?:(?!<\\/w:r>)[\\s\\S])*?<\\/w:r>';
const RUN_WITH_FIELD_END_PATTERN =
  '<w:r\\b[^>]*>(?:(?!<\\/w:r>)[\\s\\S])*?<w:fldChar\\b[^>]*w:fldCharType="end"(?:(?!<\\/w:r>)[\\s\\S])*?<\\/w:r>';
const COMPLEX_MERGE_FIELD_PATTERN = new RegExp(
  `${RUN_WITH_FIELD_BEGIN_PATTERN}[\\s\\S]*?${RUN_WITH_FIELD_END_PATTERN}`,
  "gi"
);
const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const stringValue = String(value);
  const dateOnly = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatIndonesianDate(value) {
  const date = parseDate(value);
  if (!date) return text(value);
  return `${date.getDate()} ${MONTHS_ID[date.getMonth()]} ${date.getFullYear()}`;
}

function escapeXml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function placeholder(name) {
  return `${OPEN_GUILLEMET}${name}${CLOSE_GUILLEMET}`;
}

function placeholderPattern(token) {
  return new RegExp([...token].map((char) => escapeRegex(char)).join("(?:<[^>]+>)*"), "gu");
}

function replacePlaceholder(xml, token, value) {
  return xml.replace(placeholderPattern(token), () => escapeXml(value));
}

function decodeXmlText(value) {
  return text(value)
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function getMergeFieldName(instruction) {
  const match = decodeXmlText(instruction).match(/\bMERGEFIELD\s+(?:"([^"]+)"|([^\s\\]+))/i);
  return match?.[1] || match?.[2] || "";
}

function getFieldInstruction(fieldXml) {
  return [...fieldXml.matchAll(/<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/g)]
    .map((match) => match[1])
    .join("");
}

function getRunProperties(runXml) {
  return runXml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] || "";
}

function getFieldResultRunProperties(fieldXml) {
  const fieldResult = fieldXml.match(
    /<w:fldChar\b[^>]*w:fldCharType="separate"[\s\S]*?<\/w:r>([\s\S]*?)<w:r\b[^>]*>[\s\S]*?<w:fldChar\b[^>]*w:fldCharType="end"[\s\S]*?<\/w:r>/i
  )?.[1];
  const resultRun = fieldResult?.match(/<w:r\b[^>]*>[\s\S]*?<w:t\b[^>]*>[\s\S]*?<\/w:t>[\s\S]*?<\/w:r>/)?.[0];
  return getRunProperties(resultRun || fieldXml);
}

function buildTextRun(value, runProperties = "") {
  const lines = text(value).split(/\r\n|\r|\n/);
  const textNodes = lines
    .map((line, index) => {
      const preserveSpace = /^\s|\s$/.test(line) ? ' xml:space="preserve"' : "";
      const lineNode = `<w:t${preserveSpace}>${escapeXml(line)}</w:t>`;
      return index === 0 ? lineNode : `<w:br/>${lineNode}`;
    })
    .join("");

  return `<w:r>${runProperties}${textNodes}</w:r>`;
}

function replaceMergeFields(xml, replacementsByName) {
  return xml
    .replace(/<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*>[\s\S]*?<\/w:fldSimple>/gi, (fieldXml, instruction) => {
      const fieldName = getMergeFieldName(instruction);
      if (!replacementsByName.has(fieldName)) return fieldXml;
      return buildTextRun(replacementsByName.get(fieldName), getRunProperties(fieldXml));
    })
    .replace(
      COMPLEX_MERGE_FIELD_PATTERN,
      (fieldXml) => {
        const fieldName = getMergeFieldName(getFieldInstruction(fieldXml));
        if (!replacementsByName.has(fieldName)) return fieldXml;
        return buildTextRun(replacementsByName.get(fieldName), getFieldResultRunProperties(fieldXml));
      }
    );
}

function normalizeTemplateXml(xml) {
  return xml
    .replace(/<w:t[^>]*><\/w:t>/g, "")
    .replace(/\u00ab\s+/gu, OPEN_GUILLEMET)
    .replace(/\s+\u00bb/gu, CLOSE_GUILLEMET);
}

function normalizeFileNamePart(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export function buildPutusJfDocxFileName(item) {
  const surat = normalizeFileNamePart(item?.nomor_surat) || `ID_${item?.id || "usulan"}`;
  const nama = normalizeFileNamePart(item?.nama_pegawai) || "pegawai";
  return `Putus_JF_${surat}_${nama}.docx`;
}

export async function buildPutusJfDocx(item) {
  const template = await fs.readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(template);
  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error("Template DOCX tidak memiliki word/document.xml.");
  }

  const replacements = new Map([
    ["Nama_", item?.nama_pegawai],
    ["Pimpinan", item?.pimpinan],
    ["UKPD", item?.nama_ukpd],
    ["Nomor_Surat", item?.nomor_surat],
    ["Tanggal_Surat", formatIndonesianDate(item?.tanggal_surat)],
    ["Hal", item?.hal],
    ["NIP", item?.nip],
    ["Pangkatgolongan", item?.pangkat_golongan],
    ["Nama_Jabatan_fungsional", item?.jabatan],
    ["Alasan_Pemutusan", item?.alasan_pemutusan],
    ["angka_kredit", item?.angka_kredit],
    ["Tanggal_Usulan", formatIndonesianDate(item?.tanggal_usulan)],
    ["ASAL_SURAT", item?.asal_surat],
    ["Keterangan", item?.keterangan],
    ["Hari_Ini", formatIndonesianDate(new Date())]
  ]);

  let xml = normalizeTemplateXml(await documentFile.async("string"));
  xml = replaceMergeFields(xml, replacements);
  for (const [name, value] of replacements) {
    xml = replacePlaceholder(xml, placeholder(name), value);
  }

  zip.file("word/document.xml", xml);

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    fileName: buildPutusJfDocxFileName(item)
  };
}
