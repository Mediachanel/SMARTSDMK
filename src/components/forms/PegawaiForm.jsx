"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Plus,
  Save,
  SkipForward,
  Upload,
  Trash2
} from "lucide-react";
import MultiStepForm from "@/components/forms/MultiStepForm";
import Stepper from "@/components/forms/Stepper";
import FormSection from "@/components/forms/FormSection";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { JENIS_PEGAWAI_OPTIONS } from "@/lib/helpers/pegawaiStatus";
import {
  AGAMA_OPTIONS,
  JENIS_KONTRAK_OPTIONS,
  PANGKAT_GOLONGAN_OPTIONS,
  coercePegawaiReferenceValue
} from "@/lib/pegawaiReferenceOptions";
import { canonicalUkpd as normalizeUkpdKey } from "@/lib/ukpdNormalization";

const STATUS_PERKAWINAN_OPTIONS = ["Belum Kawin", "Kawin", "Cerai Hidup", "Cerai Mati"];
const JENIS_KELAMIN_OPTIONS = ["Perempuan", "Laki-laki"];
const KONDISI_OPTIONS = ["Aktif", "Cuti", "Tugas Belajar", "Tidak Aktif", "Resign", "Pensiun"];
const KONDISI_WAJIB_TANGGAL = new Set(["Tidak Aktif", "Resign", "Pensiun"]);
const HUBUNGAN_OPTIONS = ["pasangan", "anak"];
const JENIS_RIWAYAT_OPTIONS = ["formal", "non_formal"];
const JENIS_JABATAN_OPTIONS = ["struktural", "fungsional"];
const STATUS_PUNYA_OPTIONS = ["Ya", "Tidak"];
const STATUS_TUNJANGAN_OPTIONS = ["DAPAT", "TIDAK", ""];
const KATEGORI_PRESTASI_OPTIONS = ["formal", "non_formal"];
const PROFILE_PHOTO_MAX_BYTES = 1024 * 1024;
const PROFILE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

const labels = {
  nama: "Nama Lengkap",
  jenis_kelamin: "Jenis Kelamin",
  tempat_lahir: "Tempat Lahir",
  tanggal_lahir: "Tanggal Lahir",
  nik: "NIK",
  agama: "Agama",
  nama_ukpd: "UKPD",
  jenis_pegawai: "Jenis Pegawai",
  status_rumpun: "Rumpun Jabatan",
  jenis_kontrak: "Jenis Kontrak",
  nrk: "NRK",
  nip: "NIP",
  nama_jabatan_orb: "Jabatan Pergub 1 Tahun 2017",
  nama_jabatan_menpan: "Jabatan Kepmenpan 11",
  struktur_atasan_langsung: "Atasan Langsung",
  pangkat_golongan: "Pangkat / Golongan",
  tmt_pangkat_terakhir: "TMT Pangkat",
  jenjang_pendidikan: "Jenjang Pendidikan",
  program_studi: "Program Studi / Jurusan",
  nama_universitas: "Universitas / Institusi",
  no_hp_pegawai: "No. HP",
  email: "Email",
  no_bpjs: "No. BPJS",
  kondisi: "Kondisi",
  tanggal_kondisi: "Tanggal Efektif Kondisi",
  status_perkawinan: "Status Perkawinan",
  gelar_depan: "Gelar Depan",
  gelar_belakang: "Gelar Belakang",
  tmt_kerja_ukpd: "TMT Kerja UKPD",
  jalan: "Jalan / Detail Alamat",
  kelurahan: "Kelurahan / Desa",
  kecamatan: "Kecamatan",
  kota_kabupaten: "Kabupaten / Kota",
  provinsi: "Provinsi",
  hubungan: "Hubungan",
  hubungan_detail: "Detail Hubungan",
  status_punya: "Status Punya",
  status_tunjangan: "Status Tunjangan",
  urutan: "Urutan",
  nama_institusi: "Institusi",
  kota_institusi: "Kota Institusi",
  tahun_lulus: "Tahun Lulus",
  nomor_ijazah: "Nomor Ijazah",
  tanggal_ijazah: "Tanggal Ijazah",
  jenis_riwayat: "Jenis Riwayat",
  jenis_jabatan: "Jenis Jabatan",
  lokasi: "Lokasi",
  eselon: "Eselon",
  tmt_jabatan: "TMT Jabatan",
  nomor_sk: "Nomor SK",
  tanggal_sk: "Tanggal SK",
  keterangan: "Keterangan",
  tmt_gaji: "TMT Gaji",
  gaji_pokok: "Gaji Pokok",
  tmt_pangkat: "TMT Pangkat",
  nama_penghargaan: "Nama Penghargaan",
  asal_penghargaan: "Asal Penghargaan",
  tahun: "Tahun",
  nilai_skp: "Nilai SKP",
  nilai_perilaku: "Nilai Perilaku",
  nilai_prestasi: "Nilai Prestasi",
  keterangan_prestasi: "Keterangan Prestasi",
  tanggal_mulai: "Tanggal Mulai",
  tanggal_akhir: "Tanggal Akhir",
  hukuman_disiplin: "Hukuman Disiplin",
  kategori: "Kategori",
  prestasi: "Prestasi",
  kegiatan: "Kegiatan",
  judul_materi: "Judul Materi",
  lembaga_penyelenggara: "Lembaga Penyelenggara",
  tahun_anggaran: "Tahun Anggaran",
  jumlah_anggaran: "Jumlah Anggaran",
  kedudukan_dalam_kegiatan: "Kedudukan Dalam Kegiatan",
  jabatan: "Jabatan",
  keberhasilan: "Keberhasilan",
  kendala_yang_dihadapi: "Kendala yang Dihadapi",
  solusi_yang_dilakukan: "Solusi yang Dilakukan",
  pekerjaan: "Pekerjaan",
  no_tlp: "No. Telepon"
};

const placeholders = {
  nama: "Contoh: Seftian Haryadi",
  gelar_depan: "Contoh: dr.",
  gelar_belakang: "Contoh: S.K.M",
  tempat_lahir: "Contoh: Jakarta",
  nik: "16 digit tanpa spasi",
  agama: "Contoh: Islam",
  jenis_kontrak: "Isi jika berlaku untuk jenis pegawai tertentu",
  nrk: "Contoh: 184198",
  nip: "18 digit NIP",
  struktur_atasan_langsung: "Contoh: Kepala Puskesmas",
  program_studi: "Contoh: Kesehatan Masyarakat",
  nama_universitas: "Contoh: Universitas Indonesia",
  no_hp_pegawai: "Angka saja, contoh 081234567890",
  email: "Contoh: nama@dinkes.go.id",
  no_bpjs: "Nomor BPJS bila ada",
  tanggal_kondisi: "Tanggal mulai kondisi berlaku",
  jalan: "Contoh: Jl. Raya Cipayung No. 12 RT 01 RW 03",
  hubungan_detail: "Contoh: Anak ke-1",
  tahun_lulus: "Contoh: 2020",
  nomor_ijazah: "Nomor ijazah / sertifikat",
  nomor_sk: "Nomor surat keputusan",
  gaji_pokok: "Contoh: 4500000",
  nama_penghargaan: "Contoh: Satyalancana Karya Satya",
  asal_penghargaan: "Contoh: Presiden RI",
  prestasi: "Jelaskan prestasi atau capaian",
  kegiatan: "Nama kegiatan",
  judul_materi: "Judul materi yang dibawakan",
  lembaga_penyelenggara: "Instansi penyelenggara",
  kedudukan_dalam_kegiatan: "Contoh: Ketua Tim",
  keberhasilan: "Capaian utama",
  kendala_yang_dihadapi: "Kendala yang ditemui",
  solusi_yang_dilakukan: "Solusi atau tindak lanjut"
};

const helperTexts = {
  nama_ukpd: "Pilih UKPD resmi agar sinkron dengan filter wilayah dan laporan.",
  status_rumpun: "Bersumber dari Peta Jabatan dan diselaraskan dengan Jabatan ORB/Pergub.",
  nama_jabatan_orb: "Pilih jabatan dari Peta Jabatan sesuai UKPD pegawai.",
  struktur_atasan_langsung: "Bersumber dari Peta Jabatan dan diselaraskan dengan Jabatan ORB/Pergub.",
  nama_jabatan_menpan: "Bersumber dari Peta Jabatan sesuai UKPD dan Jabatan ORB/Pergub.",
  pangkat_golongan: "Gunakan daftar pangkat/golongan resmi yang sudah dibatasi.",
  jenjang_pendidikan: "Sudah termasuk D4 dan PROFESI sesuai kebutuhan terbaru.",
  no_hp_pegawai: "Nomor harus angka saja agar mudah divalidasi dan dipakai kontak.",
  tanggal_kondisi: "Wajib diisi untuk mengetahui sejak kapan pegawai Tidak Aktif, Resign, atau Pensiun.",
  alamat: "Gunakan referensi wilayah resmi Kemendagri sampai level kelurahan/desa."
};

const stepConfig = [
  {
    id: "identitas",
    title: "Identitas Pribadi",
    description: "Data dasar pegawai yang paling sering dipakai untuk pencarian dan profil.",
    fields: ["nama", "gelar_depan", "gelar_belakang", "jenis_kelamin", "tempat_lahir", "tanggal_lahir", "nik", "agama"]
  },
  {
    id: "kepegawaian",
    title: "Data Kepegawaian",
    description: "Informasi status kerja, UKPD, dan identitas kepegawaian aktif.",
    fields: ["nama_ukpd", "jenis_pegawai", "jenis_kontrak", "nrk", "nip", "kondisi", "tanggal_kondisi", "tmt_kerja_ukpd"]
  },
  {
    id: "jabatan",
    title: "Jabatan",
    description: "Posisi saat ini. Pangkat terakhir diambil otomatis dari Riwayat Pangkat.",
    fields: ["nama_jabatan_orb", "nama_jabatan_menpan", "status_rumpun", "struktur_atasan_langsung"]
  },
  {
    id: "pendidikan",
    title: "Kontak",
    description: "Pendidikan dikelola lengkap melalui Riwayat Pendidikan; bagian ini berisi kanal komunikasi utama pegawai.",
    fields: ["no_hp_pegawai", "email", "no_bpjs", "status_perkawinan"]
  },
  {
    id: "alamat",
    title: "Alamat",
    description: "Alamat domisili dan KTP menggunakan referensi wilayah resmi Kemendagri.",
    fields: [
      "alamat.domisili.jalan",
      "alamat.domisili.kode_provinsi",
      "alamat.domisili.kode_kota_kab",
      "alamat.domisili.kode_kecamatan",
      "alamat.domisili.kode_kelurahan",
      "alamat.ktp.jalan",
      "alamat.ktp.kode_provinsi",
      "alamat.ktp.kode_kota_kab",
      "alamat.ktp.kode_kecamatan",
      "alamat.ktp.kode_kelurahan"
    ]
  },
  {
    id: "riwayat",
    title: "Riwayat Opsional",
    description: "Tambahkan bila dibutuhkan. Semua panel default tertutup agar form tetap ringan.",
    optional: true,
    fields: []
  }
];

const repeatableSections = [
  {
    key: "keluarga",
    title: "Data Keluarga",
    description: "Tambahkan pasangan atau anak bila perlu.",
    addLabel: "Tambah Anggota Keluarga",
    fields: ["hubungan", "hubungan_detail", "status_punya", "status_tunjangan", "urutan", "nama", "jenis_kelamin", "tempat_lahir", "tanggal_lahir", "no_tlp", "email", "pekerjaan"]
  },
  {
    key: "riwayat_pendidikan",
    title: "Riwayat Pendidikan (Sumber Pendidikan Aktif)",
    description: "Isi seluruh pendidikan formal dari SD sampai terakhir dan seluruh pendidikan nonformal/pelatihan. Pendidikan formal terbaru otomatis tampil pada profil dan laporan.",
    addLabel: "Tambah Riwayat Pendidikan",
    fields: ["jenis_riwayat", "jenjang_pendidikan", "program_studi", "nama_institusi", "nama_universitas", "kota_institusi", "tahun_lulus", "nomor_ijazah", "tanggal_ijazah", "keterangan"]
  },
  {
    key: "riwayat_jabatan",
    title: "Riwayat Jabatan",
    description: "Jejak perubahan jabatan dan unit kerja.",
    addLabel: "Tambah Riwayat Jabatan",
    fields: ["jenis_jabatan", "lokasi", "nama_jabatan_orb", "nama_jabatan_menpan", "status_rumpun", "struktur_atasan_langsung", "nama_ukpd", "wilayah", "jenis_pegawai", "pangkat_golongan", "eselon", "tmt_jabatan", "nomor_sk", "tanggal_sk", "keterangan"]
  },
  {
    key: "riwayat_gaji_pokok",
    title: "Riwayat Gaji Pokok",
    description: "Dipakai untuk arsip dan audit administratif.",
    addLabel: "Tambah Riwayat Gaji",
    fields: ["tmt_gaji", "pangkat_golongan", "gaji_pokok", "nomor_sk", "tanggal_sk", "keterangan"]
  },
  {
    key: "riwayat_pangkat",
    title: "Riwayat Pangkat (Sumber Pangkat Aktif)",
    description: "Tambahkan pangkat baru di sini. Pangkat dengan TMT terbaru otomatis tampil pada profil, daftar pegawai, dan DUK.",
    addLabel: "Tambah Riwayat Pangkat",
    fields: ["pangkat_golongan", "tmt_pangkat", "lokasi", "nomor_sk", "tanggal_sk", "keterangan"]
  },
  {
    key: "riwayat_penghargaan",
    title: "Riwayat Penghargaan",
    description: "Penghargaan resmi yang relevan dengan profil pegawai.",
    addLabel: "Tambah Penghargaan",
    fields: ["nama_penghargaan", "asal_penghargaan", "nomor_sk", "tanggal_sk", "keterangan"]
  },
  {
    key: "riwayat_skp",
    title: "Riwayat SKP",
    description: "Nilai kinerja tahunan pegawai.",
    addLabel: "Tambah SKP",
    fields: ["tahun", "nilai_skp", "nilai_perilaku", "nilai_prestasi", "keterangan_prestasi", "keterangan"]
  },
  {
    key: "riwayat_hukuman_disiplin",
    title: "Riwayat Hukuman Disiplin",
    description: "Isi hanya bila ada catatan disiplin yang perlu ditampilkan.",
    addLabel: "Tambah Hukuman",
    fields: ["tanggal_mulai", "tanggal_akhir", "hukuman_disiplin", "nomor_sk", "tanggal_sk", "keterangan"]
  },
  {
    key: "riwayat_prestasi_pendidikan",
    title: "Prestasi Pendidikan",
    description: "Capaian yang terkait pendidikan formal atau non formal.",
    addLabel: "Tambah Prestasi Pendidikan",
    fields: ["kategori", "jenjang_pendidikan", "prestasi"]
  },
  {
    key: "riwayat_narasumber",
    title: "Pengalaman Narasumber",
    description: "Kegiatan narasumber atau pembicara.",
    addLabel: "Tambah Narasumber",
    fields: ["kegiatan", "judul_materi", "lembaga_penyelenggara"]
  },
  {
    key: "riwayat_kegiatan_strategis",
    title: "Kegiatan Strategis",
    description: "Kegiatan dengan peran strategis dan anggaran.",
    addLabel: "Tambah Kegiatan Strategis",
    fields: ["kegiatan", "tahun_anggaran", "jumlah_anggaran", "kedudukan_dalam_kegiatan"]
  },
  {
    key: "riwayat_keberhasilan",
    title: "Keberhasilan",
    description: "Capaian kerja penting beserta kendala dan solusi.",
    addLabel: "Tambah Keberhasilan",
    fields: ["jabatan", "tahun", "keberhasilan", "kendala_yang_dihadapi", "solusi_yang_dilakukan"]
  }
];

const defaultPegawai = {
  nama: "",
  jenis_kelamin: "Perempuan",
  tempat_lahir: "",
  tanggal_lahir: "",
  nik: "",
  agama: "",
  nama_ukpd: "",
  jenis_pegawai: "PNS",
  status_rumpun: "",
  jenis_kontrak: "",
  nrk: "",
  nip: "",
  nama_jabatan_orb: "",
  nama_jabatan_menpan: "",
  struktur_atasan_langsung: "",
  pangkat_golongan: "",
  tmt_pangkat_terakhir: "",
  jenjang_pendidikan: "",
  program_studi: "",
  nama_universitas: "",
  no_hp_pegawai: "",
  email: "",
  no_bpjs: "",
  kondisi: "Aktif",
  tanggal_kondisi: "",
  status_perkawinan: "Belum Kawin",
  gelar_depan: "",
  gelar_belakang: "",
  foto_profil_url: "",
  tmt_kerja_ukpd: ""
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const FORM_DATE_FIELDS = new Set([
  "tanggal_lahir",
  "tmt_pangkat_terakhir",
  "tmt_kerja_ukpd",
  "tanggal_ijazah",
  "tmt_jabatan",
  "tanggal_sk",
  "tmt_gaji",
  "tmt_pangkat",
  "tanggal_mulai",
  "tanggal_akhir"
]);

const MONTH_NUMBER_BY_NAME = {
  JAN: "01",
  JANUARI: "01",
  JANUARY: "01",
  FEB: "02",
  FEBRUARI: "02",
  FEBRUARY: "02",
  MAR: "03",
  MARET: "03",
  MARCH: "03",
  APR: "04",
  APRIL: "04",
  MEI: "05",
  MAY: "05",
  JUN: "06",
  JUNI: "06",
  JUNE: "06",
  JUL: "07",
  JULI: "07",
  JULY: "07",
  AGU: "08",
  AGUSTUS: "08",
  AUG: "08",
  AUGUST: "08",
  SEP: "09",
  SEPT: "09",
  SEPTEMBER: "09",
  OKT: "10",
  OKTOBER: "10",
  OCT: "10",
  OCTOBER: "10",
  NOV: "11",
  NOVEMBER: "11",
  DES: "12",
  DESEMBER: "12",
  DEC: "12",
  DECEMBER: "12"
};

function defaultAlamat(tipe) {
  return {
    id: null,
    tipe,
    jalan: "",
    kelurahan: "",
    kecamatan: "",
    kota_kabupaten: "",
    provinsi: "",
    kode_provinsi: "",
    kode_kota_kab: "",
    kode_kecamatan: "",
    kode_kelurahan: ""
  };
}

function normalizeYear(yearValue) {
  const year = Number(yearValue);
  if (!Number.isFinite(year)) return "";
  if (yearValue.length === 2) return String(year >= 50 ? 1900 + year : 2000 + year);
  return String(year).padStart(4, "0");
}

function isValidDateParts(year, month, day) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  if (!numericYear || numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > 31) return false;
  const date = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  return date.getUTCFullYear() === numericYear && date.getUTCMonth() === numericMonth - 1 && date.getUTCDate() === numericDay;
}

function toInputDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  const text = normalizeText(value);
  if (!text) return "";

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const [, year, rawMonth, rawDay] = iso;
    const month = rawMonth.padStart(2, "0");
    const day = rawDay.padStart(2, "0");
    return isValidDateParts(year, month, day) ? `${year}-${month}-${day}` : text;
  }

  const numeric = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (numeric) {
    const [, rawDay, rawMonth, rawYear] = numeric;
    const year = normalizeYear(rawYear);
    const month = rawMonth.padStart(2, "0");
    const day = rawDay.padStart(2, "0");
    return isValidDateParts(year, month, day) ? `${year}-${month}-${day}` : text;
  }

  const named = text.match(/^(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{2,4})$/);
  if (named) {
    const [, rawDay, rawMonthName, rawYear] = named;
    const month = MONTH_NUMBER_BY_NAME[rawMonthName.toUpperCase()];
    const year = normalizeYear(rawYear);
    const day = rawDay.padStart(2, "0");
    return month && isValidDateParts(year, month, day) ? `${year}-${month}-${day}` : text;
  }

  return text;
}

function normalizeFormValue(key, value) {
  if (FORM_DATE_FIELDS.has(key)) return toInputDate(value);
  if (["agama", "jenis_kontrak", "pangkat_golongan"].includes(key)) {
    return coercePegawaiReferenceValue(key, value);
  }
  return value ?? "";
}

function normalizeObjectForForm(source = {}) {
  return Object.fromEntries(
    Object.entries(source || {}).map(([key, value]) => [key, normalizeFormValue(key, value)])
  );
}

function isLikelyMisplacedName(value) {
  const text = normalizeText(value);
  if (!text || /[.,]/.test(text)) return false;
  const titleTokens = new Set(["A", "AMD", "APT", "DR", "DRG", "FARM", "KEB", "KEP", "KES", "KOM", "MARS", "MD", "NERS", "NS", "S", "SKM", "SP"]);
  const normalizedWords = text.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (normalizedWords.some((word) => titleTokens.has(word))) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 6 && words.every((word) => /^[A-Za-z'`-]+$/.test(word));
}

const FRONT_TITLE_PATTERN = /^\s*(drg|dr|apt|ns)\.\s*/i;
const FRONT_TITLE_KEYS = new Set(["dr", "drg", "apt", "ns"]);

function normalizeFrontTitle(value) {
  const key = String(value || "").replace(/[^a-z]/gi, "").toLowerCase();
  if (key === "dr") return "dr.";
  if (key === "drg") return "drg.";
  if (key === "apt") return "Apt.";
  if (key === "ns") return "Ns.";
  return normalizeText(value);
}

function splitLeadingFrontTitles(value) {
  const original = normalizeText(value);
  let remaining = original;
  const titles = [];

  while (remaining) {
    const match = remaining.match(FRONT_TITLE_PATTERN);
    if (!match) break;
    titles.push(normalizeFrontTitle(match[1]));
    remaining = remaining.slice(match[0].length).trim();
  }

  const tokens = remaining.split(/\s+/).filter(Boolean);
  while (tokens.length) {
    const key = tokens[0].replace(/[^a-z]/gi, "").toLowerCase();
    if (!FRONT_TITLE_KEYS.has(key)) break;
    titles.push(normalizeFrontTitle(tokens[0]));
    tokens.shift();
    remaining = tokens.join(" ");
  }

  return {
    gelar_depan: titles.join(", "),
    nama: normalizeText(remaining) || original,
  };
}

function createEmptyEntry(sectionKey) {
  const defaults = {
    keluarga: {
      id: null,
      hubungan: "pasangan",
      hubungan_detail: "",
      status_punya: "Ya",
      status_tunjangan: "",
      urutan: "",
      nama: "",
      jenis_kelamin: "Perempuan",
      tempat_lahir: "",
      tanggal_lahir: "",
      no_tlp: "",
      email: "",
      pekerjaan: ""
    },
    riwayat_pendidikan: {
      id: null,
      jenis_riwayat: "formal",
      jenjang_pendidikan: "",
      program_studi: "",
      nama_institusi: "",
      nama_universitas: "",
      kota_institusi: "",
      tahun_lulus: "",
      nomor_ijazah: "",
      tanggal_ijazah: "",
      keterangan: ""
    },
    riwayat_jabatan: {
      id: null,
      jenis_jabatan: "struktural",
      lokasi: "",
      nama_jabatan_orb: "",
      nama_jabatan_menpan: "",
      struktur_atasan_langsung: "",
      nama_ukpd: "",
      wilayah: "",
      jenis_pegawai: "",
      status_rumpun: "",
      pangkat_golongan: "",
      eselon: "",
      tmt_jabatan: "",
      nomor_sk: "",
      tanggal_sk: "",
      keterangan: ""
    },
    riwayat_gaji_pokok: { id: null, tmt_gaji: "", pangkat_golongan: "", gaji_pokok: "", nomor_sk: "", tanggal_sk: "", keterangan: "" },
    riwayat_pangkat: { id: null, pangkat_golongan: "", tmt_pangkat: "", lokasi: "", nomor_sk: "", tanggal_sk: "", keterangan: "" },
    riwayat_penghargaan: { id: null, nama_penghargaan: "", asal_penghargaan: "", nomor_sk: "", tanggal_sk: "", keterangan: "" },
    riwayat_skp: { id: null, tahun: "", nilai_skp: "", nilai_perilaku: "", nilai_prestasi: "", keterangan_prestasi: "", keterangan: "" },
    riwayat_hukuman_disiplin: { id: null, tanggal_mulai: "", tanggal_akhir: "", hukuman_disiplin: "", nomor_sk: "", tanggal_sk: "", keterangan: "" },
    riwayat_prestasi_pendidikan: { id: null, kategori: "formal", jenjang_pendidikan: "", prestasi: "" },
    riwayat_narasumber: { id: null, kegiatan: "", judul_materi: "", lembaga_penyelenggara: "" },
    riwayat_kegiatan_strategis: { id: null, kegiatan: "", tahun_anggaran: "", jumlah_anggaran: "", kedudukan_dalam_kegiatan: "" },
    riwayat_keberhasilan: { id: null, jabatan: "", tahun: "", keberhasilan: "", kendala_yang_dihadapi: "", solusi_yang_dilakukan: "" }
  };
  return defaults[sectionKey] ? { ...defaults[sectionKey] } : { id: null };
}

function deriveKeluarga(initialData = {}) {
  if (Array.isArray(initialData.keluarga) && initialData.keluarga.length) {
    return initialData.keluarga.map((item, index) => ({
      ...createEmptyEntry("keluarga"),
      ...normalizeObjectForForm(item),
      urutan: item.urutan || (String(item.hubungan).toLowerCase() === "anak" ? index + 1 : "")
    }));
  }
  return [];
}

function buildInitialForm(initialData = {}) {
  const normalizedInitialData = normalizeObjectForForm(initialData);
  const splitNameTitle = splitLeadingFrontTitles(normalizedInitialData.nama);
  if (splitNameTitle.gelar_depan) {
    normalizedInitialData.nama = splitNameTitle.nama;
    normalizedInitialData.gelar_depan = normalizedInitialData.gelar_depan || splitNameTitle.gelar_depan;
  }

  const fallbackName = normalizeText(normalizedInitialData.nama || normalizedInitialData.nama_pegawai || normalizedInitialData.nama_lengkap);
  if (!fallbackName && isLikelyMisplacedName(normalizedInitialData.gelar_belakang)) {
    normalizedInitialData.nama = normalizedInitialData.gelar_belakang;
    normalizedInitialData.gelar_belakang = "";
  } else {
    normalizedInitialData.nama = fallbackName;
  }

  const alamat = initialData.alamat || {};
  const base = {
    ...defaultPegawai,
    ...normalizedInitialData,
    alamat: {
      domisili: { ...defaultAlamat("domisili"), ...normalizeObjectForForm(alamat.domisili || {}) },
      ktp: { ...defaultAlamat("ktp"), ...normalizeObjectForForm(alamat.ktp || {}) }
    }
  };

  for (const section of repeatableSections) {
    base[section.key] = section.key === "keluarga"
      ? deriveKeluarga(initialData)
      : Array.isArray(initialData[section.key])
        ? initialData[section.key].map((item) => ({ ...createEmptyEntry(section.key), ...normalizeObjectForForm(item) }))
        : [];
  }

  if (
    initialData.id_pegawai &&
    !base.riwayat_pangkat.length &&
    (normalizedInitialData.pangkat_golongan || normalizedInitialData.tmt_pangkat_terakhir)
  ) {
    base.riwayat_pangkat = [{
      ...createEmptyEntry("riwayat_pangkat"),
      pangkat_golongan: normalizedInitialData.pangkat_golongan || "",
      tmt_pangkat: normalizedInitialData.tmt_pangkat_terakhir || "",
      keterangan: "Migrasi dari data pangkat utama"
    }];
  }

  if (
    initialData.id_pegawai &&
    !base.riwayat_pendidikan.length &&
    (normalizedInitialData.jenjang_pendidikan || normalizedInitialData.program_studi || normalizedInitialData.nama_universitas)
  ) {
    base.riwayat_pendidikan = [{
      ...createEmptyEntry("riwayat_pendidikan"),
      jenis_riwayat: "formal",
      jenjang_pendidikan: normalizedInitialData.jenjang_pendidikan || "",
      program_studi: normalizedInitialData.program_studi || "",
      nama_institusi: normalizedInitialData.nama_universitas || "",
      nama_universitas: normalizedInitialData.nama_universitas || "",
      keterangan: "Migrasi dari data pendidikan utama"
    }];
  }

  return base;
}

function inputTypeFor(name) {
  if (name.includes("tanggal") || name.startsWith("tmt")) return "date";
  if (["email"].includes(name)) return "email";
  if (["gaji_pokok", "nilai_skp", "nilai_perilaku", "nilai_prestasi", "jumlah_anggaran", "urutan", "tahun", "tahun_lulus", "tahun_anggaran"].includes(name)) return "number";
  return "text";
}

function isTextareaField(name) {
  return ["keterangan", "prestasi", "judul_materi", "kedudukan_dalam_kegiatan", "keberhasilan", "kendala_yang_dihadapi", "solusi_yang_dilakukan", "keterangan_prestasi"].includes(name);
}

function staticOptionsFor(name) {
  return {
    agama: AGAMA_OPTIONS,
    jenis_kelamin: JENIS_KELAMIN_OPTIONS,
    jenis_pegawai: [...new Set([...JENIS_PEGAWAI_OPTIONS, "PJLP"])],
    jenis_kontrak: JENIS_KONTRAK_OPTIONS,
    kondisi: KONDISI_OPTIONS,
    status_perkawinan: STATUS_PERKAWINAN_OPTIONS,
    hubungan: HUBUNGAN_OPTIONS,
    jenis_riwayat: JENIS_RIWAYAT_OPTIONS,
    jenis_jabatan: JENIS_JABATAN_OPTIONS,
    pangkat_golongan: PANGKAT_GOLONGAN_OPTIONS,
    status_punya: STATUS_PUNYA_OPTIONS,
    status_tunjangan: STATUS_TUNJANGAN_OPTIONS,
    kategori: KATEGORI_PRESTASI_OPTIONS
  }[name] || [];
}

function referenceOptionsFor(name, referenceOptions) {
  return {
    nama_ukpd: referenceOptions.ukpdOptions || [],
    status_rumpun: referenceOptions.statusRumpunOptions || [],
    jenjang_pendidikan: referenceOptions.pendidikanOptions || [],
    nama_jabatan_menpan: referenceOptions.jabatanStandarOptions || referenceOptions.jabatanMenpanOptions || [],
    nama_jabatan_orb: referenceOptions.jabatanOrbOptions || [],
    struktur_atasan_langsung: referenceOptions.atasanLangsungOptions || []
  }[name] || [];
}

function allOptionsFor(name, referenceOptions) {
  return staticOptionsFor(name).length ? staticOptionsFor(name) : referenceOptionsFor(name, referenceOptions);
}

function repeatableOptionsFor(sectionKey, fieldName, referenceOptions) {
  if (sectionKey.startsWith("riwayat_") && fieldName === "pangkat_golongan") {
    return [];
  }
  return allOptionsFor(fieldName, referenceOptions);
}

function parseDate(value) {
  if (!value) return true;
  return !Number.isNaN(Date.parse(value));
}

const dateField = (labelText, required = false) => {
  let schema = yup.string().test("valid-date", `${labelText} harus berupa tanggal yang valid.`, (value) => parseDate(value));
  if (required) schema = schema.required(`${labelText} wajib diisi.`);
  return schema;
};

const selectField = (labelText, options, required = false) => {
  let schema = yup.string().nullable().test(
    "valid-option",
    `${labelText} harus dipilih dari daftar yang tersedia.`,
    (value) => {
      const normalizedValue = normalizeText(value).toUpperCase();
      if (!normalizedValue) return true;
      const normalizedOptions = new Set((options || []).map((item) => normalizeText(item).toUpperCase()).filter(Boolean));
      return normalizedOptions.has(normalizedValue);
    }
  );
  if (required) schema = schema.required(`${labelText} wajib diisi.`);
  return schema;
};

const baseSchema = yup.object({
  nama: yup.string().trim().min(3, "Nama minimal 3 karakter.").required("Nama lengkap wajib diisi."),
  gelar_depan: yup.string().nullable(),
  gelar_belakang: yup.string().nullable(),
  jenis_kelamin: yup.string().required("Jenis kelamin wajib dipilih."),
  tempat_lahir: yup.string().trim().required("Tempat lahir wajib diisi."),
  tanggal_lahir: dateField("Tanggal lahir", true),
  nik: yup.string().trim().matches(/^\d{16}$/, { message: "NIK harus 16 digit angka.", excludeEmptyString: true }).nullable().transform((value) => value || ""),
  agama: selectField("Agama", AGAMA_OPTIONS, true),
  nama_ukpd: yup.string().trim().required("UKPD wajib dipilih."),
  jenis_pegawai: yup.string().trim().required("Jenis pegawai wajib dipilih."),
  status_rumpun: yup.string().trim().when("jenis_pegawai", {
    is: (value) => String(value || "").trim().toUpperCase() === "PJLP",
    then: (schema) => schema.nullable(),
    otherwise: (schema) => schema.required("Status rumpun wajib dipilih.")
  }),
  jenis_kontrak: selectField("Jenis kontrak", JENIS_KONTRAK_OPTIONS),
  nrk: yup.string().trim().matches(/^\d*$/, "NRK hanya boleh angka.").nullable(),
  nip: yup.string().trim().matches(/^\d*$/, "NIP hanya boleh angka.").nullable(),
  kondisi: yup.string().required("Kondisi wajib dipilih."),
  tanggal_kondisi: yup.string().when("kondisi", {
    is: (value) => KONDISI_WAJIB_TANGGAL.has(String(value || "").trim()),
    then: () => dateField("Tanggal efektif kondisi", true),
    otherwise: () => dateField("Tanggal efektif kondisi")
  }),
  tmt_kerja_ukpd: dateField("TMT kerja UKPD"),
  nama_jabatan_orb: yup.string().trim().when("jenis_pegawai", {
    is: (value) => String(value || "").trim().toUpperCase() === "PJLP",
    then: (schema) => schema.nullable(),
    otherwise: (schema) => schema.required("Jabatan Pergub 1 Tahun 2017 wajib dipilih.")
  }),
  nama_jabatan_menpan: yup.string().trim().when("jenis_pegawai", {
    is: (value) => String(value || "").trim().toUpperCase() === "PJLP",
    then: (schema) => schema.nullable(),
    otherwise: (schema) => schema.required("Jabatan Kepmenpan 11 wajib dipilih.")
  }),
  struktur_atasan_langsung: yup.string().nullable(),
  pangkat_golongan: yup.string().nullable(),
  tmt_pangkat_terakhir: yup.string().nullable(),
  jenjang_pendidikan: yup.string().nullable(),
  program_studi: yup.string().nullable(),
  nama_universitas: yup.string().nullable(),
  no_hp_pegawai: yup.string().trim().matches(/^\d{10,15}$/, { message: "No. HP harus 10-15 digit angka.", excludeEmptyString: true }).nullable().transform((value) => value || ""),
  email: yup.string().trim().email("Format email tidak valid.").nullable().transform((value) => value || ""),
  no_bpjs: yup.string().nullable(),
  status_perkawinan: yup.string().required("Status perkawinan wajib dipilih."),
  alamat: yup.object({
    domisili: yup.object({
      jalan: yup.string().nullable(),
      kode_provinsi: yup.string().nullable(),
      kode_kota_kab: yup.string().nullable(),
      kode_kecamatan: yup.string().nullable(),
      kode_kelurahan: yup.string().nullable()
    }),
    ktp: yup.object({
      jalan: yup.string().nullable(),
      kode_provinsi: yup.string().nullable(),
      kode_kota_kab: yup.string().nullable(),
      kode_kecamatan: yup.string().nullable(),
      kode_kelurahan: yup.string().nullable()
    })
  })
});

const overallSchema = baseSchema.shape({
  keluarga: yup.array().of(yup.object({
    nama: yup.string().nullable(),
    email: yup.string().trim().email("Format email keluarga tidak valid.").nullable().transform((value) => value || ""),
    tanggal_lahir: dateField("Tanggal lahir keluarga"),
    no_tlp: yup.string().trim().matches(/^\d*$/, { message: "No. telepon keluarga hanya boleh angka.", excludeEmptyString: true }).nullable().transform((value) => value || "")
  })),
  riwayat_pendidikan: yup.array().of(yup.object({})),
  riwayat_jabatan: yup.array().of(yup.object({})),
  riwayat_gaji_pokok: yup.array().of(yup.object({})),
  riwayat_pangkat: yup.array().of(yup.object({})),
  riwayat_penghargaan: yup.array().of(yup.object({})),
  riwayat_skp: yup.array().of(yup.object({})),
  riwayat_hukuman_disiplin: yup.array().of(yup.object({})),
  riwayat_prestasi_pendidikan: yup.array().of(yup.object({})),
  riwayat_narasumber: yup.array().of(yup.object({})),
  riwayat_kegiatan_strategis: yup.array().of(yup.object({})),
  riwayat_keberhasilan: yup.array().of(yup.object({}))
});

function getByPath(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current && key in current ? current[key] : undefined), object);
}

function firstErrorPath(errors, prefix = "") {
  if (!errors || typeof errors !== "object") return "";
  for (const [key, value] of Object.entries(errors)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (value?.message) return nextPath;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const nested = firstErrorPath(value[index], `${nextPath}.${index}`);
        if (nested) return nested;
      }
    }
    const nested = firstErrorPath(value, nextPath);
    if (nested) return nested;
  }
  return "";
}

function codeFieldForAddress(field) {
  return {
    provinsi: "kode_provinsi",
    kota_kabupaten: "kode_kota_kab",
    kecamatan: "kode_kecamatan",
    kelurahan: "kode_kelurahan"
  }[field];
}

function addressFieldOptions(addressOptions, tipe, field) {
  return addressOptions?.[tipe]?.[field] || [];
}

function fieldStepIndex(fieldPath) {
  if (!fieldPath) return 0;
  const mappings = [
    stepConfig[0].fields,
    stepConfig[1].fields,
    stepConfig[2].fields,
    stepConfig[3].fields,
    stepConfig[4].fields
  ];
  const match = mappings.findIndex((fields) => fields.some((field) => fieldPath === field || fieldPath.startsWith(`${field}.`) || fieldPath.startsWith(`${field}[`) || fieldPath.startsWith(field.replace("alamat.", "alamat."))));
  if (match >= 0) return match;
  return 5;
}

function normalizeApiErrors(errors) {
  if (!errors || typeof errors !== "object") return [];
  if (errors.fieldErrors && typeof errors.fieldErrors === "object") {
    return normalizeApiErrors(errors.fieldErrors);
  }
  return Object.entries(errors).flatMap(([field, messages]) =>
    (Array.isArray(messages) ? messages : [messages]).filter(Boolean).map((message) => ({
      field,
      message: String(message)
    }))
  );
}

function findAddressSelection(value, options) {
  const currentValue = normalizeText(value).toUpperCase();
  return options.find((item) => item.code === value || normalizeText(item.name).toUpperCase() === currentValue) || null;
}

function addressParam(values, field, codeField) {
  return normalizeText(values?.[codeField]) || normalizeText(values?.[field]);
}

function formatSavedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

function draftStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function StatusHint({ valid, error }) {
  if (error) {
    return (
      <div className="mt-2 flex items-start gap-2 text-sm text-rose-600">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  if (valid) {
    return (
      <div className="mt-2 flex items-start gap-2 text-sm text-emerald-600">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Valid</span>
      </div>
    );
  }
  return null;
}

function InputField({ name, register, error, touched, dirty, options = [], required = false, placeholder, helpText, type, disabled = false }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);
  const isValid = Boolean((touched || dirty) && !error);
  const fieldName = String(name).split(".").pop();
  const fieldLabel = labels[fieldName] || fieldName;
  const registered = register(name);
  const normalizedQuery = normalizeText(query).toUpperCase();
  const filteredOptions = options.length
    ? options
        .filter((option) => {
          if (!normalizedQuery) return true;
          return normalizeText(option).toUpperCase().includes(normalizedQuery);
        })
        .slice(0, 12)
    : [];
  const sharedClassName = [
    "input",
    error ? "border-rose-300 bg-rose-50/70 text-rose-900 focus:border-rose-400 focus:ring-rose-100" : "",
    isValid ? "border-emerald-300 bg-emerald-50/40 pr-10 focus:border-emerald-400 focus:ring-emerald-100" : ""
  ].join(" ");

  return (
    <label className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="label min-w-0 break-words">{fieldLabel}</span>
        {required ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">Wajib</span> : null}
      </div>
      <div className="relative min-w-0">
        {options.length ? (
          <>
            <input
              className={sharedClassName}
              placeholder={`Ketik untuk mencari ${String(fieldLabel).toLowerCase()}`}
              disabled={disabled}
              autoComplete="off"
              {...registered}
              ref={(element) => {
                registered.ref(element);
                inputRef.current = element;
              }}
              onFocus={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
                registered.onChange(event);
              }}
              onBlur={(event) => {
                const exactOption = options.find((option) => normalizeText(option).toUpperCase() === normalizeText(event.target.value).toUpperCase());
                if (exactOption && exactOption !== event.target.value) {
                  event.target.value = exactOption;
                  registered.onChange({ target: { name, value: exactOption }, type: "change" });
                }
                window.setTimeout(() => setIsOpen(false), 120);
                registered.onBlur(event);
              }}
            />
            {isOpen && !disabled && filteredOptions.length ? (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                {filteredOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-dinkes-50 hover:text-dinkes-800"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (inputRef.current) {
                        inputRef.current.value = option;
                        registered.onChange({ target: inputRef.current, type: "change" });
                      } else {
                        registered.onChange({ target: { name, value: option }, type: "change" });
                      }
                      setQuery(option);
                      setIsOpen(false);
                    }}
                  >
                    {option || "-"}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : isTextareaField(fieldName) ? (
          <textarea className={`${sharedClassName} min-h-28 resize-y`} placeholder={placeholder || `Masukkan ${String(fieldLabel).toLowerCase()}`} disabled={disabled} {...registered} />
        ) : (
          <input
            className={sharedClassName}
            type={type || inputTypeFor(fieldName)}
            step={["nilai_skp", "nilai_perilaku", "nilai_prestasi"].includes(fieldName) ? "0.01" : undefined}
            min={["nilai_skp", "nilai_perilaku", "nilai_prestasi"].includes(fieldName) ? "0" : undefined}
            max={["nilai_skp", "nilai_perilaku", "nilai_prestasi"].includes(fieldName) ? "100" : undefined}
            placeholder={placeholder || `Masukkan ${String(fieldLabel).toLowerCase()}`}
            disabled={disabled}
            {...registered}
          />
        )}
        {isValid ? <CheckCircle2 className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-emerald-600" /> : null}
      </div>
      {helpText && !error ? <p className="text-xs leading-5 text-slate-500">{helpText}</p> : null}
      <StatusHint valid={isValid} error={error?.message} />
    </label>
  );
}

function ProfilePhotoField({ currentUrl, previewUrl, selectedFile, error, onSelect }) {
  const imageUrl = previewUrl || currentUrl || "";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dinkes-100 bg-dinkes-50 text-dinkes-700">
          {imageUrl ? (
            <img src={imageUrl} alt="Preview foto profil pegawai" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-10 w-10" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="label">Foto Profil</div>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Format JPG, PNG, atau WEBP. Ukuran maksimal 1 MB. Foto akan diunggah setelah data pegawai disimpan.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dinkes-200 bg-white px-4 py-2 text-sm font-semibold text-dinkes-700 shadow-sm transition hover:bg-dinkes-50">
            <Upload className="h-4 w-4" />
            Pilih Foto
            <input type="file" accept={PROFILE_PHOTO_ACCEPT} className="sr-only" onChange={onSelect} />
          </label>
          {selectedFile ? (
            <div className="text-sm text-slate-600">
              Dipilih: <span className="font-semibold text-slate-900">{selectedFile.name}</span> ({formatBytes(selectedFile.size)})
            </div>
          ) : currentUrl ? (
            <div className="text-sm text-slate-500">Foto profil tersimpan.</div>
          ) : null}
          {error ? (
            <div className="flex items-start gap-2 text-sm text-rose-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AddressCard({
  title,
  tipe,
  register,
  errors,
  touchedFields,
  dirtyFields,
  addressOptions,
  values,
  onAddressChange
}) {
  const levels = [
    { key: "provinsi", label: "Provinsi" },
    { key: "kota_kabupaten", label: "Kabupaten / Kota" },
    { key: "kecamatan", label: "Kecamatan" },
    { key: "kelurahan", label: "Kelurahan / Desa" }
  ];

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <p className="mt-1 text-xs leading-5 text-slate-500">{helperTexts.alamat}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <InputField
          name={`alamat.${tipe}.jalan`}
          register={register}
          error={errors?.jalan}
          touched={Boolean(touchedFields?.jalan)}
          dirty={Boolean(dirtyFields?.jalan)}
          placeholder={placeholders.jalan}
        />
        {levels.map((level) => {
          const options = addressFieldOptions(addressOptions, tipe, level.key);
          const codeField = codeFieldForAddress(level.key);
          const selectedValue = values?.[codeField] || "";
          const selectedName = values?.[level.key] || "";
          const listId = `address-${tipe}-${level.key}`;
          const isValid = Boolean((touchedFields?.[codeField] || dirtyFields?.[codeField]) && !errors?.[codeField] && selectedValue);
          return (
            <label key={level.key} className="min-w-0 space-y-2">
              <span className="label">{level.label}</span>
              <div className="relative min-w-0">
                <input
                  className={[
                    "input",
                    errors?.[codeField] ? "border-rose-300 bg-rose-50/70 text-rose-900 focus:border-rose-400 focus:ring-rose-100" : "",
                    isValid ? "border-emerald-300 bg-emerald-50/40 pr-10 focus:border-emerald-400 focus:ring-emerald-100" : ""
                  ].join(" ")}
                  list={listId}
                  placeholder={`Ketik untuk mencari ${level.label.toLowerCase()}`}
                  key={`${tipe}-${level.key}-${selectedValue}-${selectedName}`}
                  defaultValue={selectedName}
                  onChange={(event) => {
                    const text = event.target.value;
                    const selected = options.find((option) => option.name === text || option.code === text);
                    if (!text || selected) onAddressChange(tipe, level.key, selected?.code || "");
                  }}
                />
                <datalist id={listId}>
                  {options.map((option) => (
                    <option key={option.code} value={option.name}>{option.code}</option>
                  ))}
                </datalist>
                {isValid ? <CheckCircle2 className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-emerald-600" /> : null}
              </div>
              <StatusHint valid={isValid} error={errors?.[codeField]?.message} />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function RepeatableAccordion({ section, control, register, formState, referenceOptions }) {
  const { fields, append, remove } = useFieldArray({ control, name: section.key });
  const sectionErrors = getByPath(formState.errors, section.key);
  const hasSectionError = Boolean(firstErrorPath(sectionErrors));
  const [open, setOpen] = useState(hasSectionError);

  useEffect(() => {
    if (hasSectionError) setOpen(true);
  }, [hasSectionError]);

  return (
    <div className={`min-w-0 rounded-2xl border bg-white ${hasSectionError ? "border-rose-300" : "border-slate-200"}`}>
      <button
        type="button"
        className="flex w-full flex-col gap-3 px-4 py-4 text-left sm:flex-row sm:items-start sm:justify-between"
        onClick={() => setOpen((current) => !current)}
      >
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">{section.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {hasSectionError ? (
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">Perlu diperbaiki</span>
          ) : null}
          <span className="rounded-full bg-dinkes-50 px-3 py-1 text-xs font-semibold text-dinkes-700">{fields.length} entri</span>
          {open ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
        </div>
      </button>

      {open ? (
        <div className="border-t border-slate-200 px-4 pb-4 pt-4">
          <div className="mb-4 flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" onClick={() => append(createEmptyEntry(section.key))}>
              <Plus className="h-4 w-4" />
              {section.addLabel}
            </button>
          </div>

          {fields.length ? (
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{section.title} #{index + 1}</p>
                      <p className="text-xs text-slate-500">Isi hanya data yang memang dibutuhkan.</p>
                    </div>
                    <button type="button" className="btn-secondary text-rose-700 hover:bg-rose-50" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4" />
                      Hapus
                    </button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {section.fields.map((fieldName) => {
                      const path = `${section.key}.${index}.${fieldName}`;
                      return (
                        <InputField
                          key={path}
                          name={path}
                          register={register}
                          options={repeatableOptionsFor(section.key, fieldName, referenceOptions)}
                          error={getByPath(formState.errors, path)}
                          touched={Boolean(getByPath(formState.touchedFields, path))}
                          dirty={Boolean(getByPath(formState.dirtyFields, path))}
                          placeholder={placeholders[fieldName]}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              Belum ada data {section.title.toLowerCase()}. Gunakan tombol tambah bila diperlukan.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function PegawaiForm({ initialData, mode = "create" }) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [banner, setBanner] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
  const [profilePhotoError, setProfilePhotoError] = useState("");
  const [referenceOptions, setReferenceOptions] = useState({
    pendidikanOptions: [],
    statusRumpunOptions: [],
    jabatanMenpanOptions: [],
    jabatanStandarOptions: [],
    jabatanOrbOptions: [],
    atasanLangsungOptions: [],
    petaJabatanOptions: [],
    petaUkpdTemplates: {},
    pangkatGolonganOptions: [],
    ukpdOptions: [],
    currentUser: null,
    defaultPegawai: {}
  });
  const [addressOptions, setAddressOptions] = useState({
    domisili: { provinsi: [], kota_kabupaten: [], kecamatan: [], kelurahan: [] },
    ktp: { provinsi: [], kota_kabupaten: [], kecamatan: [], kelurahan: [] }
  });
  const [isPending, startTransition] = useTransition();
  const saveTimerRef = useRef(null);

  const draftKey = useMemo(() => {
    const id = initialData?.id_pegawai ? `-${initialData.id_pegawai}` : "-new";
    return `pegawai-form-draft-${mode}${id}`;
  }, [initialData?.id_pegawai, mode]);

  const methods = useForm({
    resolver: yupResolver(overallSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: buildInitialForm(initialData)
  });

  const {
    register,
    handleSubmit,
    formState,
    reset,
    watch,
    trigger,
    setValue,
    getValues,
    setError,
    clearErrors
  } = methods;

  const alamatDomisili = watch("alamat.domisili");
  const alamatKtp = watch("alamat.ktp");
  const currentPhotoUrl = watch("foto_profil_url") || initialData?.foto_profil_url || "";
  const selectedUkpd = watch("nama_ukpd");
  const selectedJenisPegawai = watch("jenis_pegawai");
  const selectedKondisi = watch("kondisi");
  const isPjlp = String(selectedJenisPegawai || "").trim().toUpperCase() === "PJLP";
  const selectedJabatanOrb = watch("nama_jabatan_orb");
  const petaRowsForUkpd = useMemo(() => {
    const selectedUkpdKey = normalizeText(selectedUkpd).toUpperCase();
    const template = referenceOptions.petaUkpdTemplates?.[selectedUkpdKey];
    if (!template) return [];
    const ukpdKey = normalizeUkpdKey(selectedUkpd);
    return (referenceOptions.petaJabatanOptions || []).filter((item) => {
      if (item.template_ukpd !== template) return false;
      const sourceKey = normalizeUkpdKey(item.nama_ukpd_source);
      return !sourceKey || sourceKey === ukpdKey;
    });
  }, [referenceOptions.petaJabatanOptions, referenceOptions.petaUkpdTemplates, selectedUkpd]);
  const effectiveReferenceOptions = useMemo(() => {
    if (!normalizeText(selectedUkpd)) return referenceOptions;
    const unique = (field) => [...new Set(petaRowsForUkpd.map((item) => normalizeText(item[field])).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "id"));
    return {
      ...referenceOptions,
      jabatanOrbOptions: unique("nama_jabatan_orb"),
      statusRumpunOptions: unique("status_rumpun"),
      atasanLangsungOptions: unique("struktur_atasan_langsung"),
      jabatanMenpanOptions: unique("nama_jabatan_menpan"),
      jabatanStandarOptions: unique("nama_jabatan_menpan")
    };
  }, [petaRowsForUkpd, referenceOptions]);

  useEffect(() => {
    if (isPjlp || !selectedJabatanOrb || !petaRowsForUkpd.length) return;
    const match = petaRowsForUkpd.find((item) => normalizeText(item.nama_jabatan_orb).toUpperCase() === normalizeText(selectedJabatanOrb).toUpperCase());
    if (!match) return;
    if (normalizeText(match.nama_jabatan_orb) && normalizeText(match.nama_jabatan_orb) !== normalizeText(selectedJabatanOrb)) {
      setValue("nama_jabatan_orb", match.nama_jabatan_orb, { shouldDirty: true, shouldValidate: true });
    }
    setValue("nama_jabatan_menpan", match.nama_jabatan_menpan || "", { shouldDirty: true, shouldValidate: true });
    setValue("status_rumpun", match.status_rumpun || "", { shouldDirty: true, shouldValidate: true });
    setValue("struktur_atasan_langsung", match.struktur_atasan_langsung || "", { shouldDirty: true, shouldValidate: true });
    clearErrors(["nama_jabatan_orb", "nama_jabatan_menpan", "status_rumpun", "struktur_atasan_langsung"]);
  }, [clearErrors, isPjlp, petaRowsForUkpd, selectedJabatanOrb, setValue]);

  const loadAddressLevel = useCallback(async (tipe, level, params) => {
    const query = new URLSearchParams(params);
    const response = await fetch(`/api/reference/address?${query.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!payload?.success) return;
    setAddressOptions((current) => ({
      ...current,
      [tipe]: {
        ...current[tipe],
        [level]: payload.data.options || []
      }
    }));
  }, []);

  useEffect(() => {
    if (mode !== "create") return;
    const defaultUkpd = normalizeText(referenceOptions.defaultPegawai?.nama_ukpd);
    if (!defaultUkpd || normalizeText(getValues("nama_ukpd"))) return;
    setValue("nama_ukpd", defaultUkpd, { shouldDirty: false, shouldValidate: true });
    clearErrors("nama_ukpd");
  }, [clearErrors, getValues, mode, referenceOptions.defaultPegawai, setValue]);

  useEffect(() => {
    const baseValues = buildInitialForm(initialData);
    setProfilePhotoFile(null);
    setProfilePhotoError("");
    try {
      const storage = draftStorage();
      const savedDraft = storage?.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed?.data) {
          reset(buildInitialForm({ ...initialData, ...parsed.data }));
          setDraftSavedAt(parsed.savedAt || "");
          setBanner({
            type: "info",
            text: `Draft terakhir dipulihkan${parsed.savedAt ? ` (${formatSavedAt(parsed.savedAt)})` : ""}.`
          });
          return;
        }
      }
    } catch {
      // ignore broken draft
    }
    reset(baseValues);
  }, [draftKey, initialData, reset]);

  useEffect(() => {
    if (!profilePhotoFile) {
      setProfilePhotoPreview("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(profilePhotoFile);
    setProfilePhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [profilePhotoFile]);

  useEffect(() => {
    let active = true;

    async function loadReferenceOptions() {
      const [formOptionsResponse, provinceResponse] = await Promise.all([
        fetch("/api/pegawai/form-options", { cache: "no-store" }),
        fetch("/api/reference/address", { cache: "no-store" })
      ]);
      const [formOptionsResult, provinceResult] = await Promise.all([
        formOptionsResponse.json(),
        provinceResponse.json()
      ]);
      if (!active) return;

      if (formOptionsResult?.success) {
        setReferenceOptions((current) => ({ ...current, ...formOptionsResult.data }));
      }
      if (provinceResult?.success) {
        const provinceOptions = provinceResult.data.options || [];
        setAddressOptions((current) => ({
          domisili: {
            ...current.domisili,
            provinsi: provinceOptions
          },
          ktp: {
            ...current.ktp,
            provinsi: provinceOptions
          }
        }));
      }
    }

    loadReferenceOptions().catch(() => {
      if (active) {
        setBanner({
          type: "error",
          text: "Referensi form belum berhasil dimuat. Coba refresh halaman."
        });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = watch((value) => {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        const savedAt = new Date().toISOString();
        draftStorage()?.setItem(draftKey, JSON.stringify({ savedAt, data: value }));
        setDraftSavedAt(savedAt);
      }, 500);
    });

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(saveTimerRef.current);
    };
  }, [draftKey, watch]);

  useEffect(() => {
    const loaders = [
      {
        tipe: "domisili",
        values: alamatDomisili
      },
      {
        tipe: "ktp",
        values: alamatKtp
      }
    ];

    loaders.forEach(({ tipe, values }) => {
      const provinsi = addressParam(values, "provinsi", "kode_provinsi");
      const kotaKabupaten = addressParam(values, "kota_kabupaten", "kode_kota_kab");
      const kecamatan = addressParam(values, "kecamatan", "kode_kecamatan");

      if (provinsi) {
        loadAddressLevel(tipe, "kota_kabupaten", { provinsi }).catch(() => null);
      }
      if (provinsi && kotaKabupaten) {
        loadAddressLevel(tipe, "kecamatan", { provinsi, kota_kabupaten: kotaKabupaten }).catch(() => null);
      }
      if (provinsi && kotaKabupaten && kecamatan) {
        loadAddressLevel(tipe, "kelurahan", {
          provinsi,
          kota_kabupaten: kotaKabupaten,
          kecamatan
        }).catch(() => null);
      }
    });

  }, [alamatDomisili, alamatKtp, loadAddressLevel]);

  useEffect(() => {
    const targets = [
      { tipe: "domisili", values: alamatDomisili },
      { tipe: "ktp", values: alamatKtp }
    ];

    targets.forEach(({ tipe, values }) => {
      [
        ["provinsi", "kode_provinsi"],
        ["kota_kabupaten", "kode_kota_kab"],
        ["kecamatan", "kode_kecamatan"],
        ["kelurahan", "kode_kelurahan"]
      ].forEach(([field, codeField]) => {
        if (values?.[codeField]) return;
        const matched = findAddressSelection(values?.[field], addressFieldOptions(addressOptions, tipe, field));
        if (matched) {
          setValue(`alamat.${tipe}.${field}`, matched.name, { shouldDirty: false });
          setValue(`alamat.${tipe}.${codeField}`, matched.code, { shouldDirty: false });
        }
      });
    });
  }, [addressOptions, alamatDomisili, alamatKtp, setValue]);

  function saveDraftNow() {
    const savedAt = new Date().toISOString();
    draftStorage()?.setItem(draftKey, JSON.stringify({ savedAt, data: getValues() }));
    setDraftSavedAt(savedAt);
    setBanner({
      type: "success",
      text: `Draft berhasil disimpan${savedAt ? ` pada ${formatSavedAt(savedAt)}` : ""}.`
    });
  }

  function scrollToField(fieldName) {
    const target = typeof document !== "undefined" ? document.getElementsByName(fieldName)?.[0] : null;
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof target.focus === "function") {
        window.setTimeout(() => target.focus(), 150);
      }
    }
  }

  async function goToStep(index) {
    if (index === activeStep) return;
    if (index < activeStep) {
      startTransition(() => setActiveStep(index));
      return;
    }
    const currentFields = stepConfig[activeStep].fields;
    const isValid = currentFields.length ? await trigger(currentFields, { shouldFocus: true }) : true;
    if (!isValid) {
      const path = firstErrorPath(formState.errors);
      scrollToField(path);
      setBanner({
        type: "error",
        text: "Masih ada field yang perlu diperbaiki sebelum lanjut ke step berikutnya."
      });
      return;
    }
    startTransition(() => setActiveStep(index));
  }

  async function nextStep() {
    const currentStep = stepConfig[activeStep];
    const isValid = currentStep.fields.length ? await trigger(currentStep.fields, { shouldFocus: true }) : true;
    if (!isValid) {
      const path = firstErrorPath(methods.formState.errors);
      scrollToField(path);
      setBanner({
        type: "error",
        text: "Masih ada field yang belum valid. Silakan periksa bagian yang ditandai merah."
      });
      return;
    }
    startTransition(() => setActiveStep((current) => Math.min(current + 1, stepConfig.length - 1)));
  }

  function previousStep() {
    startTransition(() => setActiveStep((current) => Math.max(current - 1, 0)));
  }

  function skipOptionalStep() {
    startTransition(() => setActiveStep((current) => Math.min(current + 1, stepConfig.length - 1)));
  }

  function handleAddressChange(tipe, field, selectedCode) {
    const dependents = {
      provinsi: ["kota_kabupaten", "kecamatan", "kelurahan"],
      kota_kabupaten: ["kecamatan", "kelurahan"],
      kecamatan: ["kelurahan"],
      kelurahan: []
    };
    const options = addressFieldOptions(addressOptions, tipe, field);
    const selected = options.find((item) => item.code === selectedCode);
    const codeField = codeFieldForAddress(field);

    setValue(`alamat.${tipe}.${field}`, selected?.name || "", { shouldDirty: true, shouldValidate: true });
    setValue(`alamat.${tipe}.${codeField}`, selected?.code || "", { shouldDirty: true, shouldValidate: true });
    clearErrors(`alamat.${tipe}.${codeField}`);

    for (const child of dependents[field]) {
      setValue(`alamat.${tipe}.${child}`, "", { shouldDirty: true });
      setValue(`alamat.${tipe}.${codeFieldForAddress(child)}`, "", { shouldDirty: true });
      clearErrors(`alamat.${tipe}.${codeFieldForAddress(child)}`);
    }

    if (dependents[field].length) {
      setAddressOptions((current) => ({
        ...current,
        [tipe]: {
          ...current[tipe],
          ...Object.fromEntries(dependents[field].map((child) => [child, []]))
        }
      }));
    }

    const nextValues = {
      ...getValues(`alamat.${tipe}`),
      [field]: selected?.name || "",
      [codeField]: selected?.code || ""
    };
    const provinsi = addressParam(nextValues, "provinsi", "kode_provinsi");
    const kotaKabupaten = addressParam(nextValues, "kota_kabupaten", "kode_kota_kab");
    const kecamatan = addressParam(nextValues, "kecamatan", "kode_kecamatan");

    if (field === "provinsi" && provinsi) {
      loadAddressLevel(tipe, "kota_kabupaten", { provinsi }).catch(() => null);
    }
    if (field === "kota_kabupaten" && provinsi && kotaKabupaten) {
      loadAddressLevel(tipe, "kecamatan", { provinsi, kota_kabupaten: kotaKabupaten }).catch(() => null);
    }
    if (field === "kecamatan" && provinsi && kotaKabupaten && kecamatan) {
      loadAddressLevel(tipe, "kelurahan", { provinsi, kota_kabupaten: kotaKabupaten, kecamatan }).catch(() => null);
    }
  }

  function handleProfilePhotoSelect(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    setProfilePhotoError("");
    if (!file) {
      setProfilePhotoFile(null);
      return;
    }
    if (!PROFILE_PHOTO_ACCEPT.split(",").includes(String(file.type || "").toLowerCase())) {
      setProfilePhotoFile(null);
      setProfilePhotoError("Foto profil harus berformat JPG, PNG, atau WEBP.");
      return;
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setProfilePhotoFile(null);
      setProfilePhotoError("Ukuran foto profil maksimal 1 MB.");
      return;
    }
    setProfilePhotoFile(file);
  }

  async function uploadProfilePhoto(idPegawai) {
    if (!profilePhotoFile || !idPegawai) return null;
    const formData = new FormData();
    formData.append("file", profilePhotoFile);
    const response = await fetch(`/api/pegawai/${idPegawai}/photo`, {
      method: "POST",
      body: formData
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Foto profil gagal diunggah.");
    }
    return result.data;
  }

  async function submitValid(data) {
    setPendingSubmitData(data);
  }

  async function confirmSubmit() {
    const data = pendingSubmitData;
    if (!data) return;
    setSaving(true);
    setBanner({ type: "", text: "" });

    const endpoint = mode === "edit" ? `/api/pegawai/${data.id_pegawai}` : "/api/pegawai";
    try {
      const response = await fetch(endpoint, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await response.json();

      if (!result.success) {
        const normalizedErrors = normalizeApiErrors(result.errors);
        normalizedErrors.forEach((entry) => {
          setError(entry.field, { type: "server", message: entry.message });
        });
        const firstPath = normalizedErrors[0]?.field || firstErrorPath(result.errors || {});
        if (firstPath) {
          startTransition(() => setActiveStep(fieldStepIndex(firstPath)));
          window.setTimeout(() => scrollToField(firstPath), 150);
        }
        setBanner({
          type: "error",
          text: result.message || "Data pegawai belum berhasil disimpan. Periksa kembali field yang ditandai."
        });
        setPendingSubmitData(null);
        return;
      }

      try {
        const uploadedPhoto = await uploadProfilePhoto(result.data.id_pegawai);
        if (uploadedPhoto?.foto_profil_url) {
          setValue("foto_profil_url", uploadedPhoto.foto_profil_url, { shouldDirty: false });
        }
      } catch (photoError) {
        setProfilePhotoError(photoError.message || "Foto profil gagal diunggah.");
        startTransition(() => setActiveStep(0));
        setBanner({
          type: "error",
          text: `Data pegawai sudah tersimpan, tetapi foto profil belum berhasil diunggah: ${photoError.message || "Coba pilih foto lain atau ulangi upload."}`
        });
        setPendingSubmitData(null);
        return;
      }
      setPendingSubmitData(null);
      draftStorage()?.removeItem(draftKey);
      router.push(`/pegawai/${result.data.id_pegawai}`);
      router.refresh();
    } catch {
      setPendingSubmitData(null);
      setBanner({
        type: "error",
        text: "Gagal menyimpan data pegawai. Cek koneksi atau coba lagi beberapa saat."
      });
    } finally {
      setSaving(false);
    }
  }

  function submitInvalid(errors) {
    const path = firstErrorPath(errors);
    const firstMessage = getByPath(errors, path)?.message;
    startTransition(() => setActiveStep(fieldStepIndex(path)));
    window.setTimeout(() => scrollToField(path), 150);
    setBanner({
      type: "error",
      text: firstMessage
        ? `Masih ada kesalahan pengisian: ${firstMessage}`
        : "Masih ada kesalahan pengisian. Sistem otomatis membawa Anda ke step yang perlu diperbaiki."
    });
  }

  const activeStepNode = (
    <div className="space-y-6">
      {banner.text ? (
        <div
          className={[
            "rounded-2xl border px-4 py-3 text-sm font-medium",
            banner.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "",
            banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "",
            banner.type === "info" ? "border-sky-200 bg-sky-50 text-sky-700" : ""
          ].join(" ")}
        >
          {banner.text}
        </div>
      ) : null}

      {activeStep === 0 ? (
        <FormSection title="Identitas Pribadi" description="Isi data utama pegawai. Field penting divalidasi langsung agar kesalahan bisa diperbaiki saat itu juga." tone="soft">
          <ProfilePhotoField
            currentUrl={currentPhotoUrl}
            previewUrl={profilePhotoPreview}
            selectedFile={profilePhotoFile}
            error={profilePhotoError}
            onSelect={handleProfilePhotoSelect}
          />
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stepConfig[0].fields.map((field) => (
              <InputField
                key={field}
                name={field}
                register={register}
                required={["nama", "jenis_kelamin", "tempat_lahir", "tanggal_lahir", "agama"].includes(field)}
                options={allOptionsFor(field, effectiveReferenceOptions)}
                error={getByPath(formState.errors, field)}
                touched={Boolean(getByPath(formState.touchedFields, field))}
                dirty={Boolean(getByPath(formState.dirtyFields, field))}
                placeholder={placeholders[field]}
              />
            ))}
          </div>
        </FormSection>
      ) : null}

      {activeStep === 1 ? (
        <FormSection title="Data Kepegawaian" description="Bagian ini memengaruhi akses, filter dashboard, dan struktur organisasi." tone="soft">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stepConfig[1].fields.filter((field) => field !== "tanggal_kondisi" || KONDISI_WAJIB_TANGGAL.has(selectedKondisi)).map((field) => (
              <InputField
                key={field}
                name={field}
                register={register}
                required={["nama_ukpd", "jenis_pegawai", "kondisi"].includes(field) || (field === "tanggal_kondisi" && KONDISI_WAJIB_TANGGAL.has(selectedKondisi))}
                options={allOptionsFor(field, effectiveReferenceOptions)}
                error={getByPath(formState.errors, field)}
                touched={Boolean(getByPath(formState.touchedFields, field))}
                dirty={Boolean(getByPath(formState.dirtyFields, field))}
                placeholder={placeholders[field]}
                helpText={helperTexts[field]}
              />
            ))}
          </div>
        </FormSection>
      ) : null}

      {activeStep === 2 ? (
        <FormSection title="Jabatan" description={isPjlp ? "PJLP dikecualikan dari validasi Peta Jabatan dan atasan langsung." : "Referensi Jabatan ORB/Pergub, Jabatan Kepmenpan, Rumpun Jabatan, dan Atasan Langsung diambil dari Peta Jabatan sesuai UKPD."} tone="soft">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stepConfig[2].fields.map((field) => (
              <InputField
                key={field}
                name={field}
                register={register}
                required={!isPjlp && ["nama_jabatan_orb", "nama_jabatan_menpan", "status_rumpun"].includes(field)}
                options={allOptionsFor(field, effectiveReferenceOptions)}
                error={getByPath(formState.errors, field)}
                touched={Boolean(getByPath(formState.touchedFields, field))}
                dirty={Boolean(getByPath(formState.dirtyFields, field))}
                placeholder={placeholders[field]}
                helpText={helperTexts[field]}
              />
            ))}
          </div>
        </FormSection>
      ) : null}

      {activeStep === 3 ? (
        <FormSection title="Pendidikan & Kontak" description="Tambahkan pendidikan terakhir dan kontak utama yang masih aktif." tone="soft">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stepConfig[3].fields.map((field) => (
              <InputField
                key={field}
                name={field}
                register={register}
                options={allOptionsFor(field, effectiveReferenceOptions)}
                error={getByPath(formState.errors, field)}
                touched={Boolean(getByPath(formState.touchedFields, field))}
                dirty={Boolean(getByPath(formState.dirtyFields, field))}
                placeholder={placeholders[field]}
                helpText={helperTexts[field]}
              />
            ))}
          </div>
        </FormSection>
      ) : null}

      {activeStep === 4 ? (
        <FormSection title="Alamat Pegawai" description="Pilih wilayah resmi dari dropdown berjenjang agar data alamat tidak ambigu." tone="soft">
          <div className="grid gap-5 xl:grid-cols-2">
            <AddressCard
              title="Alamat Domisili"
              tipe="domisili"
              register={register}
              errors={formState.errors.alamat?.domisili}
              touchedFields={formState.touchedFields.alamat?.domisili}
              dirtyFields={formState.dirtyFields.alamat?.domisili}
              addressOptions={addressOptions}
              values={alamatDomisili}
              onAddressChange={handleAddressChange}
            />
            <AddressCard
              title="Alamat KTP"
              tipe="ktp"
              register={register}
              errors={formState.errors.alamat?.ktp}
              touchedFields={formState.touchedFields.alamat?.ktp}
              dirtyFields={formState.dirtyFields.alamat?.ktp}
              addressOptions={addressOptions}
              values={alamatKtp}
              onAddressChange={handleAddressChange}
            />
          </div>
        </FormSection>
      ) : null}

      {activeStep === 5 ? (
        <FormSection title="Riwayat Opsional" description="Semua panel default tertutup untuk mengurangi beban visual. Buka hanya bagian yang memang ingin diisi.">
          <div className="space-y-4">
            {repeatableSections.map((section) => (
              <RepeatableAccordion
                key={section.key}
                section={section}
                control={methods.control}
                register={register}
                formState={formState}
                referenceOptions={referenceOptions}
              />
            ))}
          </div>
        </FormSection>
      ) : null}
    </div>
  );

  return (
    <>
      <form onSubmit={handleSubmit(submitValid, submitInvalid)}>
        <MultiStepForm
          header={<Stepper steps={stepConfig} activeStep={activeStep} onStepChange={goToStep} />}
          body={activeStepNode}
          footer={
          <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:bottom-0">
              <div className="mx-auto grid max-w-[1400px] gap-3 sm:grid-cols-[1fr_auto] sm:items-center lg:px-8 lg:pb-[env(safe-area-inset-bottom)]">
                <div className="min-w-0 text-sm text-slate-500">
                  {draftSavedAt ? `Draft tersimpan otomatis: ${formatSavedAt(draftSavedAt)}` : "Draft belum disimpan."}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[112px_152px_112px_112px_168px] sm:items-center sm:justify-end">
                  <button type="button" className="btn-secondary" onClick={() => router.back()}>
                    Batal
                  </button>
                  <button type="button" className="btn-secondary" onClick={saveDraftNow}>
                    <Save className="h-4 w-4" />
                    Simpan Draft
                  </button>
                  {activeStep > 0 ? (
                    <button type="button" className="btn-secondary" onClick={previousStep}>
                      Kembali
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary invisible pointer-events-none hidden sm:inline-flex" tabIndex={-1} aria-hidden="true" disabled>
                      Kembali
                    </button>
                  )}
                  {stepConfig[activeStep]?.optional ? (
                    <button type="button" className="btn-secondary" onClick={skipOptionalStep}>
                      <SkipForward className="h-4 w-4" />
                      Lewati
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary invisible pointer-events-none hidden sm:inline-flex" tabIndex={-1} aria-hidden="true" disabled>
                      <SkipForward className="h-4 w-4" />
                      Lewati
                    </button>
                  )}
                  {activeStep < stepConfig.length - 1 ? (
                    <button type="button" className="btn-primary col-span-2 sm:col-span-1" onClick={nextStep} disabled={saving || isPending}>
                      {isPending ? "Memuat..." : "Lanjut"}
                    </button>
                  ) : (
                    <button type="submit" className="btn-primary col-span-2 sm:col-span-1" disabled={saving}>
                      {saving ? "Menyimpan..." : mode === "edit" ? "Simpan Perubahan" : "Simpan Pegawai"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          }
        />
      </form>
      <ConfirmDeleteModal
        open={Boolean(pendingSubmitData)}
        title={mode === "edit" ? "Simpan perubahan pegawai?" : "Simpan pegawai baru?"}
        description="Pastikan data utama, UKPD, jabatan, dan kontak sudah sesuai sebelum disimpan."
        confirmLabel="Simpan"
        loadingLabel="Menyimpan..."
        tone="primary"
        loading={saving}
        onCancel={() => setPendingSubmitData(null)}
        onConfirm={confirmSubmit}
      />
    </>
  );
}
