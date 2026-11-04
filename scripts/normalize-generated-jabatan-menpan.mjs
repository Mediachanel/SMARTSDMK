import fs from "node:fs";
import path from "node:path";

const pegawaiPath = path.resolve("src/data/generated/pegawai.json");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleKnown(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bDan\b/g, "dan")
    .replace(/\bDi\b/g, "di")
    .replace(/\bDki\b/g, "DKI")
    .replace(/\bRsud\b/g, "RSUD")
    .replace(/\bRskd\b/g, "RSKD")
    .replace(/\bUpt\b/g, "UPT")
    .replace(/\bPjlp\b/g, "PJLP")
    .replace(/\bSdm\b/g, "SDM");
}

const exactMap = new Map(Object.entries({
  "(kepala puskesmas) administrator kesehatan madya": "Administrator Kesehatan Ahli Madya",
  "administrasi": "Pengadministrasi Perkantoran",
  "administrasi umum": "Pengadministrasi Perkantoran",
  "administrasi kesehataan ahli pertama": "Administrator Kesehatan Ahli Pertama",
  "administrator kesehatah ahli muda": "Administrator Kesehatan Ahli Muda",
  "ahli pertama - apoteker": "Apoteker Ahli Pertama",
  "ahli pertama - dokter": "Dokter Ahli Pertama (Umum)",
  "ahli pertama - nutrisionis": "Nutrisionis Ahli Pertama",
  "ahli pertama - perawat": "Perawat Ahli Pertama",
  "ahli pertama - tenaga promosi kesehatan dan ilmu perilaku": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Pertama",
  "ahli pertama tenaga promosi kesehatan dan ilmu perilaku": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Pertama",
  "akpd ahli pertama": "Penelaah Teknis Kebijakan",
  "akpd pertama": "Penelaah Teknis Kebijakan",
  "analis kebijakan perangkat daerah ahli pertama": "Penelaah Teknis Kebijakan",
  "analis keuangan pusat dan daerah ahli pertama": "Penelaah Teknis Kebijakan",
  "analisis keuangan pusat dan daerah ahli pertama": "Penelaah Teknis Kebijakan",
  "analis tata usaha": "Penelaah Teknis Kebijakan",
  "analis kesehatan": "Pranata Laboratorium Kesehatan Ahli Pertama",
  "analis sdm ahli pertama": "Analis Sumber Daya Manusia Aparatur Ahli Pertama",
  "analis sdm aparatur ahli pertama": "Analis Sumber Daya Manusia Aparatur Ahli Pertama",
  "analis sdm aparatur ahli muda": "Analis Sumber Daya Manusia Aparatur Ahli Muda",
  "anak buah kapal": "Kelasi",
  "ariparis terampil": "Arsiparis Terampil",
  "arsiparis": "Arsiparis Terampil",
  "asisten anestesi terampil": "Asisten Penata Anestesi Terampil",
  "asisten penata anestesi": "Asisten Penata Anestesi Terampil",
  "asisten penata anesteri terampil": "Asisten Penata Anestesi Terampil",
  "asiten penata anastesi terampil": "Asisten Penata Anestesi Terampil",
  "asisten apoteker pelaksana lanjutan": "Asisten Apoteker Penyelia",
  "asisten apoteker terampir": "Asisten Apoteker Terampil",
  "atlm terampil": "Pranata Laboratorium Kesehatan Terampil",
  "bendahara": "Penelaah Teknis Kebijakan",
  "bendahara pembantu": "Penelaah Teknis Kebijakan",
  "ddokter umum ahli pertama": "Dokter Ahli Pertama (Umum)",
  "direktur": "Direktur RSUD/RSKD",
  "direktur rsud b": "Direktur RSUD/RSKD",
  "direktur rsud c": "Direktur RSUD/RSKD",
  "direktur rsud d": "Direktur RSUD/RSKD",
  "dokter ahi pertama": "Dokter Ahli Pertama (Umum)",
  "dokter ahli gigi muda": "Dokter Gigi Ahli Muda (Umum)",
  "dokter ahli gigi pertama": "Dokter Gigi Ahli Pertama (Umum)",
  "dokter gig ahli pertama": "Dokter Gigi Ahli Pertama (Umum)",
  "dokter gigi mdya": "Dokter Gigi Ahli Madya (Umum)",
  "dokter gigi terampil": "Dokter Gigi Ahli Pertama (Umum)",
  "dokter muda": "Dokter Gigi Ahli Muda (Umum)",
  "dokter umum ahli muda": "Dokter Gigi Ahli Muda (Umum)",
  "dokter ahli pertama - dokter (umum)": "Dokter Ahli Pertama (Umum)",
  "elektromedik": "Teknisi Elektromedis Terampil",
  "epid ahli pertama": "Epidemiolog Kesehatan Ahli Pertama",
  "epidemiologi ahli pertama": "Epidemiolog Kesehatan Ahli Pertama",
  "epidemologi kesehatan ahli pertama": "Epidemiolog Kesehatan Ahli Pertama",
  "fasilitator pemerintahan": "Jabatan Pelaksana Satuan",
  "fisikawan medis pertama": "Fisikawan Medis Ahli Pertama",
  "fisikiawan medis ahli muda": "Fisikawan Medis Ahli Muda",
  "fisikiawan medis ahli pertama": "Fisikawan Medis Ahli Pertama",
  "humas ahli pertama": "Pranata Humas Ahli Pertama",
  "jakarta timur": "",
  "juru mudi": "Operator Layanan Operasional",
  "keamanan": "PJLP Keamanan",
  "kelasi": "Operator Layanan Operasional",
  "kepala satuan instalasi farmasi": "Jabatan Pelaksana Satuan",
  "kepala satuan instalasi rekam medis": "Jabatan Pelaksana Satuan",
  "kepala satuan pelaksana": "Jabatan Pelaksana Satuan",
  "ketua satuan pelaksana": "Jabatan Pelaksana Satuan",
  "koordinator satuan pelaksana": "Jabatan Pelaksana Satuan",
  "legal": "Pengolah Data dan Informasi",
  "mekanikal": "Operator Layanan Operasional",
  "nahkoda": "Nahkoda",
  "nakhoda": "Nahkoda",
  "nutrisionist pertama": "Nutrisionis Ahli Pertama",
  "nutrisionist terampil": "Nutrisionis Terampil",
  "nutrisonis ahli pertama": "Nutrisionis Ahli Pertama",
  "nutrisionos mahir": "Nutrisionis Mahir",
  "operasi layanan operasional": "Operator Layanan Operasional",
  "operator layanan opesional": "Operator Layanan Operasional",
  "operator layanan operasaional": "Operator Layanan Operasional",
  "operator layaunan operasional": "Operator Layanan Operasional",
  "pasukan putih": "PJLP Lainnya",
  "pekarya": "Operator Layanan Kesehatan",
  "pelaksana teknis tingkat terampil": "Pengolah Data dan Informasi",
  "pelayanan kesehatan kel": "Pengolah Data dan Informasi",
  "pembantu orang sakit": "Operator Layanan Kesehatan",
  "pembimbing kesehatan kerja muda": "Pembimbing Kesehatan Kerja Ahli Pertama",
  "penata anestasi ahli pertama": "Penata Anestesi Ahli Pertama",
  "penata anestesi": "Asisten Penata Anestesi Terampil",
  "penata anestesi terampil": "Asisten Penata Anestesi Terampil",
  "penata kelola layanan": "Penata Kelola Layanan Kesehatan",
  "penata kelola sistem & teknologi informasi": "Penata Kelola Sistem dan Teknologi Informasi",
  "penata kelola sistem dan informasi": "Penata Kelola Sistem dan Teknologi Informasi",
  "penata kelola sistem teknologi dan informasi": "Penata Kelola Sistem dan Teknologi Informasi",
  "penata kelola sistem teknologi informasi": "Penata Kelola Sistem dan Teknologi Informasi",
  "penata laboratorium terampil": "Pranata Laboratorium Kesehatan Terampil",
  "penelaah teknik kebijakan": "Penata Kelola Layanan Kesehatan",
  "penelaah teknis kebijakan": "Penata Kelola Layanan Kesehatan",
  "penelaah teknis kebijakan/penata kelola sistem dan teknologi informasi": "Penata Kelola Sistem dan Teknologi Informasi",
  "penerima tamu": "Operator Layanan Operasional",
  "pengadministrasi keuangan": "Pengadministrasi Perkantoran",
  "pengadministrasi operasional": "Pengadministrasi Perkantoran",
  "pengadministrasi rekam medis dan informasi": "Pengadministrasi Perkantoran",
  "pengadministrasi umum": "Pengadministrasi Perkantoran",
  "pengadministrasi satuan pelaksana kelurahan": "Pengadministrasi Perkantoran",
  "pengadminitrasi umum": "Pengadministrasi Perkantoran",
  "pengadministrasi barang dan jasa": "Pengadministrasi Perkantoran",
  "pengadministrasi kasir": "Pengadministrasi Perkantoran",
  "pengadministrasi kepegawaian": "Pengadministrasi Perkantoran",
  "pengadministrasi layanan kehumasan": "Pengadministrasi Perkantoran",
  "pengelola layanan keshatan": "Pengolah Data dan Informasi",
  "pengelola layanan oprasional": "Pengolah Data dan Informasi",
  "pengelola sistem informasi": "Pengolah Data dan Informasi",
  "pengelola teknologi informasi": "Pengolah Data dan Informasi",
  "pengemudi": "Operator Layanan Kesehatan",
  "pengemudi ambulan": "Operator Layanan Kesehatan",
  "pengendali teknologi informasi": "Operator Layanan Kesehatan",
  "pengolah": "Pengolah Data dan Informasi",
  "pengolah data": "Pengolah Data dan Informasi",
  "pengolah data informasi": "Pengolah Data dan Informasi",
  "pengolah data dan perencanaan": "Pengolah Data dan Informasi",
  "pengolah data sistem dan informasi": "Pengolah Data dan Informasi",
  "pengolah datin humas": "Pengolah Data dan Informasi",
  "pengolah kepegawaian": "Pengolah Data dan Informasi",
  "pengolah layanan ukp": "Pengolah Data dan Informasi",
  "pengolah pelayanan kesehatan": "Pengolah Data dan Informasi",
  "pengolah pelayanan kesehatan terampil": "Pengolah Data dan Informasi",
  "pengolah penyelenggara pelatihan": "Pengolah Data dan Informasi",
  "pengolah sarana dan prasarana kantor": "Pengolah Data dan Informasi",
  "pengolah tata usaha": "Pengolah Data dan Informasi",
  "pengolah teknologi informasi": "Pengolah Data dan Informasi",
  "pengolah perencanaan": "Pengolah Data dan Informasi",
  "pengolah sekretariat": "Pengolah Data dan Informasi",
  "pengolah diklat": "Pengolah Data dan Informasi",
  "pengolah umum": "Pengolah Data dan Informasi",
  "pengurus barang": "Pranata Laksana Barang Terampil",
  "pengurus barang pembantu": "Pranata Laksana Barang Terampil",
  "penyusun kebutuhan barang inventaris": "Pranata Laksana Barang Terampil",
  "perawa ahli muda": "Perawat Ahli Muda",
  "perawat ahi pertama": "Perawat Ahli Pertama",
  "perawat ahli pertma": "Perawat Ahli Pertama",
  "perawat pelaksana": "Perawat Terampil",
  "perawat terampi": "Perawat Terampil",
  "perawat gigi pelaksana": "Terapis Gigi dan Mulut Terampil",
  "perawat gigi penyelia": "Terapis Gigi dan Mulut Penyelia",
  "perawat gigi terampil": "Terapis Gigi dan Mulut Terampil",
  "perekam medis dan informasi kesehatan ahli muda": "Perekam Medis Ahli Muda",
  "perekam medis dan informasi kesehatan ahli pertama": "Perekam Medis Ahli Pertama",
  "perekam medis dan informasi kesehatan mahir": "Perekam Medis Mahir",
  "perekam medis dan informasi kesehatan penyelia": "Perekam Medis Penyelia",
  "perekam medis dan informasi kesehatan pertama": "Perekam Medis Ahli Pertama",
  "perekam medis dan informasi kesehatan terampil": "Perekam Medis Terampil",
  "perekam medis dan informasi kesehatan terampil puskesmas pembantu": "Perekam Medis Terampil",
  "rekam medis terampil": "Perekam Medis Terampil",
  "petugas administrasi": "Operator Layanan Operasional",
  "petugas customer relation": "Operator Layanan Operasional",
  "petugas gizi": "Operator Layanan Kesehatan",
  "petugas instalasi penunjang medik": "Operator Layanan Operasional",
  "petugas instalasi penunjang non medik": "Operator Layanan Operasional",
  "petugas keamanan": "PJLP Keamanan",
  "petugas keamanan kantor": "PJLP Keamanan",
  "petugas pengamanan": "PJLP Keamanan",
  "petugas kebersihan": "PJLP Kebersihan",
  "petugas kebersihan kantor": "PJLP Kebersihan",
  "petugas kebesihan kantor": "PJLP Kebersihan",
  "petugas mekanical elektrik": "PJLP Lainnya",
  "petugas mekanikal elektrikal": "PJLP Lainnya",
  "petugas pelayanan umum": "Operator Layanan Operasional",
  "petugas pengemudi": "Operator Layanan Operasional",
  "petugas rumah tangga": "Operator Layanan Operasional",
  "petugas teknis": "Operator Layanan Operasional",
  "petugas pemulasaran jenazah": "Operator Layanan Kesehatan",
  "petugas keperawatan": "Operator Layanan Kesehatan",
  "petugas cssd": "Operator Layanan Kesehatan",
  "petugas farmasi": "Operator Layanan Kesehatan",
  "petugas penunjang khusus": "Operator Layanan Kesehatan",
  "petugas pengiriman": "PJLP Lainnya",
  "petugas teknisi listrik dan mekanik": "PJLP Lainnya",
  "pjlp pasukan putih": "PJLP Lainnya",
  "pjlp pengemudi ambulan": "PJLP Lainnya",
  "pranata barang dan jasa": "Pranata Laksana Barang Terampil",
  "pranata kearsipan": "Arsiparis Terampil",
  "pranata komputer": "Pranata Komputer Terampil",
  "pranata komputer pertama": "Pranata Komputer Ahli Pertama",
  "pranata laboratoirum kesehatan terampil": "Pranata Laboratorium Kesehatan Terampil",
  "pranata laboratoium pertama": "Pranata Laboratorium Kesehatan Ahli Pertama",
  "pranata laboratorium kesehatan pertama": "Pranata Laboratorium Kesehatan Ahli Pertama",
  "pranata laboratorium kesehatan penyelia": "Pranata Laboratorium Kesehatan Mahir",
  "pranata laboratorium kesehatan terampil": "Pranata Laboratorium Kesehatan Terampil",
  "pranata laboratorium terampil": "Pranata Laboratorium Kesehatan Terampil",
  "pranata laboraturium kesehatan pelaksana mahir": "Pranata Laboratorium Kesehatan Mahir",
  "pranata laboratoriun terampil": "Pranata Laboratorium Kesehatan Terampil",
  "pranata labiratorium terampil": "Pranata Laboratorium Kesehatan Terampil",
  "pranata sdm tingkat terampil": "Pranata SDM Aparatur Terampil",
  "pranata sumber daya manusia aparatur penyelia": "Pranata SDM Aparatur Penyelia",
  "promkes ahli pertama": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Pertama",
  "promosi kesehatan dan ilmu prilaku ahli muda": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Muda",
  "promosi kesehatan dan ilmu prilaku ahli pertama": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Pertama",
  "promosi kesehatan dan ilmu prilaku mahir": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Mahir",
  "promosi kesehatan dan ilmu prilaku penyelia": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Penyelia",
  "promosi kesehatan dan ilmu prilaku terampil": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Terampil",
  "promosi kesehatan dan ilmu perilaku ahli ahli pertama": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Pertama",
  "promosi kesehatan dan ilmu perilaku ahli mudasya": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Muda",
  "promosi kesehatan dan ilmu perilaku pertama": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Pertama",
  "psikolog ahli klinis muda": "Psikolog Klinis Ahli Muda",
  "psikolog ahli pertama": "Psikolog Klinis Ahli Pertama",
  "psikolog pertama": "Psikolog Klinis Ahli Pertama",
  "psikologi klinis": "Psikolog Klinis Ahli Pertama",
  "radiografer": "Radiografer Terampil",
  "radiografer muda": "Radiografer Ahli Muda",
  "radiografer pelaksana": "Radiografer Terampil",
  "radioterapis terampil": "Radiografer Terampil",
  "sanitarian muda": "Tenaga Sanitasi Lingkungan Ahli Muda",
  "sanitarian pertama": "Tenaga Sanitasi Lingkungan Ahli Pertama",
  "sanitarian terampil": "Tenaga Sanitasi Lingkungan Terampil",
  "sanitasi ahli pertama": "Tenaga Sanitasi Lingkungan Ahli Pertama",
  "sanitasi lingkungan pertama": "Tenaga Sanitasi Lingkungan Ahli Pertama",
  "sanitasi lingkungan terampil": "Tenaga Sanitasi Lingkungan Terampil",
  "satpam": "PJLP Keamanan",
  "satuan pelaksana penunjang medik": "Jabatan Pelaksana Satuan",
  "satuan pelaksana perencanaan dan keuangan": "Jabatan Pelaksana Satuan",
  "satuan pelaksana umum dan kepegawaian": "Jabatan Pelaksana Satuan",
  "sekretaris": "",
  "site office manager": "Operator Layanan Operasional",
  "staf": "Operator Layanan Operasional",
  "staf administrasi tingkat terampil": "Pengadministrasi Perkantoran",
  "staf pelayanan tingkat ahli": "Operator Layanan Kesehatan",
  "staf teknis tingkat ahli": "Penata Kelola Layanan Kesehatan",
  "staf teknis tingkat terampil": "Pengolah Data dan Informasi",
  "tehnisi elektromedik mahir": "Teknisi Elektromedis Mahir",
  "tehnisi elektromedik terampil": "Teknisi Elektromedis Terampil",
  "teknik elektromedis terampil": "Teknisi Elektromedis Terampil",
  "teknis elektromedis terampil": "Teknisi Elektromedis Terampil",
  "teknis gigi dan mulut terampil": "Terapis Gigi dan Mulut Terampil",
  "tehnisi gigi terampil": "Teknisi Gigi Terampil",
  "tehnisi tranfusi darah mahir": "Teknisi Transfusi Darah Mahir",
  "teknisi transfusi darah pelaksana": "Teknisi Transfusi Darah Terampil",
  "teknisi transfusi darah terampil": "Teknisi Transfusi Darah Terampil",
  "tenaga promosi kesehatan dan ilmu perilaku pertama": "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Pertama",
  "tenaga sanitasi ahli pertama": "Tenaga Sanitasi Lingkungan Ahli Pertama",
  "tenaga sanitasi lingkungan ahli ahli pertama": "Tenaga Sanitasi Lingkungan Ahli Pertama",
  "tenaga sanitasi lingkungan ahli terampil": "Tenaga Sanitasi Lingkungan Terampil",
  "tenaga sanitasi lingkungan madya": "Tenaga Sanitasi Lingkungan Ahli Madya",
  "tenaga sanitasi lingkungan pertama": "Tenaga Sanitasi Lingkungan Ahli Pertama",
  "tenaga sanitasi terampil": "Tenaga Sanitasi Lingkungan Terampil",
  "terampil - bidan": "Bidan Terampil",
  "terampil - perawat": "Perawat Terampil",
  "terampil - pranata laboratorium kesehatan": "Pranata Laboratorium Kesehatan Terampil",
  "terampil - tenaga sanitasi lingkungan": "Tenaga Sanitasi Lingkungan Terampil",
  "terampil - terapis gigi dan mulut": "Terapis Gigi dan Mulut Terampil",
  "terapi wicara": "Terapis Wicara Terampil",
  "terapis gigi & mulut mahir": "Terapis Gigi dan Mulut Mahir",
  "terapis gigi & mulut penyelia": "Terapis Gigi dan Mulut Penyelia",
  "terapis gigi & mulut terampil": "Terapis Gigi dan Mulut Terampil",
  "terapis gigi dan mulut": "Terapis Gigi dan Mulut Terampil",
  "terapis gigi terampil": "Terapis Gigi dan Mulut Terampil",
  "verifikator": "Pengolah Data dan Informasi",
  "verifikator data laporan keuangan": "Pengolah Data dan Informasi",
  "verifikator keuangan": "Pengolah Data dan Informasi"
}));

function rankStandard(base, value) {
  const text = clean(value).toUpperCase();
  if (text.includes("UTAMA")) return `${base} Ahli Utama`;
  if (text.includes("MADYA")) return `${base} Ahli Madya`;
  if (text.includes("MUDA")) return `${base} Ahli Muda`;
  if (text.includes("PERTAMA")) return `${base} Ahli Pertama`;
  if (text.includes("PENYELIA")) return `${base} Penyelia`;
  if (text.includes("MAHIR")) return `${base} Mahir`;
  if (text.includes("TERAMPIL") || text.includes("PELAKSANA")) return `${base} Terampil`;
  return null;
}

function standardizeJabatan(value) {
  const raw = clean(value);
  if (!raw || raw === "-") return "Tidak Diketahui";
  const key = raw.toLowerCase();
  if (exactMap.has(key)) return exactMap.get(key) || "Tidak Diketahui";

  const noPembantu = raw.replace(/\s+Puskesmas Pembantu$/i, "");
  const noKepala = noPembantu.replace(/\s+\(Kepala Puskesmas\)$/i, "");
  const upper = noKepala.toUpperCase();

  if (/^ADMINISTRATOR KESEHATAN/.test(upper) || /^ADMINISTRASI KESEHATAN/.test(upper)) {
    return rankStandard("Administrator Kesehatan", upper) || "Administrator Kesehatan Ahli Pertama";
  }
  if (/^APOTEKER/.test(upper)) return rankStandard("Apoteker", upper) || "Apoteker Ahli Pertama";
  if (/^BIDAN/.test(upper)) return rankStandard("Bidan", upper) || "Bidan Terampil";
  if (/^DOKTER GIGI/.test(upper)) {
    const ranked = rankStandard("Dokter Gigi", upper) || "Dokter Gigi Ahli Pertama";
    return ranked.includes("(") ? ranked : `${ranked} (Umum)`;
  }
  if (/^DOKTER/.test(upper) || /^SPESIALIS/.test(upper)) {
    const specialist = upper.includes("SPESIALIS") || upper.startsWith("SPESIALIS");
    const ranked = rankStandard("Dokter", upper) || "Dokter Ahli Pertama";
    return `${ranked} ${specialist ? "(Spesialis/Subspesialis)" : "(Umum)"}`;
  }
  if (/^ENTOMOLOG/.test(upper)) return rankStandard("Entomolog Kesehatan", upper) || titleKnown(noKepala);
  if (/^EPIDEMIOLOG/.test(upper)) return rankStandard("Epidemiolog Kesehatan", upper) || titleKnown(noKepala);
  if (/^FISIKAWAN/.test(upper)) return rankStandard("Fisikawan Medis", upper) || titleKnown(noKepala);
  if (/^FISIOTERAPIS/.test(upper)) return rankStandard("Fisioterapis", upper) || titleKnown(noKepala);
  if (/^NUTRISIONIS/.test(upper)) return rankStandard("Nutrisionis", upper) || "Nutrisionis Terampil";
  if (/^PEREKAM MEDIS/.test(upper)) return rankStandard("Perekam Medis", upper) || "Perekam Medis Terampil";
  if (/^PERAWAT/.test(upper)) return rankStandard("Perawat", upper) || "Perawat Terampil";
  if (/^PRANATA KOMPUTER/.test(upper)) return rankStandard("Pranata Komputer", upper) || "Pranata Komputer Terampil";
  if (/^PRANATA LABORATORIUM/.test(upper)) return rankStandard("Pranata Laboratorium Kesehatan", upper) || "Pranata Laboratorium Kesehatan Terampil";
  if (/^PROMOSI KESEHATAN|^PROMKES/.test(upper)) return rankStandard("Tenaga Promosi Kesehatan dan Ilmu Perilaku", upper) || "Tenaga Promosi Kesehatan dan Ilmu Perilaku Ahli Pertama";
  if (/^PSIKOLOG|^PSIKOLOGI/.test(upper)) return rankStandard("Psikolog Klinis", upper) || "Psikolog Klinis Ahli Pertama";
  if (/^RADIOGRAFER/.test(upper)) return rankStandard("Radiografer", upper) || "Radiografer Terampil";
  if (/^SANITARIAN|^SANITASI/.test(upper)) return rankStandard("Tenaga Sanitasi Lingkungan", upper) || "Tenaga Sanitasi Lingkungan Terampil";
  if (/^TEKNISI ELEKTROMEDIS|^TEKNISI ELEKTROMEDIK/.test(upper)) return rankStandard("Teknisi Elektromedis", upper) || "Teknisi Elektromedis Terampil";
  if (/^TERAPIS GIGI/.test(upper)) return rankStandard("Terapis Gigi dan Mulut", upper) || "Terapis Gigi dan Mulut Terampil";
  if (/^TERAPIS WICARA/.test(upper)) return rankStandard("Terapis Wicara", upper) || "Terapis Wicara Terampil";

  if (/KEPALA SATUAN|KETUA SATUAN|KOORDINATOR SATUAN|SATUAN PELAKSANA|SATUAN PELAYANAN|PLT\. KOORDINATOR/.test(upper)) return "Jabatan Pelaksana Satuan";
  if (/PENGADMINISTRASI|ADMINISTRASI/.test(upper)) return "Pengadministrasi Perkantoran";
  if (/PENGELOLA|PENGOLAH/.test(upper)) return "Pengolah Data dan Informasi";
  if (/PJLP|PASUKAN PUTIH/.test(upper)) return "PJLP";

  return titleKnown(noKepala);
}

const pegawai = JSON.parse(fs.readFileSync(pegawaiPath, "utf8"));
let changed = 0;
const counts = {};

const updated = pegawai.map((item) => {
  const raw = item.nama_jabatan_menpan_raw || item.nama_jabatan_menpan;
  const normalized = standardizeJabatan(raw);
  if (normalized !== item.nama_jabatan_menpan) changed += 1;
  counts[normalized] = (counts[normalized] || 0) + 1;
  return {
    ...item,
    nama_jabatan_menpan: normalized,
    nama_jabatan_menpan_raw: raw
  };
});

fs.writeFileSync(pegawaiPath, JSON.stringify(updated));
fs.writeFileSync(path.resolve("src/data/generated/jabatan-menpan-summary.json"), JSON.stringify({
  normalized_at: new Date().toISOString(),
  total_rows: updated.length,
  changed_rows: changed,
  total_standard_values: Object.keys(counts).length,
  counts
}, null, 2));

console.log(`Changed rows: ${changed}`);
console.log(`Standard jabatan count: ${Object.keys(counts).length}`);
