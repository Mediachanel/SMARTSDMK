import JSZip from "jszip";
import { WILAYAH } from "@/lib/constants/roles";
import { JENIS_PEGAWAI_OPTIONS, normalizeJenisPegawai } from "@/lib/helpers/pegawaiStatus";
import { JABATAN_STANDAR_OPTIONS, normalizeJabatanStandarOption } from "@/lib/jabatanStandar";
import {
  AGAMA_OPTIONS,
  JENIS_KONTRAK_OPTIONS,
  PANGKAT_GOLONGAN_OPTIONS,
  normalizeAgamaOption,
  normalizeJenisKontrakOption,
  normalizePangkatGolonganOption
} from "@/lib/pegawaiReferenceOptions";

const PEGAWAI_IMPORT_COLUMN_RULES = {
  id_pegawai: "Opsional. Isi hanya jika ingin update data berdasarkan ID pegawai pada format import lama.",
  nama: "Wajib. Minimal 3 karakter.",
  nama_ukpd: "Wajib. Harus sama dengan nama UKPD yang ada di sistem. Admin UKPD hanya boleh memakai UKPD sendiri.",
  jenis_pegawai: `Wajib. Pilihan: ${JENIS_PEGAWAI_OPTIONS.join(", ")}.`,
  jenis_kelamin: "Contoh: L, P, Laki-laki, atau Perempuan.",
  tanggal_lahir: "Format tanggal: YYYY-MM-DD. Contoh: 1990-12-31.",
  agama: `Pilihan: ${AGAMA_OPTIONS.join(", ")}.`,
  jenis_kontrak: `Pilihan: ${JENIS_KONTRAK_OPTIONS.join(", ")}.`,
  nrk: "Dipakai sebagai kunci update bila ID pegawai dan NIP kosong.",
  nip: "Dipakai sebagai kunci update bila ID pegawai kosong.",
  nama_jabatan_menpan: "Gunakan daftar jabatan_standar pada sheet Referensi.",
  pangkat_golongan: "Gunakan daftar pada sheet Referensi.",
  tmt_pangkat_terakhir: "Format tanggal: YYYY-MM-DD.",
  tmt_kerja_ukpd: "Format tanggal: YYYY-MM-DD.",
  tanggal_kondisi: "Wajib untuk kondisi Tidak Aktif, Resign, atau Pensiun. Format: YYYY-MM-DD.",
  jenjang_pendidikan: "Contoh: SMA, D3, S1, S2, S3, PROFESI.",
  email: "Opsional, tetapi jika diisi harus format email valid.",
  pasangan_email: "Opsional, tetapi jika diisi harus format email valid.",
  domisili_jalan: "Disimpan ke alamat domisili kolom jalan.",
  domisili_kelurahan: "Disimpan ke alamat domisili kolom kelurahan.",
  domisili_kecamatan: "Disimpan ke alamat domisili kolom kecamatan.",
  domisili_kota_kabupaten: "Disimpan ke alamat domisili kolom kota/kabupaten.",
  domisili_provinsi: "Disimpan ke alamat domisili kolom provinsi.",
  ktp_jalan: "Disimpan ke alamat KTP kolom jalan.",
  ktp_kelurahan: "Disimpan ke alamat KTP kolom kelurahan.",
  ktp_kecamatan: "Disimpan ke alamat KTP kolom kecamatan.",
  ktp_kota_kabupaten: "Disimpan ke alamat KTP kolom kota/kabupaten.",
  ktp_provinsi: "Disimpan ke alamat KTP kolom provinsi."
};

const REQUIRED_IMPORT_KEYS = new Set(["nama", "nama_ukpd", "jenis_pegawai"]);

export const PEGAWAI_EXPORT_COLUMNS = [
  { header: "No", value: (_row, index) => index + 1 },
  { header: "NAMA UKPD", key: "nama_ukpd" },
  { header: "JENIS UKPD", key: "jenis_ukpd" },
  { header: "WILAYAH", key: "wilayah" },
  { header: "NAMA\n(TANPA GELAR)", key: "nama" },
  { header: "KONDISI", key: "kondisi" },
  { header: "TANGGAL EFEKTIF KONDISI", key: "tanggal_kondisi" },
  { header: "NAMA JABATAN ORB (PERGUB 1 TAHUN 2017)", key: "nama_jabatan_orb" },
  { header: "NAMA JABATAN PERMENPAN RB NO 41 TAHUN 2018", value: (row) => row.nama_jabatan_menpan_raw || row.nama_jabatan_menpan || "" },
  { header: "STRUKTUR NAMA JABATAN PERMENPAN RB NO 11 TAHUN 2024", key: "nama_jabatan_menpan" },
  { header: "STRUKTUR ATASAN LANGSUNG", key: "struktur_atasan_langsung" },
  { header: "JENIS PEGAWAI", key: "jenis_pegawai" },
  { header: "Kode Jenis Pegawai", key: "kode_jenis_pegawai" },
  { header: "STATUS RUMPUN", key: "status_rumpun" },
  { header: "JENIS KONTRAK", key: "jenis_kontrak" },
  { header: "NRK", key: "nrk" },
  { header: "NIP", key: "nip" },
  { header: "PANGKAT / GOLONGAN", key: "pangkat_golongan" },
  { header: "TMT PANGKAT TERAKHIR", key: "tmt_pangkat_terakhir" },
  { header: "JENIS KELAMIN\n(L/P)", value: (row) => genderCode(row.jenis_kelamin || row.jenis_kelamin_raw) },
  { header: "TMT KERJA DI UKPD  SAAT INI", key: "tmt_kerja_ukpd" },
  { header: "TEMPAT LAHIR", key: "tempat_lahir" },
  { header: "TANGGAL LAHIR", key: "tanggal_lahir" },
  { header: "NIK", key: "nik" },
  { header: "AGAMA", key: "agama" },
  { header: "JENJANG PENDIDIKAN (BERDASARKAN SK PANGKAT TERAKHIR)", value: (row) => row.jenjang_pendidikan_raw || row.jenjang_pendidikan || "" },
  { header: "PROGRAM STUDI", key: "program_studi" },
  { header: "NAMA UNIVERSITAS", key: "nama_universitas" },
  { header: "TAHUN LULUS", value: (row) => row.riwayat_pendidikan_tahun_lulus || "" },
  { header: "NOMOR IJAZAH", value: (row) => row.riwayat_pendidikan_nomor_ijazah || "" },
  { header: "TANGGAL IJAZAH", value: (row) => row.riwayat_pendidikan_tanggal_ijazah || "" },
  { header: "NO. HP PEGAWAI", key: "no_hp_pegawai" },
  { header: "EMAIL AKTIF PEGAWAI", key: "email" },
  { header: "DOMISILI_JALAN", key: "domisili_jalan" },
  { header: "DOMISILI_KELURAHAN", key: "domisili_kelurahan" },
  { header: "DOMISILI_KECAMATAN", key: "domisili_kecamatan" },
  { header: "DOMISILI_KOTA/KABUPATEN", key: "domisili_kota_kabupaten" },
  { header: "DOMISILI_PROVINSI", key: "domisili_provinsi" },
  { header: "KTP_JALAN", key: "ktp_jalan" },
  { header: "KTP_KELURAHAN", key: "ktp_kelurahan" },
  { header: "KTP_KECAMATAN", key: "ktp_kecamatan" },
  { header: "KTP_KOTA/KABUPATEN", key: "ktp_kota_kabupaten" },
  { header: "KTP_PROVINSI", key: "ktp_provinsi" },
  { header: "NO_TELP_SUAMI/ISTRI", key: "pasangan_no_tlp" },
  { header: "EMAIL_SUAMI/ISTRI", key: "pasangan_email" },
  { header: "NAMA_SUAMI/ISTRI", key: "pasangan_nama" },
  { header: "PEKERJAAN", key: "pasangan_pekerjaan" },
  { header: "DAPAT TUNJANGAN SUAMI/ISTRI", key: "pasangan_status_tunjangan" },
  { header: "NAMA ANAK KE-1", key: "anak_1_nama" },
  { header: "JENIS KELAMIN ANAK KE-1", key: "anak_1_jenis_kelamin" },
  { header: "TEMPAT LAHIR ANAK KE-1", key: "anak_1_tempat_lahir" },
  { header: "TANGGAL LAHIR ANAK KE-1", key: "anak_1_tanggal_lahir" },
  { header: "PEKERJAAN ANAK KE-1", key: "anak_1_pekerjaan" },
  { header: "DAPAT TUNJANGAN ANAK KE-1", key: "anak_1_status_tunjangan" },
  { header: "NAMA ANAK KE-2", key: "anak_2_nama" },
  { header: "JENIS KELAMIN ANAK KE-2", key: "anak_2_jenis_kelamin" },
  { header: "TEMPAT LAHIR", key: "anak_2_tempat_lahir" },
  { header: "TANGGAL LAHIR ANAK KE-2", key: "anak_2_tanggal_lahir" },
  { header: "PEKERJAAN ANAK KE-2", key: "anak_2_pekerjaan" },
  { header: "DAPAT TUNJANGAN ANAK KE-2", key: "anak_2_status_tunjangan" },
  { header: "NAMA ANAK KE-3", key: "anak_3_nama" },
  { header: "JENIS KELAMIN ANAK KE-3", key: "anak_3_jenis_kelamin" },
  { header: "TEMPAT LAHIR ANAK KE-3", key: "anak_3_tempat_lahir" },
  { header: "TANGGAL LAHIR ANAK KE-3", key: "anak_3_tanggal_lahir" },
  { header: "PEKERJAAN ANAK KE-3", key: "anak_3_pekerjaan" },
  { header: "DAPAT TUNJANGAN ANAK KE-3", key: "anak_3_status_tunjangan" },
  { header: "No BPJS", key: "no_bpjs" },
  { header: "Gelar Depan", key: "gelar_depan" },
  { header: "Gelar Belakang", key: "gelar_belakang" },
  { header: "Status Perkawinan", key: "status_perkawinan" },
  { header: "Kode KTP Provinsi", key: "ktp_kode_provinsi" },
  { header: "Kode KTP Kota/Kab", key: "ktp_kode_kota_kab" },
  { header: "Kode KTP Kecamatan", key: "ktp_kode_kecamatan" },
  { header: "Kode KTP Kelurahan", key: "ktp_kode_kelurahan" },
  { header: "Kode Domisili Provinsi", key: "domisili_kode_provinsi" },
  { header: "Kode  Domisili Kota/Kab", key: "domisili_kode_kota_kab" },
  { header: "Kode  Domisili  Kecamatan", key: "domisili_kode_kecamatan" },
  { header: "Kode  Domisili  Kelurahan", key: "domisili_kode_kelurahan" },
  { header: "", value: () => "" },
  { header: "BT", key: "bt" }
];

const EXPORT_IMPORT_KEY_OVERRIDES = new Map([
  ["NAMA JABATAN PERMENPAN RB NO 41 TAHUN 2018", "nama_jabatan_menpan_raw"],
  ["JENIS KELAMIN\n(L/P)", "jenis_kelamin"],
  ["JENJANG PENDIDIKAN (BERDASARKAN SK PANGKAT TERAKHIR)", "jenjang_pendidikan"]
]);

const IGNORED_EXPORT_IMPORT_KEYS = new Set(["kode_jenis_pegawai", "bt"]);

function importKeyForExportColumn(column) {
  if (!column?.header || column.header === "No") return "";
  const override = EXPORT_IMPORT_KEY_OVERRIDES.get(column.header);
  const key = override || column.key || "";
  return IGNORED_EXPORT_IMPORT_KEYS.has(key) ? "" : key;
}

const PEGAWAI_IMPORT_TEMPLATE_KEYS = PEGAWAI_EXPORT_COLUMNS.map(importKeyForExportColumn);

const LEGACY_IMPORT_COLUMNS = [
  { key: "id_pegawai", label: "ID Pegawai", rule: PEGAWAI_IMPORT_COLUMN_RULES.id_pegawai }
];

function uniqueImportColumns(columns) {
  const seen = new Set();
  return columns.filter((column) => {
    if (!column?.key || seen.has(column.key)) return false;
    seen.add(column.key);
    return true;
  });
}

export const PEGAWAI_IMPORT_COLUMNS = uniqueImportColumns([
  ...LEGACY_IMPORT_COLUMNS,
  ...PEGAWAI_EXPORT_COLUMNS.map((column) => {
    const key = importKeyForExportColumn(column);
    if (!key) return null;
    return {
      key,
      label: column.header,
      required: REQUIRED_IMPORT_KEYS.has(key),
      rule: PEGAWAI_IMPORT_COLUMN_RULES[key] || column.header
    };
  }).filter(Boolean)
]);

export const PEGAWAI_IMPORT_RULES = [
  "Gunakan sheet Pegawai untuk import. Sheet Contoh, Aturan, dan Referensi tidak akan diimport.",
  "Baris pertama mengikuti struktur export Excel pegawai. File hasil export dapat diimport ulang setelah diperbarui.",
  "Kolom wajib: NAMA (TANPA GELAR), NAMA UKPD, dan JENIS PEGAWAI.",
  "Kolom dengan referensi sudah memiliki dropdown validasi di sheet Pegawai. Sumber nilainya tetap ada di sheet Referensi.",
  "Jika id_pegawai terisi dan datanya ada, sistem akan update pegawai tersebut.",
  "Jika id_pegawai kosong, sistem mencari pegawai lama dari NIP, lalu NRK, lalu NIK. Jika tidak ditemukan, sistem membuat pegawai baru.",
  "Kolom kosong pada data update tidak akan menghapus nilai lama. Isi kolom hanya untuk nilai yang ingin dibuat atau diperbarui.",
  "nama_ukpd harus sama dengan referensi UKPD aktif di sistem. Wilayah dan jenis UKPD akan diambil otomatis dari referensi UKPD.",
  "Admin UKPD hanya boleh import pegawai untuk UKPD sendiri. Jika NAMA UKPD kosong, sistem mengisi UKPD dari akun yang sedang login.",
  "Tanggal harus memakai format YYYY-MM-DD, misalnya 2024-01-31.",
  "Jenis pegawai, agama, jenis kontrak, pangkat/golongan, dan jabatan standar harus mengikuti sheet Referensi.",
  "Kolom DOMISILI dan KTP disimpan terpisah ke tabel alamat: jalan, kelurahan, kecamatan, kota/kabupaten, provinsi, dan kode wilayah.",
  "Kolom SUAMI/ISTRI dan ANAK disimpan ke tabel keluarga."
];

const DATE_FIELDS = [
  "tanggal_lahir",
  "tmt_pangkat_terakhir",
  "tmt_kerja_ukpd",
  "anak_1_tanggal_lahir",
  "anak_2_tanggal_lahir",
  "anak_3_tanggal_lahir"
];
const EMAIL_FIELDS = ["email", "pasangan_email"];
const NUMERIC_ID_FIELDS = ["id_pegawai"];
const REQUIRED_FIELDS = PEGAWAI_IMPORT_COLUMNS.filter((column) => column.required).map((column) => column.key);
const TEMPLATE_VALIDATION_MAX_ROW = 10000;
const JENIS_KELAMIN_OPTIONS = ["P", "L", "Perempuan", "Laki-laki"];
const KONDISI_OPTIONS = ["Aktif", "Cuti", "Tugas Belajar", "Tidak Aktif", "Resign", "Pensiun"];
const STATUS_PERKAWINAN_OPTIONS = ["Belum Kawin", "Kawin", "Cerai Hidup", "Cerai Mati"];
const ADDRESS_IMPORT_FIELD_MAP = [
  ["jalan", "jalan"],
  ["kelurahan", "kelurahan"],
  ["kecamatan", "kecamatan"],
  ["kota_kabupaten", "kota_kabupaten"],
  ["provinsi", "provinsi"],
  ["kode_provinsi", "kode_provinsi"],
  ["kode_kota_kab", "kode_kota_kab"],
  ["kode_kecamatan", "kode_kecamatan"],
  ["kode_kelurahan", "kode_kelurahan"]
];
const PASANGAN_IMPORT_FIELD_MAP = {
  pasangan_nama: "nama",
  pasangan_no_tlp: "no_tlp",
  pasangan_email: "email",
  pasangan_pekerjaan: "pekerjaan",
  pasangan_status_tunjangan: "status_tunjangan"
};
const ANAK_IMPORT_FIELD_MAP = {
  nama: "nama",
  jenis_kelamin: "jenis_kelamin",
  tempat_lahir: "tempat_lahir",
  tanggal_lahir: "tanggal_lahir",
  pekerjaan: "pekerjaan",
  status_tunjangan: "status_tunjangan"
};
const RELATION_IMPORT_FIELDS = new Set([
  ...["domisili", "ktp"].flatMap((prefix) => ADDRESS_IMPORT_FIELD_MAP.map(([source]) => `${prefix}_${source}`)),
  ...Object.keys(PASANGAN_IMPORT_FIELD_MAP),
  ...[1, 2, 3].flatMap((index) => Object.keys(ANAK_IMPORT_FIELD_MAP).map((field) => `anak_${index}_${field}`))
]);

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnName(index) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function columnIndexFromRef(ref) {
  const letters = String(ref || "").match(/[A-Z]+/i)?.[0]?.toUpperCase() || "";
  return letters.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function getAttr(value, attr) {
  const match = String(value || "").match(new RegExp(`${attr}="([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function cellXml(rowIndex, columnIndex, value, style = 1) {
  const ref = `${columnName(columnIndex)}${rowIndex}`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function dataValidationsXml(validations = []) {
  if (!validations.length) return "";
  return `<dataValidations count="${validations.length}">${validations.map((validation) => (
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="${escapeXml(validation.errorTitle || "Nilai tidak valid")}" error="${escapeXml(validation.error || "Pilih nilai dari dropdown referensi.")}" sqref="${escapeXml(validation.sqref)}"><formula1>${escapeXml(validation.formula)}</formula1></dataValidation>`
  )).join("")}</dataValidations>`;
}

function sheetXml(rows, { freezeHeader = true, validations = [] } = {}) {
  const maxColumns = Math.max(1, ...rows.map((row) => row.length));
  const cols = Array.from({ length: maxColumns }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 18 : 28}" customWidth="1" style="1"/>`).join("");
  const data = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => cellXml(rowIndex + 1, columnIndex + 1, value, rowIndex === 0 ? 2 : 1)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const pane = freezeHeader ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${pane}<cols>${cols}</cols><sheetData>${data}</sheetData>
${dataValidationsXml(validations)}
</worksheet>`;
}

function definedNamesXml(definedNames = []) {
  if (!definedNames.length) return "";
  return `<definedNames>${definedNames.map((item) => `<definedName name="${escapeXml(item.name)}">${escapeXml(item.formula)}</definedName>`).join("")}</definedNames>`;
}

function workbookXml(sheets, definedNames = []) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
${definedNamesXml(definedNames)}
</workbook>`;
}

function workbookRelsXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function contentTypesXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF166493"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="49" fontId="1" fillId="2" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>
</styleSheet>`;
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
}

function referenceConfig(ukpdRows = []) {
  return [
    { key: "jenis_kelamin", header: "Jenis Kelamin", values: JENIS_KELAMIN_OPTIONS, name: "ref_jenis_kelamin" },
    { key: "anak_1_jenis_kelamin", header: "Jenis Kelamin Anak 1", values: JENIS_KELAMIN_OPTIONS, name: "ref_jenis_kelamin_anak_1" },
    { key: "anak_2_jenis_kelamin", header: "Jenis Kelamin Anak 2", values: JENIS_KELAMIN_OPTIONS, name: "ref_jenis_kelamin_anak_2" },
    { key: "anak_3_jenis_kelamin", header: "Jenis Kelamin Anak 3", values: JENIS_KELAMIN_OPTIONS, name: "ref_jenis_kelamin_anak_3" },
    { key: "pasangan_status_tunjangan", header: "Tunjangan Suami/Istri", values: ["DAPAT", "TIDAK"], name: "ref_tunjangan_pasangan" },
    { key: "anak_1_status_tunjangan", header: "Tunjangan Anak 1", values: ["DAPAT", "TIDAK"], name: "ref_tunjangan_anak_1" },
    { key: "anak_2_status_tunjangan", header: "Tunjangan Anak 2", values: ["DAPAT", "TIDAK"], name: "ref_tunjangan_anak_2" },
    { key: "anak_3_status_tunjangan", header: "Tunjangan Anak 3", values: ["DAPAT", "TIDAK"], name: "ref_tunjangan_anak_3" },
    { key: "agama", header: "Agama", values: AGAMA_OPTIONS, name: "ref_agama" },
    { key: "nama_ukpd", header: "Nama UKPD", values: uniqueSorted(ukpdRows.map((row) => row.nama_ukpd)), name: "ref_nama_ukpd" },
    { key: "jenis_pegawai", header: "Jenis Pegawai", values: JENIS_PEGAWAI_OPTIONS, name: "ref_jenis_pegawai" },
    { key: "jenis_kontrak", header: "Jenis Kontrak", values: JENIS_KONTRAK_OPTIONS, name: "ref_jenis_kontrak" },
    { key: "nama_jabatan_menpan", header: "jabatan_standar", values: JABATAN_STANDAR_OPTIONS, name: "ref_jabatan_standar" },
    { key: "pangkat_golongan", header: "Pangkat / Golongan", values: PANGKAT_GOLONGAN_OPTIONS, name: "ref_pangkat_golongan" },
    { key: "kondisi", header: "Kondisi", values: KONDISI_OPTIONS, name: "ref_kondisi" },
    { key: "status_perkawinan", header: "Status Perkawinan", values: STATUS_PERKAWINAN_OPTIONS, name: "ref_status_perkawinan" },
    { key: "wilayah", header: "Wilayah", values: WILAYAH, name: "ref_wilayah" }
  ];
}

function referenceRows(config) {
  const maxLength = Math.max(...config.map((item) => item.values.length));
  return [
    config.map((item) => item.header),
    ...Array.from({ length: maxLength }, (_, index) => [
      ...config.map((item) => item.values[index] || "")
    ])
  ];
}

function buildTemplateDefinedNames(config) {
  return config
    .map((item, index) => {
      if (!item.values.length) return null;
      const column = columnName(index + 1);
      return {
        name: item.name,
        formula: `'Referensi'!$${column}$2:$${column}$${item.values.length + 1}`
      };
    })
    .filter(Boolean);
}

function buildPegawaiSheetValidations(headers, config) {
  const byKey = new Map(config.map((item) => [item.key, item]));
  return headers
    .map((key, index) => {
      const item = byKey.get(key);
      if (!item?.values.length) return null;
      const column = columnName(index + 1);
      return {
        sqref: `${column}2:${column}${TEMPLATE_VALIDATION_MAX_ROW}`,
        formula: item.name,
        error: `Pilih ${item.header} dari dropdown referensi.`
      };
    })
    .filter(Boolean);
}

export async function buildPegawaiImportTemplate({ ukpdRows = [] } = {}) {
  const headers = PEGAWAI_EXPORT_COLUMNS.map((column) => column.header);
  const headerKeys = PEGAWAI_IMPORT_TEMPLATE_KEYS;
  const config = referenceConfig(ukpdRows);
  const definedNames = buildTemplateDefinedNames(config);
  const sampleUkpd = ukpdRows[0] || {};
  const sample = {
    nama: "Contoh Pegawai",
    nama_ukpd: sampleUkpd.nama_ukpd || "Dinas Kesehatan",
    jenis_ukpd: sampleUkpd.jenis_ukpd || "Dinkes",
    wilayah: sampleUkpd.wilayah || "Dinkes",
    jenis_kelamin: "P",
    tempat_lahir: "Jakarta",
    tanggal_lahir: "1990-01-31",
    nik: "3171000000000001",
    agama: "Islam",
    jenis_pegawai: "PNS",
    status_rumpun: "Tenaga Kesehatan",
    jenis_kontrak: "Tetap",
    nrk: "123456",
    nip: "199001312020121001",
    nama_jabatan_orb: "Analis Kesehatan",
    nama_jabatan_menpan_raw: "Administrator Kesehatan Ahli Pertama",
    nama_jabatan_menpan: "Administrator Kesehatan Ahli Pertama",
    struktur_atasan_langsung: "Kepala Subbagian",
    pangkat_golongan: "Penata Muda - III/a",
    tmt_pangkat_terakhir: "2024-04-01",
    jenjang_pendidikan: "S1",
    program_studi: "Kesehatan Masyarakat",
    nama_universitas: "Universitas Indonesia",
    no_hp_pegawai: "081234567890",
    email: "pegawai@example.go.id",
    domisili_jalan: "Jl. Medan Merdeka Selatan No. 8",
    domisili_kelurahan: "Gambir",
    domisili_kecamatan: "Gambir",
    domisili_kota_kabupaten: "Kota Jakarta Pusat",
    domisili_provinsi: "DKI Jakarta",
    ktp_jalan: "Jl. Medan Merdeka Selatan No. 8",
    ktp_kelurahan: "Gambir",
    ktp_kecamatan: "Gambir",
    ktp_kota_kabupaten: "Kota Jakarta Pusat",
    ktp_provinsi: "DKI Jakarta",
    pasangan_nama: "Contoh Pasangan",
    pasangan_no_tlp: "081298765432",
    pasangan_email: "pasangan@example.com",
    pasangan_pekerjaan: "Karyawan",
    pasangan_status_tunjangan: "DAPAT",
    anak_1_nama: "Contoh Anak",
    anak_1_jenis_kelamin: "L",
    anak_1_tempat_lahir: "Jakarta",
    anak_1_tanggal_lahir: "2015-06-01",
    anak_1_pekerjaan: "Pelajar",
    anak_1_status_tunjangan: "DAPAT",
    kondisi: "Aktif",
    tanggal_kondisi: "",
    status_perkawinan: "Kawin",
    tmt_kerja_ukpd: "2020-01-01"
  };
  const sheets = [
    { name: "Pegawai", rows: [headers], validations: buildPegawaiSheetValidations(headerKeys, config) },
    { name: "Contoh", rows: [headers, headerKeys.map((key, index) => (headers[index] === "No" ? "1" : sample[key] || ""))] },
    { name: "Aturan", rows: [["No", "Aturan"], ...PEGAWAI_IMPORT_RULES.map((rule, index) => [index + 1, rule]), ["", ""], ["Kolom Export", "Kunci Sistem", "Keterangan"], ...PEGAWAI_EXPORT_COLUMNS.map((column, index) => [column.header, headerKeys[index] || "(diabaikan)", PEGAWAI_IMPORT_COLUMN_RULES[headerKeys[index]] || column.header || "(diabaikan)"])] },
    { name: "Referensi", rows: referenceRows(config) }
  ];

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml(sheets));
  zip.folder("_rels").file(".rels", rootRelsXml());
  const xl = zip.folder("xl");
  xl.file("workbook.xml", workbookXml(sheets, definedNames));
  xl.file("styles.xml", stylesXml());
  xl.folder("_rels").file("workbook.xml.rels", workbookRelsXml(sheets));
  const worksheets = xl.folder("worksheets");
  sheets.forEach((sheet, index) => worksheets.file(`sheet${index + 1}.xml`, sheetXml(sheet.rows, { validations: sheet.validations || [] })));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function genderCode(value) {
  const text = normalizeCellValue(value).toUpperCase().replace(/\s+/g, " ");
  if (!text) return "";
  if (text === "P" || text.includes("PEREMPUAN") || text.includes("WANITA")) return "P";
  if (text === "L" || text.includes("LAKI") || text.includes("PRIA")) return "L";
  return value;
}

function exportCellValue(row, column, index) {
  if (typeof column.value === "function") return column.value(row, index);
  return row?.[column.key] ?? "";
}

export function buildWorkbookBuffer(sheets, definedNames = []) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml(sheets));
  zip.folder("_rels").file(".rels", rootRelsXml());
  const xl = zip.folder("xl");
  xl.file("workbook.xml", workbookXml(sheets, definedNames));
  xl.file("styles.xml", stylesXml());
  xl.folder("_rels").file("workbook.xml.rels", workbookRelsXml(sheets));
  const worksheets = xl.folder("worksheets");
  sheets.forEach((sheet, index) => worksheets.file(`sheet${index + 1}.xml`, sheetXml(sheet.rows, { validations: sheet.validations || [] })));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export function buildPegawaiExportRows(rows = []) {
  return [
    PEGAWAI_EXPORT_COLUMNS.map((column) => column.header),
    ...rows.map((row, index) => PEGAWAI_EXPORT_COLUMNS.map((column) => exportCellValue(row, column, index)))
  ];
}

export async function buildPegawaiExportWorkbook({ rows = [] } = {}) {
  return buildWorkbookBuffer([
    { name: "Data Pegawai", rows: buildPegawaiExportRows(rows) }
  ]);
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const HEADER_ALIASES = new Map();

function setHeaderAlias(label, key, { overwrite = false } = {}) {
  const normalized = normalizeHeader(label);
  if (!normalized || !key) return;
  if (!overwrite && HEADER_ALIASES.has(normalized)) return;
  HEADER_ALIASES.set(normalized, key);
}

for (const column of PEGAWAI_IMPORT_COLUMNS) {
  setHeaderAlias(column.key, column.key);
  setHeaderAlias(column.label, column.key);
}
PEGAWAI_EXPORT_COLUMNS.forEach((column, index) => {
  setHeaderAlias(column.header, PEGAWAI_IMPORT_TEMPLATE_KEYS[index]);
});
setHeaderAlias("jabatan_standar", "nama_jabatan_menpan", { overwrite: true });
setHeaderAlias("tempat_lahir_anak_ke_2", "anak_2_tempat_lahir", { overwrite: true });
setHeaderAlias("tempat_lahir_anak_2", "anak_2_tempat_lahir", { overwrite: true });

function normalizeCellValue(value) {
  return String(value ?? "").trim().replace(/^`+/, "");
}

function parseCsv(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "");
  const firstLine = normalized.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((item) => item.some((value) => normalizeCellValue(value)));
}

function extractTextNodes(xml) {
  const values = [];
  const regex = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = regex.exec(xml))) {
    values.push(decodeXml(match[1]));
  }
  return values.join("");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const regex = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = regex.exec(xml))) {
    strings.push(extractTextNodes(match[1]));
  }
  return strings;
}

function cellValue(attrs, inner, sharedStrings) {
  const type = getAttr(attrs, "t");
  if (type === "inlineStr") return extractTextNodes(inner);
  const raw = decodeXml((inner.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1] || "");
  if (type === "s") return sharedStrings[Number(raw)] || "";
  if (type === "str") return raw;
  return raw;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const values = [];
    const cellRegex = /<c([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[2]))) {
      const ref = getAttr(cellMatch[1], "r");
      const index = columnIndexFromRef(ref);
      if (index > 0) values[index - 1] = cellValue(cellMatch[1], cellMatch[2], sharedStrings);
    }
    rows.push(values.map((value) => value ?? ""));
  }
  return rows;
}

function parseRowsToObjects(rows) {
  const headerRow = rows[0] || [];
  const headers = headerRow.map((value, columnIndex) => {
    const normalized = normalizeHeader(value);
    const expected = normalizeHeader(PEGAWAI_EXPORT_COLUMNS[columnIndex]?.header);
    if (expected && normalized === expected) return PEGAWAI_IMPORT_TEMPLATE_KEYS[columnIndex] || "";
    return HEADER_ALIASES.get(normalized) || "";
  });
  return rows.slice(1).map((row, index) => {
    const record = {};
    headers.forEach((key, columnIndex) => {
      if (!key) return;
      record[key] = normalizeCellValue(row[columnIndex]);
    });
    return { rowNumber: index + 2, record };
  }).filter(({ record }) => Object.values(record).some((value) => normalizeCellValue(value)));
}

function assertXlsxSignature(buffer) {
  if (Buffer.from(buffer).subarray(0, 2).toString("utf8") !== "PK") {
    throw new Error("File XLSX tidak valid atau rusak.");
  }
}

function assertWorkbookHasNoMacros(zip) {
  const blockedEntry = Object.keys(zip.files).find((entryName) => {
    const lowerName = entryName.toLowerCase();
    return lowerName === "xl/vbaproject.bin"
      || lowerName.endsWith("/vbaproject.bin")
      || lowerName.startsWith("xl/macrosheets/")
      || lowerName.startsWith("xl/dialogsheets/");
  });

  if (blockedEntry) {
    throw new Error("File Excel mengandung macro/VBA dan diblokir demi keamanan.");
  }
}

async function readWorkbookRows(buffer) {
  assertXlsxSignature(buffer);
  const zip = await JSZip.loadAsync(buffer);
  assertWorkbookHasNoMacros(zip);
  const workbookXmlFile = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = parseSharedStrings(sharedStringsFile ? await sharedStringsFile.async("string") : "");

  let sheetPath = "xl/worksheets/sheet1.xml";
  const sheetMatch = String(workbookXmlFile || "").match(/<sheet[^>]*name="Pegawai"[^>]*r:id="([^"]+)"/i)
    || String(workbookXmlFile || "").match(/<sheet[^>]*r:id="([^"]+)"/i);
  if (sheetMatch && relsXml) {
    const relMatch = relsXml.match(new RegExp(`<Relationship[^>]*Id="${sheetMatch[1]}"[^>]*Target="([^"]+)"`, "i"));
    if (relMatch) sheetPath = `xl/${decodeXml(relMatch[1]).replace(/^\/?xl\//, "")}`;
  }

  const sheet = await zip.file(sheetPath)?.async("string");
  if (!sheet) throw new Error("Sheet Pegawai tidak ditemukan di file Excel.");
  return parseSheetRows(sheet, sharedStrings);
}

export async function parsePegawaiImportFile(buffer, fileName = "") {
  const name = String(fileName || "").toLowerCase();
  const rows = name.endsWith(".csv")
    ? parseCsv(Buffer.from(buffer).toString("utf8"))
    : await readWorkbookRows(buffer);
  return parseRowsToObjects(rows);
}

function normalizeDateValue(value) {
  const text = normalizeCellValue(value);
  if (!text) return { value: "", valid: true };

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20000 && serial <= 60000) {
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      return { value: date.toISOString().slice(0, 10), valid: true };
    }
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const normalized = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : local
      ? `${local[3]}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`
      : "";
  if (!normalized) return { value: text, valid: false };

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    return { value: text, valid: false };
  }
  return { value: normalized, valid: true };
}

function addError(errors, field, message) {
  errors.push({ field, message });
}

function normalizeReferenceField(data, errors, field, allowed, normalize, label) {
  const value = normalize(data[field]);
  data[field] = value;
  if (value && !allowed.includes(value)) {
    addError(errors, field, `${label} harus mengikuti daftar referensi.`);
  }
}

function normalizeGenderValue(value) {
  const text = normalizeCellValue(value);
  const key = text.toUpperCase().replace(/[^A-Z]+/g, "");
  if (!key) return "";
  if (key === "P" || key === "PEREMPUAN" || key === "WANITA") return "Perempuan";
  if (key === "L" || key === "LAKILAKI" || key === "PRIA") return "Laki-laki";
  return text;
}

function hasObjectContent(object) {
  return Object.values(object || {}).some((value) => normalizeCellValue(value));
}

function buildAddressImportSection(data, prefix) {
  const entry = {};
  for (const [sourceField, targetField] of ADDRESS_IMPORT_FIELD_MAP) {
    const value = normalizeCellValue(data[`${prefix}_${sourceField}`]);
    if (value) entry[targetField] = value;
  }
  return hasObjectContent(entry) ? entry : null;
}

function buildPegawaiImportRelations(data) {
  const relations = {};
  const alamat = {};
  const domisili = buildAddressImportSection(data, "domisili");
  const ktp = buildAddressImportSection(data, "ktp");
  if (domisili) alamat.domisili = domisili;
  if (ktp) alamat.ktp = ktp;
  if (Object.keys(alamat).length) relations.alamat = alamat;

  const pasangan = {};
  for (const [sourceField, targetField] of Object.entries(PASANGAN_IMPORT_FIELD_MAP)) {
    const value = normalizeCellValue(data[sourceField]);
    if (value) pasangan[targetField] = value;
  }
  if (hasObjectContent(pasangan)) {
    relations.pasangan = {
      status_punya: "Ya",
      ...pasangan
    };
  }

  const anak = [1, 2, 3].map((index) => {
    const entry = { urutan: index };
    for (const [sourceSuffix, targetField] of Object.entries(ANAK_IMPORT_FIELD_MAP)) {
      const sourceField = `anak_${index}_${sourceSuffix}`;
      let value = normalizeCellValue(data[sourceField]);
      if (targetField === "jenis_kelamin") value = normalizeGenderValue(value);
      if (value) entry[targetField] = value;
    }
    return entry;
  }).filter((entry) => hasObjectContent(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "urutan"))));
  if (anak.length) relations.anak = anak;

  for (const field of RELATION_IMPORT_FIELDS) {
    delete data[field];
  }

  return relations;
}

export function normalizePegawaiImportRecord(record) {
  const errors = [];
  const data = {};

  for (const column of PEGAWAI_IMPORT_COLUMNS) {
    const value = normalizeCellValue(record[column.key]);
    if (value) data[column.key] = value;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!normalizeCellValue(data[field])) {
      addError(errors, field, `${field} wajib diisi.`);
    }
  }
  if (data.nama && data.nama.length < 3) addError(errors, "nama", "Nama minimal 3 karakter.");

  for (const field of NUMERIC_ID_FIELDS) {
    if (!data[field]) continue;
    if (!/^\d+$/.test(data[field])) {
      addError(errors, field, `${field} harus berupa angka.`);
    } else {
      data[field] = Number(data[field]);
    }
  }

  if (data.jenis_pegawai) {
    data.jenis_pegawai = normalizeJenisPegawai(data.jenis_pegawai);
    if (!JENIS_PEGAWAI_OPTIONS.includes(data.jenis_pegawai)) {
      addError(errors, "jenis_pegawai", `Jenis pegawai harus salah satu dari: ${JENIS_PEGAWAI_OPTIONS.join(", ")}.`);
    }
  }

  normalizeReferenceField(data, errors, "agama", AGAMA_OPTIONS, normalizeAgamaOption, "Agama");
  normalizeReferenceField(data, errors, "jenis_kontrak", JENIS_KONTRAK_OPTIONS, normalizeJenisKontrakOption, "Jenis kontrak");
  normalizeReferenceField(data, errors, "pangkat_golongan", PANGKAT_GOLONGAN_OPTIONS, normalizePangkatGolonganOption, "Pangkat/golongan");
  normalizeReferenceField(data, errors, "nama_jabatan_menpan", JABATAN_STANDAR_OPTIONS, normalizeJabatanStandarOption, "Jabatan Kepmenpan 11");

  for (const field of ["jenis_kelamin", "anak_1_jenis_kelamin", "anak_2_jenis_kelamin", "anak_3_jenis_kelamin"]) {
    if (data[field]) data[field] = normalizeGenderValue(data[field]);
  }

  for (const field of DATE_FIELDS) {
    if (!data[field]) continue;
    const date = normalizeDateValue(data[field]);
    data[field] = date.value;
    if (!date.valid) addError(errors, field, `${field} harus memakai format YYYY-MM-DD.`);
  }

  for (const field of EMAIL_FIELDS) {
    if (data[field] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[field])) {
      addError(errors, field, "Format email tidak valid.");
    }
  }

  const relations = buildPegawaiImportRelations(data);
  if (Object.keys(relations).length) {
    Object.assign(data, relations);
  }

  return { data, errors };
}

export function buildPegawaiImportError(rowNumber, errors) {
  return {
    rowNumber,
    messages: errors.map((error) => error.message),
    fields: errors.map((error) => error.field)
  };
}
