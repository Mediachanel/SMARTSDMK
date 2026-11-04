import { normalizeJenisPegawai } from "@/lib/helpers/pegawaiStatus";

const statusStyles = {
  Aktif: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PNS: "bg-dinkes-50 text-dinkes-700 ring-dinkes-200",
  CPNS: "bg-sky-50 text-sky-700 ring-sky-200",
  PPPK: "bg-govgold-50 text-govgold-700 ring-govgold-300",
  "PPPK Paruh Waktu": "bg-amber-50 text-amber-700 ring-amber-200",
  "NON PNS": "bg-slate-100 text-slate-700 ring-slate-200",
  PJLP: "bg-violet-50 text-violet-700 ring-violet-200",
  Diajukan: "bg-amber-50 text-amber-700 ring-amber-200",
  Diusulkan: "bg-amber-50 text-amber-700 ring-amber-200",
  "Verifikasi Sudin": "bg-sky-50 text-sky-700 ring-sky-200",
  "Diterima Dinas": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "Verifikasi Dinas": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Dikembalikan: "bg-orange-50 text-orange-700 ring-orange-200",
  Verifikasi: "bg-sky-50 text-sky-700 ring-sky-200",
  Diproses: "bg-sky-50 text-sky-700 ring-sky-200",
  Selesai: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Ditolak: "bg-rose-50 text-rose-700 ring-rose-200"
};

const statusDots = {
  Aktif: "bg-emerald-600",
  PNS: "bg-dinkes-700",
  CPNS: "bg-sky-600",
  PPPK: "bg-govgold-700",
  "PPPK Paruh Waktu": "bg-amber-600",
  "NON PNS": "bg-slate-500",
  PJLP: "bg-violet-600",
  Diajukan: "bg-amber-600",
  Diusulkan: "bg-amber-600",
  "Verifikasi Sudin": "bg-sky-600",
  "Diterima Dinas": "bg-indigo-600",
  "Verifikasi Dinas": "bg-cyan-700",
  Dikembalikan: "bg-orange-600",
  Verifikasi: "bg-sky-600",
  Diproses: "bg-blue-700",
  Selesai: "bg-emerald-600",
  Ditolak: "bg-rose-600"
};

function normalizeUsulanStatus(status) {
  const value = String(status || "").trim();
  const lower = value.toLowerCase();
  if (lower === "selesai") return "Selesai";
  if (lower === "ditolak") return "Ditolak";
  if (lower === "dikembalikan") return "Dikembalikan";
  if (lower === "diproses") return "Diproses";
  if (lower === "verifikasi sudin") return "Verifikasi Sudin";
  if (lower === "diterima dinas") return "Diterima Dinas";
  if (lower === "verifikasi dinas") return "Verifikasi Dinas";
  if (lower === "diusulkan" || lower === "diajukan") return "Diusulkan";
  return value;
}

export default function StatusBadge({ status }) {
  const normalized = statusStyles[normalizeUsulanStatus(status)]
    ? normalizeUsulanStatus(status)
    : normalizeJenisPegawai(status);
  const label = statusStyles[normalized] ? normalized : status;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyles[normalized] || statusStyles[status] || "bg-slate-100 text-slate-700 ring-slate-200"}`} aria-label={`Status ${label || "-"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusDots[normalized] || statusDots[status] || "bg-slate-500"}`} aria-hidden="true" />
      {label || "-"}
    </span>
  );
}
