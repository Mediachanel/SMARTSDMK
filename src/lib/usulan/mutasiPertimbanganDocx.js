import JSZip from "jszip";

export const MUTASI_PERTIMBANGAN_DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const DASH = "\u2014";
const MONTHS_ID_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
const MAIN_WIDTHS = [
  500, 1100, 1050, 650, 1500, 1350, 420, 420, 420, 420, 420, 420, 1500, 1350,
  420, 420, 420, 420, 420, 420, 2700,
];

function text(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function display(value) {
  const stringValue = text(value).trim();
  return stringValue || DASH;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;

  const stringValue = String(value);
  const dateOnly = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }

  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortIndonesianDate(value) {
  if (!value) return DASH;
  const date = parseDate(value);
  if (!date) return text(value) || DASH;
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS_ID_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

function integerOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function formatNumber(value) {
  const number = integerOrNull(value);
  return number === null
    ? "0"
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(
        number,
      );
}

function difference(bezetting, abk) {
  const result = (integerOrNull(bezetting) ?? 0) - (integerOrNull(abk) ?? 0);
  return result > 0 ? `+${result}` : String(result);
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

export function buildMutasiPertimbanganDocxFileName(item) {
  const id = normalizeFileNamePart(item?.id) || "mutasi";
  const nama = normalizeFileNamePart(item?.nama_pegawai) || "pegawai";
  return `Form_Pertimbangan_Mutasi_${id}_${nama}.docx`;
}

function escapeXml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sumWidths(start, count) {
  return MAIN_WIDTHS.slice(start, start + count).reduce(
    (total, width) => total + width,
    0,
  );
}

function chunkNip(value) {
  const digits = text(value).replace(/\D/g, "");
  if (digits.length < 10) return display(value);
  return digits.match(/.{1,3}/g).join("\n");
}

function buildAnalysisText(item) {
  const lines = [];
  if (item?.keterangan) lines.push(item.keterangan);
  if (item?.alasan) lines.push(item.alasan);
  if (!lines.length && item?.created_by_ukpd)
    lines.push(`Dibuat oleh: ${item.created_by_ukpd}`);
  return lines.join("\n\n") || DASH;
}

function paragraph(content = "", options = {}) {
  const {
    align = "left",
    bold = false,
    size = 18,
    spacingAfter = 0,
    spacingBefore = 0,
  } = options;
  const lines = text(content).split(/\r\n|\r|\n/);
  const runs = lines
    .map((line, index) => {
      const br = index === 0 ? "" : "<w:br/>";
      return `${br}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
    })
    .join("");

  return `<w:p>
    <w:pPr>
      <w:jc w:val="${align}"/>
      <w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        ${bold ? "<w:b/>" : ""}
        <w:sz w:val="${size}"/>
      </w:rPr>
      ${runs}
    </w:r>
  </w:p>`;
}

function tableProperties(width, align = "center") {
  return `<w:tblPr>
    <w:tblW w:w="${width}" w:type="dxa"/>
    <w:jc w:val="${align}"/>
    <w:tblLayout w:type="fixed"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="45" w:type="dxa"/>
      <w:left w:w="45" w:type="dxa"/>
      <w:bottom w:w="45" w:type="dxa"/>
      <w:right w:w="45" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>`;
}

function tableGrid(widths) {
  return `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`;
}

function cell(content, options = {}) {
  const {
    width,
    gridSpan,
    vMerge,
    align = "left",
    valign = "center",
    bold = false,
    size = 18,
    shade,
    height,
  } = options;
  const paragraphXml =
    vMerge === "continue" && !content
      ? paragraph("", { align, size })
      : paragraph(content, { align, bold, size });
  return `<w:tc>
    <w:tcPr>
      ${width ? `<w:tcW w:w="${width}" w:type="dxa"/>` : ""}
      ${gridSpan ? `<w:gridSpan w:val="${gridSpan}"/>` : ""}
      ${vMerge ? (vMerge === "restart" ? '<w:vMerge w:val="restart"/>' : "<w:vMerge/>") : ""}
      ${shade ? `<w:shd w:fill="${shade}"/>` : ""}
      <w:vAlign w:val="${valign}"/>
      ${height ? `<w:tcMar><w:top w:w="45" w:type="dxa"/><w:left w:w="45" w:type="dxa"/><w:bottom w:w="45" w:type="dxa"/><w:right w:w="45" w:type="dxa"/></w:tcMar>` : ""}
    </w:tcPr>
    ${paragraphXml}
  </w:tc>`;
}

function row(cells, height) {
  return `<w:tr>
    ${height ? `<w:trPr><w:trHeight w:val="${height}" w:hRule="atLeast"/></w:trPr>` : ""}
    ${cells.join("")}
  </w:tr>`;
}

function parafTable() {
  const widths = [4200, 1000, 4600];
  const rows = [
    row([
      cell("Jabatan", {
        width: widths[0],
        align: "center",
        bold: true,
        size: 18,
      }),
      cell("Paraf", {
        width: widths[1],
        align: "center",
        bold: true,
        size: 18,
      }),
      cell("Catatan Jika Ada", {
        width: widths[2],
        align: "center",
        bold: true,
        size: 18,
      }),
    ]),
    ...[
      "Sekretaris Dinas",
      "Ka. Bidang Kesehatan Masyarakat",
      "Ka. Bidang Sumber Daya Manusia Kesehatan",
      "Sub Kelompok Kepegawaian",
      "Pemroses",
    ].map((jabatan) =>
      row([
        cell(jabatan, { width: widths[0], size: 17 }),
        cell("", { width: widths[1], size: 17 }),
        cell("", { width: widths[2], size: 17 }),
      ]),
    ),
  ];

  return `<w:tbl>${tableProperties(9800)}${tableGrid(widths)}${rows.join("")}</w:tbl>`;
}

function mainTable(item) {
  const header = { align: "center", bold: true, size: 16, shade: "FFFFFF" };
  const data = { align: "center", size: 16 };
  const dataLeft = { align: "left", size: 16 };

  const rows = [
    row(
      [
        cell("NO", { ...header, width: MAIN_WIDTHS[0], vMerge: "restart" }),
        cell("JENIS\nMUTASI", {
          ...header,
          width: MAIN_WIDTHS[1],
          vMerge: "restart",
        }),
        cell("NAMA", { ...header, width: MAIN_WIDTHS[2], vMerge: "restart" }),
        cell("NIP", { ...header, width: MAIN_WIDTHS[3], vMerge: "restart" }),
        cell("DATA TEMPAT TUGAS SAAT INI", {
          ...header,
          width: sumWidths(4, 8),
          gridSpan: 8,
        }),
        cell("DATA TEMPAT TUGAS USULAN", {
          ...header,
          width: sumWidths(12, 8),
          gridSpan: 8,
        }),
        cell("DATA KEPEGAWAIAN\nLAIN/ ANALISA", {
          ...header,
          width: MAIN_WIDTHS[20],
          vMerge: "restart",
        }),
      ],
      360,
    ),
    row(
      [
        cell("", { width: MAIN_WIDTHS[0], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[1], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[2], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[3], vMerge: "continue" }),
        cell("TEMPAT\nTUGAS", {
          ...header,
          width: MAIN_WIDTHS[4],
          vMerge: "restart",
        }),
        cell("JABATAN", {
          ...header,
          width: MAIN_WIDTHS[5],
          vMerge: "restart",
        }),
        cell("PNS", { ...header, width: sumWidths(6, 3), gridSpan: 3 }),
        cell("NON PNS", { ...header, width: sumWidths(9, 3), gridSpan: 3 }),
        cell("USULAN\nTEMPAT\nTUGAS", {
          ...header,
          width: MAIN_WIDTHS[12],
          vMerge: "restart",
        }),
        cell("JABATAN", {
          ...header,
          width: MAIN_WIDTHS[13],
          vMerge: "restart",
        }),
        cell("PNS", { ...header, width: sumWidths(14, 3), gridSpan: 3 }),
        cell("NON PNS", { ...header, width: sumWidths(17, 3), gridSpan: 3 }),
        cell("", { width: MAIN_WIDTHS[20], vMerge: "continue" }),
      ],
      360,
    ),
    row(
      [
        cell("", { width: MAIN_WIDTHS[0], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[1], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[2], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[3], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[4], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[5], vMerge: "continue" }),
        ...["B", "K", "S", "B", "K", "S"].map((label, index) =>
          cell(label, { ...header, width: MAIN_WIDTHS[6 + index] }),
        ),
        cell("", { width: MAIN_WIDTHS[12], vMerge: "continue" }),
        cell("", { width: MAIN_WIDTHS[13], vMerge: "continue" }),
        ...["B", "K", "S", "B", "K", "S"].map((label, index) =>
          cell(label, { ...header, width: MAIN_WIDTHS[14 + index] }),
        ),
        cell("", { width: MAIN_WIDTHS[20], vMerge: "continue" }),
      ],
      300,
    ),
    row(
      [
        cell("1", { ...data, width: MAIN_WIDTHS[0] }),
        cell(display(item?.jenis_mutasi), { ...data, width: MAIN_WIDTHS[1] }),
        cell(display(item?.nama_pegawai), { ...data, width: MAIN_WIDTHS[2] }),
        cell(chunkNip(item?.nip), { ...data, width: MAIN_WIDTHS[3] }),
        cell(display(item?.nama_ukpd), { ...data, width: MAIN_WIDTHS[4] }),
        cell(display(item?.jabatan), { ...data, width: MAIN_WIDTHS[5] }),
        cell(formatNumber(item?.bezetting_j_lama), {
          ...data,
          width: MAIN_WIDTHS[6],
        }),
        cell(formatNumber(item?.abk_j_lama), {
          ...data,
          width: MAIN_WIDTHS[7],
        }),
        cell(difference(item?.bezetting_j_lama, item?.abk_j_lama), {
          ...data,
          width: MAIN_WIDTHS[8],
        }),
        cell(formatNumber(item?.nonasn_bezetting_lama), {
          ...data,
          width: MAIN_WIDTHS[9],
        }),
        cell(formatNumber(item?.nonasn_abk_lama), {
          ...data,
          width: MAIN_WIDTHS[10],
        }),
        cell(difference(item?.nonasn_bezetting_lama, item?.nonasn_abk_lama), {
          ...data,
          width: MAIN_WIDTHS[11],
        }),
        cell(display(item?.ukpd_tujuan), { ...data, width: MAIN_WIDTHS[12] }),
        cell(display(item?.jabatan_baru), { ...data, width: MAIN_WIDTHS[13] }),
        cell(formatNumber(item?.bezetting_j_baru), {
          ...data,
          width: MAIN_WIDTHS[14],
        }),
        cell(formatNumber(item?.abk_j_baru), {
          ...data,
          width: MAIN_WIDTHS[15],
        }),
        cell(difference(item?.bezetting_j_baru, item?.abk_j_baru), {
          ...data,
          width: MAIN_WIDTHS[16],
        }),
        cell(formatNumber(item?.nonasn_bezetting_baru), {
          ...data,
          width: MAIN_WIDTHS[17],
        }),
        cell(formatNumber(item?.nonasn_abk_baru), {
          ...data,
          width: MAIN_WIDTHS[18],
        }),
        cell(difference(item?.nonasn_bezetting_baru, item?.nonasn_abk_baru), {
          ...data,
          width: MAIN_WIDTHS[19],
        }),
        cell(buildAnalysisText(item), {
          ...dataLeft,
          width: MAIN_WIDTHS[20],
          valign: "top",
        }),
      ],
      4100,
    ),
  ];

  return `<w:tbl>${tableProperties(sumWidths(0, MAIN_WIDTHS.length))}${tableGrid(MAIN_WIDTHS)}${rows.join("")}</w:tbl>`;
}

function buildDocumentXml(item) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraph("FORM PERTIMBANGAN PENEMPATAN PEGAWAI DI LINGKUNGAN DINAS KESEHATAN PROVINSI DKI JAKARTA", { align: "center", bold: true, size: 20, spacingBefore: 340, spacingAfter: 260 })}
    ${parafTable()}
    ${paragraph("", { spacingAfter: 180 })}
    ${mainTable(item)}
    <w:sectPr>
      <w:pgSz w:w="18720" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="360" w:bottom="720" w:left="360" w:header="360" w:footer="360" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildDocumentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="18"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;
}

function buildCorePropsXml() {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta</dc:creator>
  <cp:lastModifiedBy>SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppPropsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta</Application>
</Properties>`;
}

export async function buildMutasiPertimbanganDocx(item) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", buildContentTypesXml());
  zip.file("_rels/.rels", buildRootRelsXml());
  zip.file("docProps/core.xml", buildCorePropsXml());
  zip.file("docProps/app.xml", buildAppPropsXml());
  zip.file("word/document.xml", buildDocumentXml(item));
  zip.file("word/_rels/document.xml.rels", buildDocumentRelsXml());
  zip.file("word/styles.xml", buildStylesXml());

  return {
    buffer: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    }),
    fileName: buildMutasiPertimbanganDocxFileName(item),
  };
}
