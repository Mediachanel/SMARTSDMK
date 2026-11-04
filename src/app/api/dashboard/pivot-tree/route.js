import { requireAuth } from "@/lib/auth/requireAuth";
import { getScopedDashboardData } from "@/lib/dashboardData";
import { ok } from "@/lib/helpers/response";
import { normalizeJenisPegawai } from "@/lib/helpers/pegawaiStatus";
import { getPegawaiWilayah } from "@/lib/auth/access";

const MASA_KERJA_ORDER = [
  ...Array.from({ length: 10 }, (_, index) => `${index * 2}-${index * 2 + 2} tahun`),
  ">20 tahun",
  "Tidak Diketahui"
];

function sortText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "id");
}

function filterByUkpd(data, ukpdFilter) {
  const text = String(ukpdFilter || "all").trim();
  if (!text || text === "all") return data;
  return data.filter((item) => (item.nama_ukpd || "Tidak Diketahui") === text);
}

function filterByWilayah(data, wilayahFilter, ukpdList = []) {
  const text = String(wilayahFilter || "all").trim();
  if (!text || text === "all") return data;
  return data.filter((item) => {
    const wilayah = item.wilayah || getPegawaiWilayah(item, ukpdList);
    return (wilayah || "Tidak Diketahui") === text;
  });
}

function mapEmployee(item) {
  return {
    id_pegawai: item.id_pegawai,
    nama: item.nama || "-",
    nip: item.nip || "-",
    jenis_pegawai: normalizeJenisPegawai(item.jenis_pegawai),
    nama_ukpd: item.nama_ukpd || "-",
    rumpun_jabatan: item.status_rumpun || "Tidak Diketahui",
    jabatan_kepmenpan_11: item.nama_jabatan_menpan || item.nama_jabatan_orb || "Tidak Diketahui",
    jenjang_pendidikan: item.jenjang_pendidikan || "Tidak Diketahui",
    program_studi: item.program_studi || "Tidak Diketahui"
  };
}

function createCount() {
  return {
    total: 0,
    pnsCpns: 0,
    pppk: 0,
    pppkParuhWaktu: 0,
    nonPns: 0,
    pjlp: 0
  };
}

function bumpCount(counter, jenisPegawai) {
  counter.total += 1;
  if (jenisPegawai === "PNS" || jenisPegawai === "CPNS") counter.pnsCpns += 1;
  if (jenisPegawai === "PPPK") counter.pppk += 1;
  if (jenisPegawai === "PPPK Paruh Waktu") counter.pppkParuhWaktu += 1;
  if (jenisPegawai === "NON PNS") counter.nonPns += 1;
  if (jenisPegawai === "PJLP") counter.pjlp += 1;
}

function buildRumpunTree(data) {
  const rootMap = new Map();
  for (const item of data) {
    const employee = mapEmployee(item);
    const group1 = employee.rumpun_jabatan;
    const group2 = employee.jabatan_kepmenpan_11;
    if (!rootMap.has(group1)) rootMap.set(group1, { count: createCount(), children: new Map() });
    const level1 = rootMap.get(group1);
    if (!level1.children.has(group2)) level1.children.set(group2, createCount());
    const level2Count = level1.children.get(group2);
    bumpCount(level1.count, employee.jenis_pegawai);
    bumpCount(level2Count, employee.jenis_pegawai);
  }

  return [...rootMap.entries()]
    .sort(([a], [b]) => sortText(a, b))
    .map(([label, value]) => ({
      label,
      total: value.count.total,
      counts: value.count,
      children: [...value.children.entries()]
        .sort(([a], [b]) => sortText(a, b))
        .map(([label2, count]) => ({
          label: label2,
          total: count.total,
          counts: count
        }))
    }));
}

function buildJabatanTree(data) {
  const rootMap = new Map();
  for (const item of data) {
    const employee = mapEmployee(item);
    const group1 = employee.jabatan_kepmenpan_11;
    const group2 = employee.nama_ukpd;
    if (!rootMap.has(group1)) rootMap.set(group1, { count: createCount(), children: new Map() });
    const level1 = rootMap.get(group1);
    if (!level1.children.has(group2)) level1.children.set(group2, createCount());
    const level2Count = level1.children.get(group2);
    bumpCount(level1.count, employee.jenis_pegawai);
    bumpCount(level2Count, employee.jenis_pegawai);
  }

  return [...rootMap.entries()]
    .sort(([a], [b]) => sortText(a, b))
    .map(([label, value]) => ({
      label,
      total: value.count.total,
      counts: value.count,
      children: [...value.children.entries()]
        .sort(([a], [b]) => sortText(a, b))
        .map(([label2, count]) => ({
          label: label2,
          total: count.total,
          counts: count
        }))
    }));
}

function buildPendidikanTree(data) {
  const rootMap = new Map();
  for (const item of data) {
    const employee = mapEmployee(item);
    const group1 = employee.jenjang_pendidikan;
    const group2 = employee.program_studi;
    if (!rootMap.has(group1)) rootMap.set(group1, { count: createCount(), children: new Map() });
    const level1 = rootMap.get(group1);
    if (!level1.children.has(group2)) level1.children.set(group2, createCount());
    const level2Count = level1.children.get(group2);
    bumpCount(level1.count, employee.jenis_pegawai);
    bumpCount(level2Count, employee.jenis_pegawai);
  }

  return [...rootMap.entries()]
    .sort(([a], [b]) => sortText(a, b))
    .map(([label, value]) => ({
      label,
      total: value.count.total,
      counts: value.count,
      children: [...value.children.entries()]
        .sort(([a], [b]) => sortText(a, b))
        .map(([label2, count]) => ({
          label: label2,
          total: count.total,
          counts: count
        }))
    }));
}

function parseLooseDate(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("#")) return null;
  const cleaned = raw.replace(/^'+/, "").replace(/\s+/g, "").replace(/-/g, "/");

  const isoMatch = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoMatch) {
    return createValidDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return createValidDate(year, month, day);
}

function createValidDate(year, month, day) {
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return null;
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function getYearsOfService(date) {
  if (!date) return null;
  const today = new Date();
  let years = today.getFullYear() - date.getFullYear();
  const beforeAnniversary = (today.getMonth() < date.getMonth())
    || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

function getMasaKerjaRange(value) {
  const years = getYearsOfService(parseLooseDate(value));
  if (years === null || years === undefined) return "Tidak Diketahui";
  if (years > 20) return ">20 tahun";
  const start = Math.max(0, Math.ceil(Number(years) / 2) * 2 - 2);
  return `${start}-${start + 2} tahun`;
}

function getMasaKerjaOrderIndex(label) {
  const index = MASA_KERJA_ORDER.indexOf(label);
  return index === -1 ? MASA_KERJA_ORDER.length : index;
}

function buildMasaKerjaTree(data) {
  const rootMap = new Map();
  for (const item of data) {
    const employee = mapEmployee(item);
    const group1 = getMasaKerjaRange(item.tmt_kerja_ukpd);
    const group2 = employee.jabatan_kepmenpan_11;
    if (!rootMap.has(group1)) rootMap.set(group1, { count: createCount(), children: new Map() });
    const level1 = rootMap.get(group1);
    if (!level1.children.has(group2)) level1.children.set(group2, createCount());
    const level2Count = level1.children.get(group2);
    bumpCount(level1.count, employee.jenis_pegawai);
    bumpCount(level2Count, employee.jenis_pegawai);
  }

  return [...rootMap.entries()]
    .sort(([a], [b]) => getMasaKerjaOrderIndex(a) - getMasaKerjaOrderIndex(b) || sortText(a, b))
    .map(([label, value]) => ({
      label,
      total: value.count.total,
      counts: value.count,
      children: [...value.children.entries()]
        .sort(([a], [b]) => sortText(a, b))
        .map(([label2, count]) => ({
          label: label2,
          total: count.total,
          counts: count
        }))
    }));
}

function resolveWilayah(item, ukpdByName) {
  return item.wilayah || ukpdByName.get(item.nama_ukpd)?.wilayah || "Tidak Diketahui";
}

function buildUkpdTree(data, ukpdList = []) {
  const rootMap = new Map();
  const ukpdByName = new Map(ukpdList.map((item) => [item.nama_ukpd, item]));
  for (const item of data) {
    const employee = mapEmployee(item);
    const group1 = employee.nama_ukpd || "Tidak Diketahui";
    const group2 = employee.rumpun_jabatan || "Tidak Diketahui";
    const group3 = employee.jabatan_kepmenpan_11 || "Tidak Diketahui";
    const wilayah = resolveWilayah(item, ukpdByName);

    if (!rootMap.has(group1)) rootMap.set(group1, { count: createCount(), children: new Map(), wilayah });
    const level1 = rootMap.get(group1);
    if (!level1.wilayah || level1.wilayah === "Tidak Diketahui") level1.wilayah = wilayah;
    if (!level1.children.has(group2)) level1.children.set(group2, { count: createCount(), children: new Map() });
    const level2 = level1.children.get(group2);
    if (!level2.children.has(group3)) level2.children.set(group3, createCount());
    const level3Count = level2.children.get(group3);

    bumpCount(level1.count, employee.jenis_pegawai);
    bumpCount(level2.count, employee.jenis_pegawai);
    bumpCount(level3Count, employee.jenis_pegawai);
  }

  return [...rootMap.entries()]
    .sort(([a], [b]) => sortText(a, b))
    .map(([label, value]) => ({
      label,
      wilayah: value.wilayah || "Tidak Diketahui",
      total: value.count.total,
      counts: value.count,
      children: [...value.children.entries()]
        .sort(([a], [b]) => sortText(a, b))
        .map(([label2, value2]) => ({
          label: label2,
          total: value2.count.total,
          counts: value2.count,
          children: [...value2.children.entries()]
            .sort(([a], [b]) => sortText(a, b))
            .map(([label3, count3]) => ({
              label: label3,
              total: count3.total,
              counts: count3
            }))
        }))
    }));
}

export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const modeParam = searchParams.get("mode");
  const mode = modeParam === "jabatan"
    ? "jabatan"
    : modeParam === "ukpd"
      ? "ukpd"
      : modeParam === "pendidikan"
        ? "pendidikan"
        : modeParam === "masa-kerja"
          ? "masa-kerja"
        : "rumpun";
  const q = (searchParams.get("q") || "").toLowerCase();
  const wilayah = searchParams.get("wilayah") || "all";
  const ukpd = searchParams.get("ukpd") || "all";
  const group1 = searchParams.get("group1") || "";
  const group2 = searchParams.get("group2") || "";
  const group3 = searchParams.get("group3") || "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(10, Number.parseInt(searchParams.get("pageSize") || "20", 10)));

  const { data: scoped, ukpdList } = await getScopedDashboardData(user);
  const wilayahScoped = filterByWilayah(scoped, wilayah, ukpdList);
  const ukpdScoped = filterByUkpd(wilayahScoped, ukpd);
  const filtered = q
    ? ukpdScoped.filter((item) =>
      [
        item.nama,
        item.nip,
        item.nama_ukpd,
        item.status_rumpun,
        item.nama_jabatan_menpan,
        item.nama_jabatan_orb
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
    : ukpdScoped;

  if (group1 && group2 && (mode !== "ukpd" || group3)) {
    const employeesAll = filtered
      .filter((item) => {
        if (mode === "ukpd") {
          const ukpd = item.nama_ukpd || "Tidak Diketahui";
          const rumpun = item.status_rumpun || "Tidak Diketahui";
          const jabatan = item.nama_jabatan_menpan || item.nama_jabatan_orb || "Tidak Diketahui";
          return ukpd === group1 && rumpun === group2 && jabatan === group3;
        }
        if (mode === "jabatan") {
          const jabatan = item.nama_jabatan_menpan || item.nama_jabatan_orb || "Tidak Diketahui";
          const ukpd = item.nama_ukpd || "Tidak Diketahui";
          return jabatan === group1 && ukpd === group2;
        }
        if (mode === "pendidikan") {
          const jenjang = item.jenjang_pendidikan || "Tidak Diketahui";
          const jurusan = item.program_studi || "Tidak Diketahui";
          return jenjang === group1 && jurusan === group2;
        }
        if (mode === "masa-kerja") {
          const masaKerja = getMasaKerjaRange(item.tmt_kerja_ukpd);
          const jabatan = item.nama_jabatan_menpan || item.nama_jabatan_orb || "Tidak Diketahui";
          return masaKerja === group1 && jabatan === group2;
        }
        const rumpun = item.status_rumpun || "Tidak Diketahui";
        const jabatan = item.nama_jabatan_menpan || item.nama_jabatan_orb || "Tidak Diketahui";
        return rumpun === group1 && jabatan === group2;
      })
      .map(mapEmployee)
      .sort((a, b) => sortText(a.nama, b.nama));
    const start = (page - 1) * pageSize;
    const employees = employeesAll.slice(start, start + pageSize);
    const data = { mode, group1, group2, group3, page, pageSize, total: employeesAll.length, employees };
    return ok(data);
  }

  const tree = mode === "jabatan"
      ? buildJabatanTree(filtered)
      : mode === "ukpd"
      ? buildUkpdTree(filtered, ukpdList)
      : mode === "pendidikan"
        ? buildPendidikanTree(filtered)
        : mode === "masa-kerja"
          ? buildMasaKerjaTree(filtered)
        : buildRumpunTree(filtered);
  const data = { mode, total: filtered.length, tree };
  return ok(data);
}
