"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, ChevronLeft, ChevronRight, ClipboardCheck, Download, Pencil, Plus, Search, Trash2, UserCheck, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import DataTable from "@/components/tables/DataTable";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import ErrorState from "@/components/ui/ErrorState";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const EMPTY_PLT_FORM = {
  jenis_penugasan: "PLT",
  nrk: "",
  ukpd_tujuan: "",
  jabatan_tujuan: "",
  mulai_penugasan: "",
  selesai_penugasan: ""
};
const TABS = [
  { id: "existing", label: "Jabatan Eksisting", icon: BriefcaseBusiness },
  { id: "PLT", label: "PLT", icon: ClipboardCheck },
  { id: "PLH", label: "PLH", icon: UserCheck }
];

function valueOrDash(value) {
  return value || "-";
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "-";
  const dateOnly = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function daysUntil(value) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function expiryTone(value) {
  const remainingDays = daysUntil(value);
  if (remainingDays === null) return "none";
  if (remainingDays < 7) return "danger";
  if (remainingDays < 30) return "warning";
  return "none";
}

function ExpiryDate({ value }) {
  const tone = expiryTone(value);
  const className = tone === "danger"
    ? "inline-flex rounded-md bg-rose-50 px-2 py-1 font-semibold text-rose-700 ring-1 ring-rose-200"
    : tone === "warning"
      ? "inline-flex rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800 ring-1 ring-amber-200"
      : "";
  return <span className={className}>{formatDate(value)}</span>;
}

function cleanNrk(value) {
  return String(value || "").trim().replace(/\D/g, "");
}

function LoadingRows() {
  return (
    <section className="surface min-h-0 flex-1 overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="grid gap-4 p-4 md:grid-cols-[64px_1fr_1fr_1.2fr_0.8fr_0.7fr_0.8fr_0.7fr]">
            <div className="h-5 animate-pulse rounded bg-slate-100" />
            <div className="h-5 animate-pulse rounded bg-slate-100" />
            <div className="h-5 animate-pulse rounded bg-slate-100" />
            <div className="h-5 animate-pulse rounded bg-slate-100" />
            <div className="h-5 animate-pulse rounded bg-slate-100" />
            <div className="h-5 animate-pulse rounded bg-slate-100" />
            <div className="h-5 animate-pulse rounded bg-slate-100" />
            <div className="h-5 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PejabatPage() {
  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [wilayahOptions, setWilayahOptions] = useState([]);
  const [jenisUkpdOptions, setJenisUkpdOptions] = useState([]);
  const [ukpdOptions, setUkpdOptions] = useState([]);
  const [rumpunOptions, setRumpunOptions] = useState([]);
  const [wilayah, setWilayah] = useState("");
  const [jenisUkpd, setJenisUkpd] = useState("");
  const [ukpd, setUkpd] = useState("");
  const [rumpun, setRumpun] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportLoading, setExportLoading] = useState(false);
  const [pltRows, setPltRows] = useState([]);
  const [pltOptions, setPltOptions] = useState({ ukpdOptions: [], jabatanOptions: [] });
  const [pltForm, setPltForm] = useState(EMPTY_PLT_FORM);
  const [pegawaiLookup, setPegawaiLookup] = useState(null);
  const [pegawaiLookupLoading, setPegawaiLookupLoading] = useState(false);
  const [pltLoading, setPltLoading] = useState(true);
  const [pltSaving, setPltSaving] = useState(false);
  const [pltErrorMessage, setPltErrorMessage] = useState("");
  const [pltRefreshKey, setPltRefreshKey] = useState(0);
  const [pltPeriodeMulai, setPltPeriodeMulai] = useState("");
  const [pltPeriodeAkhir, setPltPeriodeAkhir] = useState("");
  const [pltSearch, setPltSearch] = useState("");
  const [activeTab, setActiveTab] = useState("existing");
  const [pltModalOpen, setPltModalOpen] = useState(false);
  const [editingPltItem, setEditingPltItem] = useState(null);
  const [deletePltTarget, setDeletePltTarget] = useState(null);
  const [deletePltLoading, setDeletePltLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadData() {
      setLoading(true);
      setErrorMessage("");
      try {
        const params = new URLSearchParams({
          wilayah,
          jenisUkpd,
          ukpd,
          rumpun,
          page: String(page),
          pageSize: String(pageSize)
        });
        const response = await fetch(`/api/pejabat?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "Gagal memuat data pejabat.");
        const data = payload.data || {};
        if (!controller.signal.aborted) {
          setRows(data.rows || []);
          setTotalRows(data.total || 0);
          const filters = data.filters || {};
          setWilayahOptions(filters.wilayahOptions || []);
          setJenisUkpdOptions(filters.jenisUkpdOptions || []);
          setUkpdOptions(filters.ukpdOptions || []);
          setRumpunOptions(filters.rumpunOptions || []);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setRows([]);
          setTotalRows(0);
          setErrorMessage(error.message || "Gagal memuat data pejabat.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, [jenisUkpd, page, pageSize, refreshKey, rumpun, ukpd, wilayah]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadPltData() {
      setPltLoading(true);
      setPltErrorMessage("");
      try {
        const params = new URLSearchParams();
        if (wilayah) params.set("wilayah", wilayah);
        if (jenisUkpd) params.set("jenisUkpd", jenisUkpd);
        if (ukpd) params.set("ukpd", ukpd);
        if (rumpun) params.set("rumpun", rumpun);
        if (pltPeriodeMulai) params.set("periodeMulai", pltPeriodeMulai);
        if (pltPeriodeAkhir) params.set("periodeAkhir", pltPeriodeAkhir);
        if (pltSearch.trim()) params.set("q", pltSearch.trim());
        const query = params.toString();
        const response = await fetch(`/api/pejabat/plt-plh${query ? `?${query}` : ""}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "Gagal memuat data PLT/PLH.");
        const data = payload.data || {};
        if (!controller.signal.aborted) {
          setPltRows(data.rows || []);
          setPltOptions(data.options || { ukpdOptions: [], jabatanOptions: [] });
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setPltRows([]);
          setPltErrorMessage(error.message || "Gagal memuat data PLT/PLH.");
        }
      } finally {
        if (!controller.signal.aborted) setPltLoading(false);
      }
    }

    loadPltData();
    return () => controller.abort();
  }, [jenisUkpd, pltPeriodeAkhir, pltPeriodeMulai, pltRefreshKey, pltSearch, rumpun, ukpd, wilayah]);

  const columns = useMemo(() => [
    { key: "nama", header: "Nama Pegawai", width: 220, render: (item) => valueOrDash(item.nama) },
    { key: "nama_ukpd", header: "Nama UKPD", width: 230, wrap: true, render: (item) => valueOrDash(item.nama_ukpd) },
    { key: "nama_jabatan_orb", header: "Jabatan Pergub 1 Tahun 2017", width: 260, wrap: true, render: (item) => valueOrDash(item.nama_jabatan_orb) },
    { key: "nama_jabatan_menpan", header: "Jabatan Kepmenpan 11", width: 260, wrap: true, render: (item) => valueOrDash(item.nama_jabatan_menpan) },
    { key: "status_rumpun", header: "Status Rumpun", width: 190, wrap: true, render: (item) => valueOrDash(item.status_rumpun) },
    { key: "pendidikan", header: "Pendidikan", width: 130, render: (item) => valueOrDash(item.pendidikan) },
    { key: "pangkat_golongan", header: "Pangkat/Golongan", width: 180, render: (item) => valueOrDash(item.pangkat_golongan) },
    {
      key: "no_hp_pegawai",
      header: "No HP",
      width: 140,
      render: (item) => item.no_hp_pegawai ? (
        <a className="font-semibold text-dinkes-800 hover:text-dinkes-700" href={`tel:${item.no_hp_pegawai}`}>
          {item.no_hp_pegawai}
        </a>
      ) : "-"
    }
  ], []);
  const pltColumns = useMemo(() => [
    { key: "nama_pejabat", header: "Nama", width: 150, wrap: true, render: (item) => valueOrDash(item.nama_pejabat) },
    { key: "pangkat_golongan", header: "Gol", width: 78, wrap: true, render: (item) => valueOrDash(item.pangkat_golongan) },
    { key: "jabatan_saat_ini", header: "Jabatan Saat Ini", width: 160, wrap: true, render: (item) => valueOrDash(item.jabatan_saat_ini) },
    { key: "ukpd_asal", header: "UKPD Saat Ini", width: 130, wrap: true, render: (item) => valueOrDash(item.ukpd_asal) },
    { key: "ukpd_tujuan", header: `UKPD ${activeTab}`, width: 130, wrap: true, render: (item) => valueOrDash(item.ukpd_tujuan) },
    { key: "jabatan_tujuan", header: `Jabatan ${activeTab}`, width: 165, wrap: true, render: (item) => valueOrDash(item.jabatan_tujuan) },
    { key: "mulai_penugasan", header: "Mulai", width: 92, render: (item) => formatDate(item.mulai_penugasan) },
    { key: "selesai_penugasan", header: "Berakhir", width: 98, render: (item) => <ExpiryDate value={item.selesai_penugasan} /> }
  ], [activeTab]);
  const selectedPegawai = useMemo(() => {
    const formNrk = cleanNrk(pltForm.nrk);
    if (pegawaiLookup && cleanNrk(pegawaiLookup.nrk) === formNrk) return pegawaiLookup;
    if (editingPltItem && cleanNrk(editingPltItem.nrk) === formNrk) {
      return {
        ...editingPltItem,
        nama: editingPltItem.nama_pejabat,
        nama_ukpd: editingPltItem.ukpd_asal
      };
    }
    return null;
  }, [editingPltItem, pegawaiLookup, pltForm.nrk]);
  const selectedJabatanSaatIni = selectedPegawai?.jabatan_saat_ini || "";
  const activePltRows = useMemo(
    () => pltRows
      .filter((item) => item.jenis_penugasan === activeTab)
      .toSorted((a, b) => {
        const aDays = daysUntil(a.selesai_penugasan);
        const bDays = daysUntil(b.selesai_penugasan);
        if (aDays === null && bDays === null) return 0;
        if (aDays === null) return 1;
        if (bDays === null) return -1;
        return aDays - bDays;
      }),
    [activeTab, pltRows]
  );
  const pltKpi = useMemo(() => ({
    PLT: pltRows.filter((item) => item.jenis_penugasan === "PLT").length,
    PLH: pltRows.filter((item) => item.jenis_penugasan === "PLH").length
  }), [pltRows]);
  const maxPage = Math.max(1, Math.ceil(totalRows / pageSize));
  const startRow = totalRows ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, totalRows);
  const hasActiveFilters = Boolean(wilayah || jenisUkpd || ukpd || rumpun);
  const hasActivePltFilters = Boolean(wilayah || jenisUkpd || ukpd || rumpun || pltPeriodeMulai || pltPeriodeAkhir || pltSearch.trim());

  async function exportPejabat() {
    setExportLoading(true);
    setErrorMessage("");
    setPltErrorMessage("");
    try {
      const params = new URLSearchParams({ wilayah, jenisUkpd, ukpd, rumpun });
      let endpoint = "/api/pejabat/export";
      let filename = `data-pejabat-${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (activeTab !== "existing") {
        endpoint = "/api/pejabat/plt-plh/export";
        params.set("jenis", activeTab);
        if (pltPeriodeMulai) params.set("periodeMulai", pltPeriodeMulai);
        if (pltPeriodeAkhir) params.set("periodeAkhir", pltPeriodeAkhir);
        if (pltSearch.trim()) params.set("q", pltSearch.trim());
        filename = `data-${activeTab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      }
      const query = params.toString();
      const response = await fetch(`${endpoint}${query ? `?${query}` : ""}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.message || `Data ${activeTab === "existing" ? "pejabat" : activeTab} gagal diekspor.`;
        if (activeTab === "existing") setErrorMessage(message);
        else setPltErrorMessage(message);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error.message || `Data ${activeTab === "existing" ? "pejabat" : activeTab} gagal diekspor.`;
      if (activeTab === "existing") setErrorMessage(message);
      else setPltErrorMessage(message);
    } finally {
      setExportLoading(false);
    }
  }

  function openCreatePltPlh() {
    const defaultType = activeTab === "PLH" ? "PLH" : "PLT";
    setEditingPltItem(null);
    setPegawaiLookup(null);
    setPltForm({ ...EMPTY_PLT_FORM, jenis_penugasan: defaultType });
    setPltErrorMessage("");
    setPltModalOpen(true);
  }

  function openEditPltPlh(item) {
    setEditingPltItem(item);
    setPegawaiLookup({
      id_pegawai: item.id_pegawai,
      nrk: item.nrk || "",
      nip: item.nip || "",
      nama: item.nama_pejabat || "",
      nama_ukpd: item.ukpd_asal || "",
      jabatan_saat_ini: item.jabatan_saat_ini || "",
      pangkat_golongan: item.pangkat_golongan || ""
    });
    setPltForm({
      jenis_penugasan: item.jenis_penugasan || "PLT",
      nrk: item.nrk || "",
      ukpd_tujuan: item.ukpd_tujuan === "-" ? "" : item.ukpd_tujuan || "",
      jabatan_tujuan: item.jabatan_tujuan === "-" ? "" : item.jabatan_tujuan || "",
      mulai_penugasan: item.mulai_penugasan || "",
      selesai_penugasan: item.selesai_penugasan || ""
    });
    setPltErrorMessage("");
    setPltModalOpen(true);
  }

  function closePltModal(force = false) {
    if (pltSaving && !force) return;
    setPltModalOpen(false);
    setEditingPltItem(null);
    setPltForm(EMPTY_PLT_FORM);
    setPegawaiLookup(null);
    setPegawaiLookupLoading(false);
    setPltErrorMessage("");
  }

  async function searchPegawaiByNrk() {
    const nrk = cleanNrk(pltForm.nrk);
    if (!nrk) {
      setPegawaiLookup(null);
      setPltErrorMessage("Isi NRK pegawai terlebih dahulu.");
      return;
    }

    setPegawaiLookupLoading(true);
    setPltErrorMessage("");
    try {
      const response = await fetch(`/api/pejabat/plt-plh?nrk=${encodeURIComponent(nrk)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Pegawai dengan NRK tersebut tidak ditemukan.");
      }
      const pegawai = payload.data?.pegawai || null;
      if (!pegawai) throw new Error("Pegawai dengan NRK tersebut tidak ditemukan.");
      setPegawaiLookup(pegawai);
      setPltForm((current) => ({ ...current, nrk: pegawai.nrk || nrk }));
    } catch (error) {
      setPegawaiLookup(null);
      setPltErrorMessage(error.message || "Pegawai dengan NRK tersebut tidak ditemukan.");
    } finally {
      setPegawaiLookupLoading(false);
    }
  }

  async function savePltPlh(event) {
    event.preventDefault();
    if (!selectedPegawai) {
      setPltErrorMessage("Cari pegawai berdasarkan NRK terlebih dahulu.");
      return;
    }

    setPltSaving(true);
    setPltErrorMessage("");
    try {
      const method = editingPltItem ? "PUT" : "POST";
      const response = await fetch("/api/pejabat/plt-plh", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingPltItem ? { ...pltForm, id: editingPltItem.id } : pltForm)
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Data PLT/PLH gagal disimpan.");
      }
      closePltModal(true);
      setActiveTab(pltForm.jenis_penugasan);
      setPltRefreshKey((value) => value + 1);
    } catch (error) {
      setPltErrorMessage(error.message || "Data PLT/PLH gagal disimpan.");
    } finally {
      setPltSaving(false);
    }
  }

  async function deletePltPlh() {
    if (!deletePltTarget) return;
    setDeletePltLoading(true);
    setPltErrorMessage("");
    try {
      const response = await fetch(`/api/pejabat/plt-plh?id=${encodeURIComponent(deletePltTarget.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Data PLT/PLH gagal dihapus.");
      }
      setDeletePltTarget(null);
      setPltRefreshKey((value) => value + 1);
    } catch (error) {
      setPltErrorMessage(error.message || "Data PLT/PLH gagal dihapus.");
    } finally {
      setDeletePltLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:h-[calc(100vh-5.5rem)] lg:overflow-hidden">
      <PageHeader
        title="Data Pejabat"
        breadcrumbs={[{ label: "Data Pejabat" }]}
        action={(
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button className="btn-secondary" type="button" onClick={exportPejabat} disabled={exportLoading}>
              <Download className="h-4 w-4" />
              {exportLoading ? "Mengekspor..." : "Export Excel"}
            </button>
            <button className="btn-primary" type="button" onClick={openCreatePltPlh}>
              <Plus className="h-4 w-4" />
              Tambah PLT/PLH
            </button>
          </div>
        )}
      />

      <section className="surface flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-dinkes-50 text-dinkes-800 ring-1 ring-dinkes-100">
              <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total Pejabat</p>
              <p className="text-xl font-extrabold text-slate-950">{formatNumber(totalRows)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">PLT Aktif</p>
              <p className="text-xl font-extrabold text-slate-950">{formatNumber(pltKpi.PLT)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">PLH Aktif</p>
              <p className="text-xl font-extrabold text-slate-950">{formatNumber(pltKpi.PLH)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-dinkes-900/15 bg-white shadow-sm">
        <nav className="flex gap-1 overflow-x-auto bg-dinkes-800 px-3 py-1.5" aria-label="Jenis data pejabat">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-white transition focus-ring ${isActive ? "border-govgold-300 bg-dinkes-600" : "border-transparent hover:bg-white/10"}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </section>

      {activeTab === "existing" ? (
      <section className="surface p-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(180px,1fr))_auto] xl:items-end">
          <label className="grid gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Filter Wilayah</span>
            <select
              className="input"
              value={wilayah}
              onChange={(event) => {
                setWilayah(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Wilayah</option>
              {wilayahOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Filter Jenis UKPD</span>
            <select
              className="input"
              value={jenisUkpd}
              onChange={(event) => {
                setJenisUkpd(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Jenis UKPD</option>
              {jenisUkpdOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Filter UKPD</span>
            <select
              className="input"
              value={ukpd}
              onChange={(event) => {
                setUkpd(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua UKPD</option>
              {ukpdOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Filter Rumpun Jabatan</span>
            <select
              className="input"
              value={rumpun}
              onChange={(event) => {
                setRumpun(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Rumpun Jabatan</option>
              {rumpunOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          {hasActiveFilters ? (
            <button
              className="btn-secondary xl:w-fit"
              type="button"
              onClick={() => {
                setWilayah("");
                setJenisUkpd("");
                setUkpd("");
                setRumpun("");
                setPage(1);
              }}
            >
              Reset
            </button>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeTab !== "existing" ? (
        <section className="surface p-3">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Wilayah</span>
                <select
                  className="input"
                  value={wilayah}
                  onChange={(event) => setWilayah(event.target.value)}
                >
                  <option value="">Semua Wilayah</option>
                  {wilayahOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Jenis UKPD</span>
                <select
                  className="input"
                  value={jenisUkpd}
                  onChange={(event) => setJenisUkpd(event.target.value)}
                >
                  <option value="">Semua Jenis UKPD</option>
                  {jenisUkpdOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">UKPD</span>
                <select
                  className="input"
                  value={ukpd}
                  onChange={(event) => setUkpd(event.target.value)}
                >
                  <option value="">Semua UKPD</option>
                  {ukpdOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Rumpun Jabatan</span>
                <select
                  className="input"
                  value={rumpun}
                  onChange={(event) => setRumpun(event.target.value)}
                >
                  <option value="">Semua Rumpun Jabatan</option>
                  {rumpunOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(160px,220px)_minmax(160px,220px)_minmax(320px,1fr)_auto] xl:items-end">
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Periode Mulai</span>
                <input
                  className="input"
                  type="date"
                  value={pltPeriodeMulai}
                  onChange={(event) => setPltPeriodeMulai(event.target.value)}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Periode Akhir</span>
                <input
                  className="input"
                  type="date"
                  value={pltPeriodeAkhir}
                  onChange={(event) => setPltPeriodeAkhir(event.target.value)}
                />
              </label>
              <label className="grid gap-2 md:col-span-2 xl:col-span-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cari Riwayat {activeTab}</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    className="input pl-9"
                    value={pltSearch}
                    onChange={(event) => setPltSearch(event.target.value)}
                    placeholder="Cari nama, jabatan, atau UKPD"
                  />
                </div>
              </label>
              <button
                className="btn-secondary justify-center md:w-fit xl:w-auto"
                type="button"
                disabled={!hasActivePltFilters}
                onClick={() => {
                  setWilayah("");
                  setJenisUkpd("");
                  setUkpd("");
                  setRumpun("");
                  setPltPeriodeMulai("");
                  setPltPeriodeAkhir("");
                  setPltSearch("");
                }}
              >
                Reset
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">
            {hasActivePltFilters ? `Menampilkan ${activeTab} yang masa aktifnya beririsan dengan rentang tanggal yang dipilih.` : `Menampilkan ${activeTab} yang masih aktif sampai hari ini.`}
          </p>
        </section>
      ) : null}

      {activeTab === "existing" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {loading ? <LoadingRows /> : null}
          {!loading && errorMessage ? (
            <ErrorState description={errorMessage} onRetry={() => setRefreshKey((value) => value + 1)} />
          ) : null}
          {!loading && !errorMessage ? (
            <>
              <DataTable
                columns={columns}
                data={rows}
                rowKey="id_pegawai"
                showNumber
                startNumber={(page - 1) * pageSize + 1}
                fillHeight
                compact
              />
              <footer className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm md:flex-row md:items-center md:justify-between">
                <div>
                  Menampilkan <span className="font-bold text-slate-900">{formatNumber(startRow)}-{formatNumber(endRow)}</span> dari <span className="font-bold text-slate-900">{formatNumber(totalRows)}</span> pejabat.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="input w-24 py-2"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                  <button className="btn-secondary px-3 py-2" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-24 text-center font-bold text-slate-800">Hal {page} / {maxPage}</span>
                  <button className="btn-secondary px-3 py-2" type="button" onClick={() => setPage((value) => Math.min(maxPage, value + 1))} disabled={page >= maxPage}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </footer>
            </>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {!pltModalOpen && pltErrorMessage ? <ErrorState description={pltErrorMessage} onRetry={() => setPltRefreshKey((value) => value + 1)} /> : null}
          {pltLoading ? (
            <section className="surface min-h-0 flex-1 animate-pulse" />
          ) : (
            <DataTable
              columns={pltColumns}
              data={activePltRows}
              rowKey="id"
              showNumber
              actionWidth={86}
              fitToWidth
              fillHeight
              compact
              actions={(item) => (
                <div className="flex items-center justify-center gap-1">
                  <button className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100 focus-ring" type="button" onClick={() => openEditPltPlh(item)} aria-label="Edit PLT/PLH" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 focus-ring" type="button" onClick={() => setDeletePltTarget(item)} aria-label="Hapus PLT/PLH" title="Hapus">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            />
          )}
        </div>
      )}

      {pltModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid items-end bg-slate-950/40 px-3 pb-3 sm:place-items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePltModal();
          }}
        >
          <article className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-label={editingPltItem ? "Edit PLT/PLH" : "Tambah PLT/PLH"}>
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">{editingPltItem ? "Edit PLT/PLH" : "Tambah PLT/PLH"}</h2>
                <p className="mt-1 text-sm text-slate-500">Cari pegawai dengan NRK, lalu isi UKPD tujuan, jabatan tujuan, dan masa berlaku penugasan.</p>
              </div>
              <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-ring" type="button" onClick={() => closePltModal()} aria-label="Tutup popup" disabled={pltSaving}>
                <X className="h-5 w-5" />
              </button>
            </header>

            <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={savePltPlh}>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Jenis</span>
                <select
                  className="input"
                  value={pltForm.jenis_penugasan}
                  onChange={(event) => setPltForm((current) => ({ ...current, jenis_penugasan: event.target.value }))}
                  required
                >
                  <option value="PLT">PLT</option>
                  <option value="PLH">PLH</option>
                </select>
              </label>
              <div className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cari Pegawai Berdasarkan NRK</span>
                <div className="flex gap-2">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={pltForm.nrk}
                    onChange={(event) => {
                      const nrk = cleanNrk(event.target.value);
                      setPltForm((current) => ({ ...current, nrk }));
                      if (cleanNrk(pegawaiLookup?.nrk) !== nrk) setPegawaiLookup(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        searchPegawaiByNrk();
                      }
                    }}
                    placeholder="Masukkan NRK"
                    required
                  />
                  <button className="btn-secondary shrink-0 px-3" type="button" onClick={searchPegawaiByNrk} disabled={pegawaiLookupLoading || pltSaving}>
                    <Search className="h-4 w-4" />
                    {pegawaiLookupLoading ? "Mencari..." : "Cari"}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 md:col-span-2 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Nama Pegawai</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{valueOrDash(selectedPegawai?.nama || selectedPegawai?.nama_pejabat)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">NIP</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{valueOrDash(selectedPegawai?.nip)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pangkat/Golongan</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{valueOrDash(selectedPegawai?.pangkat_golongan)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">UKPD Saat Ini</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{valueOrDash(selectedPegawai?.nama_ukpd || selectedPegawai?.ukpd_asal)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Jabatan Saat Ini</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{valueOrDash(selectedJabatanSaatIni)}</p>
                </div>
              </div>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">UKPD PLT/PLH</span>
                <select
                  className="input"
                  value={pltForm.ukpd_tujuan}
                  onChange={(event) => setPltForm((current) => ({ ...current, ukpd_tujuan: event.target.value }))}
                  required
                >
                  <option value="">Pilih UKPD Tujuan</option>
                  {(pltOptions.ukpdOptions || []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Jabatan PLT/PLH</span>
                <input
                  className="input"
                  list="jabatan-plt-plh-options"
                  value={pltForm.jabatan_tujuan}
                  onChange={(event) => setPltForm((current) => ({ ...current, jabatan_tujuan: event.target.value }))}
                  placeholder="Jabatan UKPD tujuan"
                  required
                />
                <datalist id="jabatan-plt-plh-options">
                  {(pltOptions.jabatanOptions || []).map((option) => <option key={option} value={option} />)}
                </datalist>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mulai PLT/PLH</span>
                <input
                  className="input"
                  type="date"
                  value={pltForm.mulai_penugasan}
                  onChange={(event) => setPltForm((current) => ({ ...current, mulai_penugasan: event.target.value }))}
                  required
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Selesai PLT/PLH</span>
                <input
                  className="input"
                  type="date"
                  value={pltForm.selesai_penugasan}
                  onChange={(event) => setPltForm((current) => ({ ...current, selesai_penugasan: event.target.value }))}
                  required
                />
              </label>
              {pltErrorMessage ? <p className="md:col-span-2 text-sm font-semibold text-rose-600">{pltErrorMessage}</p> : null}
              <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 md:col-span-2 sm:flex-row sm:justify-end">
                <button className="btn-secondary" type="button" onClick={() => closePltModal()} disabled={pltSaving}>Batal</button>
                <button className="btn-primary" type="submit" disabled={pltSaving}>
                  {pltSaving ? "Menyimpan..." : editingPltItem ? "Simpan Perubahan" : "Simpan"}
                </button>
              </footer>
            </form>
          </article>
        </div>
      ) : null}

      <ConfirmDeleteModal
        open={Boolean(deletePltTarget)}
        title="Hapus PLT/PLH"
        description={`Hapus data ${deletePltTarget?.jenis_penugasan || "PLT/PLH"} ${deletePltTarget?.nama_pejabat || ""}? Data yang dihapus tidak akan tampil lagi di riwayat pejabat.`}
        loading={deletePltLoading}
        loadingLabel="Menghapus..."
        onCancel={() => {
          if (!deletePltLoading) setDeletePltTarget(null);
        }}
        onConfirm={deletePltPlh}
      />
    </div>
  );
}
