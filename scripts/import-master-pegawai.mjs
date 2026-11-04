import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
const outputDir = path.resolve("src/data/generated");

if (!inputPath) {
  console.error("Usage: node scripts/import-master-pegawai.mjs <csv-path>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value) {
  return String(value || "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function clean(value) {
  const text = String(value || "").trim();
  return text === "-" ? "" : text;
}

function titleCaseKnown(value) {
  const normalized = clean(value).toUpperCase();
  const map = {
    "JAKARTA TIMUR": "Jakarta Timur",
    "JAKARTA BARAT": "Jakarta Barat",
    "JAKARTA PUSAT": "Jakarta Pusat",
    "JAKARTA SELATAN": "Jakarta Selatan",
    "JAKARTA UTARA": "Jakarta Utara",
    "KEPULAUAN SERIBU": "Kepulauan Seribu",
    "PUSKESMAS": "Puskesmas"
  };
  return map[normalized] || clean(value);
}

function normalizeGender(value) {
  const normalized = clean(value).toUpperCase().replace(/\s+/g, " ");
  if (!normalized || normalized === "-") return "Tidak Diketahui";
  if (normalized === "P" || normalized === "PEREMPUAN" || normalized === "WANITA") return "Perempuan";
  if (normalized === "L" || normalized === "LAKI-LAKI" || normalized === "LAKI - LAKI" || normalized === "LAKI LAKI" || normalized === "PRIA") return "Laki-laki";
  return "Tidak Diketahui";
}

function normalizeEducation(value) {
  const raw = clean(value);
  if (!raw || raw === "#N/A") return "Tidak Diketahui";
  const text = raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[._]/g, " ")
    .trim();

  if (/\bS5\b/.test(text)) return "Tidak Diketahui";
  if (/\bS\s*3\b|\bS-3\b|\bDOKTOR\b/.test(text)) return "S3";
  if (/SPESIALIS|\bSP\s*1\b|DOKTER SPESIALIS|DR\.?\s*SPESIALIS/.test(text)) return "Spesialis";
  if (/\bS\s*2\b|\bS-2\b|MAGISTER/.test(text)) return "S2";
  if (/PROFESI|NERS|APOTEKER|\bDR\.?\b|DOKTER/.test(text)) return "Profesi";
  if (/\bS\s*1\b|\bS-1\b|\bSI\b|\bSI-1\b|SARJANA/.test(text)) return "S1";
  if (/\bD\s*4\b|\bD-4\b|\bD-IV\b|\bDIV\b/.test(text)) return "D4";
  if (/\bD\s*3\b|\bD-3\b|\bDIII\b|\bD III\b|DIPLOMA III|DIPLOMA 3/.test(text)) return "D3";
  if (/\bD\s*2\b|\bD-2\b/.test(text)) return "D2";
  if (/\bD\s*1\b|\bD-1\b|\bDI\b/.test(text)) return "D1";
  if (/SMA|SMK|SLTA|SMU|STM|SMEA|MA\b|MADRASAH ALIYAH|PAKET C|SPK|SMF|SMAN|STMN/.test(text)) return "SMA/SMK";
  if (/SMP|SLTP/.test(text)) return "SMP";
  if (/\bSD\b/.test(text)) return "SD";
  return "Tidak Diketahui";
}

function normalizeRumpun(value, jenisPegawai) {
  const raw = clean(value);
  const text = raw.toUpperCase().replace(/\s+/g, " ");
  if (clean(jenisPegawai).toUpperCase() === "PJLP") return "PJLP";
  if (text.startsWith("PJLP")) return "PJLP";
  if (text === "PETUGAS KEBERSIHAN" || text === "PETUGAS KEAMANAN") return "PJLP";
  if (text === "JABATAN ADMINISTRATOR") return "Jabatan Administrator";
  return raw || "Tidak Diketahui";
}

function normalizeDate(value) {
  const text = clean(value);
  if (!text) return "";

  const monthNames = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MEI: "05",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AGU: "08",
    AUG: "08",
    SEP: "09",
    OKT: "10",
    OCT: "10",
    NOV: "11",
    DES: "12",
    DEC: "12"
  };

  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (named) {
    const day = named[1].padStart(2, "0");
    const month = monthNames[named[2].slice(0, 3).toUpperCase()];
    return month ? `${named[3]}-${month}-${day}` : text;
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const dayFirst = first > 12;
    const day = String(dayFirst ? first : second).padStart(2, "0");
    const month = String(dayFirst ? second : first).padStart(2, "0");
    return `${slash[3]}-${month}-${day}`;
  }

  return text;
}

function rowGetter(headers, values) {
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  return (key) => clean(row[key]);
}

function uniqueUkpdFromPegawai(pegawai) {
  const map = new Map();
  for (const item of pegawai) {
    if (!item.nama_ukpd) continue;
    if (!map.has(item.nama_ukpd)) {
      map.set(item.nama_ukpd, {
        id_ukpd: map.size + 1,
        nama_ukpd: item.nama_ukpd,
        password: "",
        jenis_ukpd: item.jenis_ukpd,
        role: "ADMIN_UKPD",
        wilayah: item.wilayah,
        created_at: new Date().toISOString().slice(0, 10)
      });
    }
  }
  return [...map.values()];
}

const csvText = fs.readFileSync(inputPath, "utf8");
const rows = parseCsv(csvText);
const headers = rows[0].map(normalizeHeader);
const dataRows = rows.slice(1);

const pegawai = [];
const alamat = [];
const pasangan = [];
const anak = [];
const keluarga = [];
const wilayahAnomalies = new Map();

for (const values of dataRows) {
  const get = rowGetter(headers, values);
  const id = Number(get("No")) || pegawai.length + 1;
  const wilayah = titleCaseKnown(get("WILAYAH"));
  if (wilayah === "Puskesmas") {
    wilayahAnomalies.set(id, get("NAMA UKPD"));
  }

  pegawai.push({
    id_pegawai: id,
    nama: get("NAMA (TANPA GELAR)"),
    jenis_kelamin: normalizeGender(get("JENIS KELAMIN (L/P)")),
    jenis_kelamin_raw: get("JENIS KELAMIN (L/P)"),
    tempat_lahir: get("TEMPAT LAHIR"),
    tanggal_lahir: normalizeDate(get("TANGGAL LAHIR")),
    nik: get("NIK"),
    agama: titleCaseKnown(get("AGAMA")),
    nama_ukpd: get("NAMA UKPD"),
    jenis_ukpd: get("JENIS UKPD"),
    wilayah,
    jenis_pegawai: get("JENIS PEGAWAI"),
    status_rumpun: normalizeRumpun(get("STATUS RUMPUN"), get("JENIS PEGAWAI")),
    status_rumpun_raw: get("STATUS RUMPUN"),
    jenis_kontrak: get("JENIS KONTRAK"),
    nrk: get("NRK"),
    nip: get("NIP"),
    nama_jabatan_orb: get("NAMA JABATAN ORB (PERGUB 1 TAHUN 2017)"),
    nama_jabatan_menpan: get("STRUKTUR NAMA JABATAN PERMENPAN RB NO 11 TAHUN 2024"),
    struktur_atasan_langsung: get("STRUKTUR ATASAN LANGSUNG"),
    pangkat_golongan: get("PANGKAT / GOLONGAN"),
    tmt_pangkat_terakhir: normalizeDate(get("TMT PANGKAT TERAKHIR")),
    jenjang_pendidikan: normalizeEducation(get("JENJANG PENDIDIKAN (BERDASARKAN SK PANGKAT TERAKHIR)")),
    jenjang_pendidikan_raw: get("JENJANG PENDIDIKAN (BERDASARKAN SK PANGKAT TERAKHIR)"),
    program_studi: get("PROGRAM STUDI"),
    nama_universitas: get("NAMA UNIVERSITAS"),
    no_hp_pegawai: get("NO. HP PEGAWAI"),
    email: get("EMAIL AKTIF PEGAWAI"),
    no_bpjs: get("No BPJS"),
    kondisi: titleCaseKnown(get("KONDISI")),
    status_perkawinan: titleCaseKnown(get("Status Perkawinan")),
    gelar_depan: get("Gelar Depan"),
    gelar_belakang: get("Gelar Belakang"),
    tmt_kerja_ukpd: normalizeDate(get("TMT KERJA DI UKPD SAAT INI")),
    created_at: new Date().toISOString().slice(0, 10)
  });

  for (const tipe of ["DOMISILI", "KTP"]) {
    const jalan = get(`${tipe}_JALAN`);
    const kelurahan = get(`${tipe}_KELURAHAN`);
    const kecamatan = get(`${tipe}_KECAMATAN`);
    const kota = get(`${tipe}_KOTA/KABUPATEN`);
    const provinsi = get(`${tipe}_PROVINSI`);
    if (jalan || kelurahan || kecamatan || kota || provinsi) {
      alamat.push({
        id: alamat.length + 1,
        id_pegawai: id,
        tipe: tipe === "DOMISILI" ? "domisili" : "ktp",
        jalan,
        kelurahan,
        kecamatan,
        kota_kabupaten: kota,
        provinsi,
        kode_provinsi: "",
        kode_kota_kab: "",
        kode_kecamatan: "",
        kode_kelurahan: "",
        created_at: new Date().toISOString().slice(0, 10)
      });
    }
  }

  const pasanganNama = get("NAMA_SUAMI/ISTRI");
  if (pasanganNama || get("NO_TELP_SUAMI/ISTRI") || get("EMAIL_SUAMI/ISTRI")) {
    const pasanganEntry = {
      id: pasangan.length + 1,
      id_pegawai: id,
      status_punya: pasanganNama ? "Ya" : "Tidak",
      nama: pasanganNama,
      no_tlp: get("NO_TELP_SUAMI/ISTRI"),
      email: get("EMAIL_SUAMI/ISTRI"),
      pekerjaan: get("PEKERJAAN"),
      created_at: new Date().toISOString().slice(0, 10)
    };
    pasangan.push(pasanganEntry);
    keluarga.push({
      id: keluarga.length + 1,
      id_pegawai: id,
      hubungan: "pasangan",
      hubungan_detail: "",
      status_punya: pasanganEntry.status_punya,
      status_tunjangan: "",
      urutan: "",
      nama: pasanganEntry.nama,
      jenis_kelamin: "",
      tempat_lahir: "",
      tanggal_lahir: "",
      no_tlp: pasanganEntry.no_tlp,
      email: pasanganEntry.email,
      pekerjaan: pasanganEntry.pekerjaan,
      sumber_tabel: "pasangan",
      sumber_id: pasanganEntry.id,
      created_at: pasanganEntry.created_at
    });
  }

  for (const urutan of [1, 2, 3]) {
    const suffix = urutan === 1 ? "KE-1" : `KE-${urutan}`;
    const tempatKey = urutan === 2 ? "TEMPAT LAHIR 2" : `TEMPAT LAHIR ANAK ${suffix}`;
    const nama = get(`NAMA ANAK ${suffix}`);
    if (!nama) continue;
    const anakEntry = {
      id: anak.length + 1,
      id_pegawai: id,
      urutan,
      nama,
      jenis_kelamin: normalizeGender(get(`JENIS KELAMIN ANAK ${suffix}`)),
      tempat_lahir: get(tempatKey),
      tanggal_lahir: normalizeDate(get(`TANGGAL LAHIR ANAK ${suffix}`)),
      pekerjaan: get(`PEKERJAAN ANAK ${suffix}`),
      created_at: new Date().toISOString().slice(0, 10)
    };
    anak.push(anakEntry);
    keluarga.push({
      id: keluarga.length + 1,
      id_pegawai: id,
      hubungan: "anak",
      hubungan_detail: "",
      status_punya: "",
      status_tunjangan: "",
      urutan: anakEntry.urutan,
      nama: anakEntry.nama,
      jenis_kelamin: anakEntry.jenis_kelamin,
      tempat_lahir: anakEntry.tempat_lahir,
      tanggal_lahir: anakEntry.tanggal_lahir,
      no_tlp: "",
      email: "",
      pekerjaan: anakEntry.pekerjaan,
      sumber_tabel: "anak",
      sumber_id: anakEntry.id,
      created_at: anakEntry.created_at
    });
  }
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "pegawai.json"), JSON.stringify(pegawai));
fs.writeFileSync(path.join(outputDir, "ukpd.json"), JSON.stringify(uniqueUkpdFromPegawai(pegawai)));
fs.writeFileSync(path.join(outputDir, "alamat.json"), JSON.stringify(alamat));
fs.writeFileSync(path.join(outputDir, "keluarga.json"), JSON.stringify(keluarga));
fs.writeFileSync(path.join(outputDir, "import-summary.json"), JSON.stringify({
  source: inputPath,
  imported_at: new Date().toISOString(),
  total_rows: pegawai.length,
  total_ukpd: uniqueUkpdFromPegawai(pegawai).length,
  total_alamat: alamat.length,
  total_keluarga: keluarga.length,
  total_pasangan: pasangan.length,
  total_anak: anak.length,
  keluarga_breakdown: {
    pasangan: pasangan.length,
    anak: anak.length
  },
  headers,
  wilayah_anomalies: Object.fromEntries(wilayahAnomalies)
}, null, 2));

console.log(`Imported ${pegawai.length} pegawai`);
console.log(`Generated ${uniqueUkpdFromPegawai(pegawai).length} UKPD, ${alamat.length} alamat, ${keluarga.length} keluarga (${pasangan.length} pasangan + ${anak.length} anak)`);
if (wilayahAnomalies.size) {
  console.log(`Wilayah anomalies: ${wilayahAnomalies.size}`);
}
