import { getPegawaiWilayah } from "@/lib/auth/access";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getScopedDashboardData } from "@/lib/dashboardData";
import { ok } from "@/lib/helpers/response";

function sortText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "id");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort(sortText);
}

function mapEmployee(item, ukpdList) {
  return {
    id_pegawai: item.id_pegawai,
    nama: item.nama,
    nip: item.nip || "-",
    nama_ukpd: item.nama_ukpd || "-",
    wilayah: getPegawaiWilayah(item, ukpdList),
    jenis_pegawai: item.jenis_pegawai || "-",
    rumpun_jabatan: item.status_rumpun || "-",
    jabatan_kepmenpan_11: item.nama_jabatan_menpan || item.nama_jabatan_orb || "-"
  };
}

export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const label = searchParams.get("label") || "";
  const ukpd = searchParams.get("ukpd") || "";
  const field = type === "jabatan" ? "nama_jabatan_menpan" : "status_rumpun";

  const { data: base, ukpdList } = await getScopedDashboardData(user);
  const labels = uniqueSorted(base.map((item) => item[field] || "Tidak Diketahui"));
  const byLabel = label
    ? base.filter((item) => (item[field] || "Tidak Diketahui") === label)
    : base;

  const ukpdMap = new Map();
  for (const item of byLabel) {
    const key = item.nama_ukpd || "Tidak Diketahui";
    if (!ukpdMap.has(key)) {
      ukpdMap.set(key, { nama_ukpd: key, wilayah: getPegawaiWilayah(item, ukpdList), total_pegawai: 0 });
    }
    ukpdMap.get(key).total_pegawai += 1;
  }
  const ukpdSummary = [...ukpdMap.values()].sort((a, b) => b.total_pegawai - a.total_pegawai || sortText(a.nama_ukpd, b.nama_ukpd));

  const employees = ukpd
    ? byLabel
      .filter((item) => item.nama_ukpd === ukpd)
      .sort((a, b) => sortText(a.nama, b.nama))
      .map((item) => mapEmployee(item, ukpdList))
    : [];

  return ok({
    type: type === "jabatan" ? "jabatan" : "rumpun",
    labels,
    selected: { label, ukpd },
    ukpdSummary,
    employees
  });
}
