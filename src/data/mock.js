import { ROLES } from "@/lib/constants/roles";

const generatedPegawai = [];
const generatedUkpd = [];
const generatedAlamat = [];
const generatedKeluarga = [];
const generatedUsulanMutasi = [];
const generatedUsulanPutusJf = [];

const fallbackUkpdList = [
  { id_ukpd: 1, nama_ukpd: "Dinas Kesehatan Provinsi DKI Jakarta", jenis_ukpd: "Dinas", role: ROLES.SUPER_ADMIN, wilayah: "Provinsi", created_at: "2026-01-02" },
  { id_ukpd: 2, nama_ukpd: "Suku Dinas Kesehatan Jakarta Timur", jenis_ukpd: "Sudinkes", role: ROLES.ADMIN_WILAYAH, wilayah: "Jakarta Timur", created_at: "2026-01-02" },
  { id_ukpd: 3, nama_ukpd: "Suku Dinas Kesehatan Jakarta Barat", jenis_ukpd: "Sudinkes", role: ROLES.ADMIN_WILAYAH, wilayah: "Jakarta Barat", created_at: "2026-01-02" },
  { id_ukpd: 4, nama_ukpd: "Puskesmas Kecamatan Cakung", jenis_ukpd: "Puskesmas", role: ROLES.ADMIN_UKPD, wilayah: "Jakarta Timur", created_at: "2026-01-02" },
  { id_ukpd: 5, nama_ukpd: "RSUD Cengkareng", jenis_ukpd: "RSUD", role: ROLES.ADMIN_UKPD, wilayah: "Jakarta Barat", created_at: "2026-01-02" },
  { id_ukpd: 6, nama_ukpd: "Puskesmas Kecamatan Menteng", jenis_ukpd: "Puskesmas", role: ROLES.ADMIN_UKPD, wilayah: "Jakarta Pusat", created_at: "2026-01-02" }
];

const importedUkpd = generatedUkpd.map((item) => ({
  ...item,
  role: ROLES.ADMIN_UKPD
}));

export const ukpdList = generatedUkpd.length
  ? importedUkpd
  : fallbackUkpdList;

export const users = [
  { id: 1, username: "superadmin", nama_ukpd: "Dinas Kesehatan", role: ROLES.SUPER_ADMIN, wilayah: "Dinkes" },
  { id: 2, username: "admin-timur", nama_ukpd: "Suku Dinas Kesehatan Jakarta Timur", role: ROLES.ADMIN_WILAYAH, wilayah: "Jakarta Timur" },
  { id: 3, username: "admin-cakung", nama_ukpd: "Puskesmas Cakung", role: ROLES.ADMIN_UKPD, wilayah: "Jakarta Timur" }
];

const fallbackPegawaiMaster = [
  {
    id_pegawai: 101,
    nama: "dr. Andini Rahma, M.Kes",
    jenis_kelamin: "Perempuan",
    tempat_lahir: "Jakarta",
    tanggal_lahir: "1988-02-12",
    nik: "3175015202880001",
    agama: "Islam",
    nama_ukpd: "Puskesmas Kecamatan Cakung",
    jenis_pegawai: "PNS",
    status_rumpun: "Tenaga Kesehatan",
    jenis_kontrak: "-",
    nrk: "19880212",
    nip: "198802122010012001",
    nama_jabatan_orb: "Dokter Ahli Madya",
    nama_jabatan_menpan: "Dokter",
    struktur_atasan_langsung: "Kepala Puskesmas",
    pangkat_golongan: "Pembina / IV/a",
    tmt_pangkat_terakhir: "2024-04-01",
    jenjang_pendidikan: "S2",
    program_studi: "Kesehatan Masyarakat",
    nama_universitas: "Universitas Indonesia",
    no_hp_pegawai: "081234567801",
    email: "andini.rahma@jakarta.go.id",
    no_bpjs: "0001234567890",
    kondisi: "Aktif",
    status_perkawinan: "Kawin",
    gelar_depan: "dr.",
    gelar_belakang: "M.Kes",
    tmt_kerja_ukpd: "2021-03-01",
    created_at: "2026-01-10"
  },
  {
    id_pegawai: 102,
    nama: "Rizky Pratama, A.Md.Kep",
    jenis_kelamin: "Laki-laki",
    tempat_lahir: "Jakarta",
    tanggal_lahir: "1993-11-20",
    nik: "3175022011930002",
    agama: "Islam",
    nama_ukpd: "Puskesmas Kecamatan Cakung",
    jenis_pegawai: "PPPK",
    status_rumpun: "Tenaga Kesehatan",
    jenis_kontrak: "PPPK Teknis",
    nrk: "19931120",
    nip: "199311202022211003",
    nama_jabatan_orb: "Perawat Terampil",
    nama_jabatan_menpan: "Perawat",
    struktur_atasan_langsung: "Kepala Subbag TU",
    pangkat_golongan: "IX",
    tmt_pangkat_terakhir: "2023-03-01",
    jenjang_pendidikan: "D3",
    program_studi: "Keperawatan",
    nama_universitas: "Poltekkes Jakarta III",
    no_hp_pegawai: "081234567802",
    email: "rizky.pratama@jakarta.go.id",
    no_bpjs: "0001234567891",
    kondisi: "Aktif",
    status_perkawinan: "Belum Kawin",
    gelar_depan: "",
    gelar_belakang: "A.Md.Kep",
    tmt_kerja_ukpd: "2022-06-01",
    created_at: "2026-01-11"
  },
  {
    id_pegawai: 103,
    nama: "Siti Maulida, SKM",
    jenis_kelamin: "Perempuan",
    tempat_lahir: "Bogor",
    tanggal_lahir: "1991-07-08",
    nik: "3175034807910003",
    agama: "Islam",
    nama_ukpd: "RSUD Cengkareng",
    jenis_pegawai: "PNS",
    status_rumpun: "Administrasi Kesehatan",
    jenis_kontrak: "-",
    nrk: "19910708",
    nip: "199107082014032004",
    nama_jabatan_orb: "Analis Kebijakan Ahli Muda",
    nama_jabatan_menpan: "Analis Kebijakan",
    struktur_atasan_langsung: "Kepala Bagian Umum",
    pangkat_golongan: "Penata / III/c",
    tmt_pangkat_terakhir: "2023-10-01",
    jenjang_pendidikan: "S1",
    program_studi: "Kesehatan Masyarakat",
    nama_universitas: "UIN Syarif Hidayatullah",
    no_hp_pegawai: "081234567803",
    email: "siti.maulida@jakarta.go.id",
    no_bpjs: "0001234567892",
    kondisi: "Aktif",
    status_perkawinan: "Kawin",
    gelar_depan: "",
    gelar_belakang: "SKM",
    tmt_kerja_ukpd: "2020-01-15",
    created_at: "2026-01-12"
  },
  {
    id_pegawai: 104,
    nama: "Bima Saputra",
    jenis_kelamin: "Laki-laki",
    tempat_lahir: "Jakarta",
    tanggal_lahir: "1996-04-28",
    nik: "3175042804960004",
    agama: "Kristen",
    nama_ukpd: "Puskesmas Kecamatan Menteng",
    jenis_pegawai: "Non PNS Profesional",
    status_rumpun: "Penunjang",
    jenis_kontrak: "Kontrak Tahunan",
    nrk: "",
    nip: "",
    nama_jabatan_orb: "Pranata Komputer",
    nama_jabatan_menpan: "Pranata Komputer",
    struktur_atasan_langsung: "Kasubbag TU",
    pangkat_golongan: "-",
    tmt_pangkat_terakhir: "",
    jenjang_pendidikan: "S1",
    program_studi: "Sistem Informasi",
    nama_universitas: "Universitas Gunadarma",
    no_hp_pegawai: "081234567804",
    email: "bima.saputra@jakarta.go.id",
    no_bpjs: "0001234567893",
    kondisi: "Aktif",
    status_perkawinan: "Belum Kawin",
    gelar_depan: "",
    gelar_belakang: "",
    tmt_kerja_ukpd: "2024-01-02",
    created_at: "2026-01-13"
  }
];

export let pegawaiMaster = generatedPegawai.length ? generatedPegawai : fallbackPegawaiMaster;

const fallbackAlamat = [
  { id: 1, id_pegawai: 101, tipe: "domisili", jalan: "Jl. Raya Penggilingan No. 12", kelurahan: "Penggilingan", kecamatan: "Cakung", kota_kabupaten: "Jakarta Timur", provinsi: "DKI Jakarta", kode_provinsi: "31", kode_kota_kab: "3175", kode_kecamatan: "317506", kode_kelurahan: "3175061001", created_at: "2026-01-10" },
  { id: 2, id_pegawai: 101, tipe: "ktp", jalan: "Jl. Kesehatan No. 18", kelurahan: "Cakung Barat", kecamatan: "Cakung", kota_kabupaten: "Jakarta Timur", provinsi: "DKI Jakarta", kode_provinsi: "31", kode_kota_kab: "3175", kode_kecamatan: "317506", kode_kelurahan: "3175061002", created_at: "2026-01-10" }
];

export const alamat = generatedAlamat.length ? generatedAlamat : fallbackAlamat;

const generatedPasangan = generatedKeluarga
  .filter((item) => item.hubungan === "pasangan")
  .map((item, index) => ({
    id: item.id || item.sumber_id || index + 1,
    id_pegawai: item.id_pegawai,
    status_punya: item.status_punya || "Tidak",
    nama: item.nama || "",
    no_tlp: item.no_tlp || "",
    email: item.email || "",
    pekerjaan: item.pekerjaan || "",
    created_at: item.created_at || ""
  }));

const fallbackPasangan = [
  { id: 1, id_pegawai: 101, status_punya: "Ya", nama: "Ahmad Fauzi", no_tlp: "081299999001", email: "ahmad@example.com", pekerjaan: "ASN", created_at: "2026-01-10" }
];

export const pasangan = generatedPasangan.length ? generatedPasangan : fallbackPasangan;

const generatedAnak = generatedKeluarga
  .filter((item) => item.hubungan === "anak")
  .map((item, index) => ({
    id: item.id || item.sumber_id || index + 1,
    id_pegawai: item.id_pegawai,
    urutan: item.urutan || index + 1,
    nama: item.nama || "",
    jenis_kelamin: item.jenis_kelamin || "",
    tempat_lahir: item.tempat_lahir || "",
    tanggal_lahir: item.tanggal_lahir || "",
    pekerjaan: item.pekerjaan || "",
    created_at: item.created_at || ""
  }));

const fallbackAnak = [
  { id: 1, id_pegawai: 101, urutan: 1, nama: "Nadia Fauzia", jenis_kelamin: "Perempuan", tempat_lahir: "Jakarta", tanggal_lahir: "2015-05-12", pekerjaan: "Pelajar", created_at: "2026-01-10" }
];

export const anak = generatedAnak.length ? generatedAnak : fallbackAnak;

const fallbackUsulanMutasi = [
  { id: 1, nama: "Rizky Pratama, A.Md.Kep", asal: "Puskesmas Kecamatan Cakung", tujuan: "RSUD Cengkareng", alasan: "Kebutuhan layanan rawat inap", status: "Diajukan" }
];

const fallbackUsulanPutusJf = [
  { id: 1, nama: "Siti Maulida, SKM", jabatan: "Analis Kebijakan Ahli Muda", alasan: "Penyesuaian jabatan struktural", status: "Verifikasi" }
];

export const usulanMutasi = generatedUsulanMutasi.length ? generatedUsulanMutasi : fallbackUsulanMutasi;

export const usulanPutusJf = generatedUsulanPutusJf.length ? generatedUsulanPutusJf : fallbackUsulanPutusJf;
