"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Edit, Eye, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import DataTable from "@/components/tables/DataTable";
import SearchFilterBar from "@/components/forms/SearchFilterBar";
import StatusBadge from "@/components/ui/StatusBadge";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import ErrorState from "@/components/ui/ErrorState";
import { WILAYAH } from "@/lib/constants/roles";
import { JENIS_PEGAWAI_OPTIONS } from "@/lib/helpers/pegawaiStatus";

function displayNip(item) {
  return item.nip || "-";
}

export default function PegawaiPage() {
  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [ukpdOptions, setUkpdOptions] = useState([]);
  const [jenisUkpdOptions, setJenisUkpdOptions] = useState([]);
  const [jabatanOptions, setJabatanOptions] = useState([]);
  const [rumpunOptions, setRumpunOptions] = useState([]);
  const [filterAccess, setFilterAccess] = useState({ canFilterWilayah: true, canFilterUkpd: true, canFilterJenisUkpd: true });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState("");
  const [wilayah, setWilayah] = useState("");
  const [jenisUkpd, setJenisUkpd] = useState("");
  const [ukpd, setUkpd] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [rumpun, setRumpun] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ status, wilayah, jenisUkpd, ukpd, jabatan, rumpun, page: String(page), pageSize: String(pageSize) });
    setLoading(true);
    setErrorMessage("");
    fetch(`/api/pegawai?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.success) throw new Error(payload?.message || "Data pegawai gagal dimuat.");
        const data = payload.data || {};
        setRows(data.rows || []);
        setTotalRows(data.total || 0);
        const filters = data.filters || {};
        setUkpdOptions(filters.ukpdOptions || []);
        setJenisUkpdOptions(filters.jenisUkpdOptions || []);
        setJabatanOptions(filters.jabatanOptions || []);
        setRumpunOptions(filters.rumpunOptions || []);
        setFilterAccess({
          canFilterWilayah: filters.canFilterWilayah !== false,
          canFilterUkpd: filters.canFilterUkpd !== false,
          canFilterJenisUkpd: filters.canFilterJenisUkpd !== false
        });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setRows([]);
          setTotalRows(0);
          setErrorMessage(error.message || "Data pegawai gagal dimuat.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, wilayah, jenisUkpd, ukpd, jabatan, rumpun, page, pageSize, refreshKey]);

  const maxPage = Math.max(1, Math.ceil(totalRows / pageSize));
  const hasActiveFilters = Boolean(status || wilayah || jenisUkpd || ukpd || jabatan || rumpun);

  async function removePegawai() {
    setDeleteLoading(true);
    try {
      const response = await fetch(`/api/pegawai/${deleteTarget.id_pegawai}`, { method: "DELETE" });
      const payload = await response.json();
      if (!payload?.success) {
        setErrorMessage(payload?.message || "Data pegawai gagal dihapus.");
        setDeleteTarget(null);
        return;
      }
      setRows((current) => current.filter((item) => item.id_pegawai !== deleteTarget.id_pegawai));
      setTotalRows((current) => Math.max(0, current - 1));
      setDeleteTarget(null);
    } catch (error) {
      setErrorMessage(error.message || "Data pegawai gagal dihapus.");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function exportPegawai() {
    setExportLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ status, wilayah, jenisUkpd, ukpd, jabatan, rumpun });
      const response = await fetch(`/api/pegawai/export?${params}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setErrorMessage(payload?.message || "Data pegawai gagal diekspor.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `data-pegawai-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error.message || "Data pegawai gagal diekspor.");
    } finally {
      setExportLoading(false);
    }
  }

  const columns = [
    { key: "nama", header: "Nama", width: 300 },
    { key: "nip", header: "NIP", width: 180, render: displayNip },
    { key: "nama_jabatan_orb", header: "Jabatan Pergub 1 Tahun 2017", width: 280, wrap: true },
    { key: "nama_jabatan_menpan", header: "Jabatan Kepmenpan 11", width: 280, wrap: true },
    { key: "status_rumpun", header: "Status Rumpun", width: 200, wrap: true },
    { key: "jenis_pegawai", header: "Status", width: 180, render: (item) => <StatusBadge status={item.jenis_pegawai} /> },
    { key: "nama_ukpd", header: "Nama UKPD", width: 260, wrap: true }
  ];

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:h-[calc(100vh-5.5rem)] lg:overflow-hidden">
      <PageHeader
        compact
        title="Data Pegawai"
        description=""
        breadcrumbs={[{ label: "Data Pegawai" }]}
        action={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button className="btn-secondary" type="button" onClick={exportPegawai} disabled={exportLoading}>
              <Download className="h-4 w-4" />
              {exportLoading ? "Mengekspor..." : "Export Excel"}
            </button>
            <Link className="btn-primary" href="/pegawai/new"><Plus className="h-4 w-4" /> Tambah Pegawai</Link>
          </div>
        }
      />
      <SearchFilterBar
        compact
        filters={[
          { name: "status", label: "Semua status", value: status, onChange: (value) => { setStatus(value); setPage(1); }, options: JENIS_PEGAWAI_OPTIONS },
          ...(filterAccess.canFilterWilayah ? [{ name: "wilayah", label: "Semua wilayah", value: wilayah, onChange: (value) => { setWilayah(value); setPage(1); }, options: WILAYAH }] : []),
          ...(filterAccess.canFilterJenisUkpd ? [{ name: "jenisUkpd", label: "Semua jenis UKPD", value: jenisUkpd, onChange: (value) => { setJenisUkpd(value); setPage(1); }, options: jenisUkpdOptions }] : []),
          ...(filterAccess.canFilterUkpd ? [{ name: "ukpd", label: "Semua UKPD", value: ukpd, onChange: (value) => { setUkpd(value); setPage(1); }, options: ukpdOptions }] : []),
          { name: "jabatan", label: "Semua jabatan", value: jabatan, onChange: (value) => { setJabatan(value); setPage(1); }, options: jabatanOptions },
          { name: "rumpun", label: "Semua rumpun jabatan", value: rumpun, onChange: (value) => { setRumpun(value); setPage(1); }, options: rumpunOptions }
        ]}
        actions={hasActiveFilters ? (
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              setStatus("");
              setWilayah("");
              setJenisUkpd("");
              setUkpd("");
              setJabatan("");
              setRumpun("");
              setPage(1);
            }}
          >
            Reset
          </button>
        ) : null}
      />
      {loading ? (
        <div className="min-h-0 flex-1 animate-pulse rounded-lg bg-white" />
      ) : errorMessage ? (
        <ErrorState description={errorMessage} onRetry={() => setRefreshKey((value) => value + 1)} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <DataTable
            columns={columns}
            data={rows}
            rowKey="id_pegawai"
            showNumber
            startNumber={(page - 1) * pageSize + 1}
            actionWidth={150}
            fillHeight
            compact
            actions={(item) => (
              <div className="flex items-center justify-end gap-1 sm:gap-2">
                <Link className="rounded-lg p-2 text-dinkes-700 hover:bg-dinkes-50 focus-ring" href={`/pegawai/${item.id_pegawai}`} aria-label="Lihat profil" title="Lihat profil"><Eye className="h-4 w-4" /></Link>
                <Link className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus-ring" href={`/pegawai/${item.id_pegawai}/edit`} aria-label="Edit" title="Edit"><Edit className="h-4 w-4" /></Link>
                <button className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 focus-ring" onClick={() => setDeleteTarget(item)} aria-label="Hapus" title="Hapus"><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          />
          <footer className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <span>Menampilkan {rows.length} dari {totalRows} pegawai</span>
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
              <label className="flex items-center gap-2">
                <span>Per halaman</span>
                <select
                  className="input w-24 py-2"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  {[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <button className="btn-secondary px-3 py-2" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</button>
              <span className="min-w-[7rem] rounded-lg bg-slate-50 px-3 py-2 text-center font-bold text-slate-800">Hal {page} / {maxPage}</span>
              <button className="btn-secondary px-3 py-2" disabled={page === maxPage} onClick={() => setPage((value) => Math.min(maxPage, value + 1))}>Berikutnya</button>
            </div>
          </footer>
        </div>
      )}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="Hapus data pegawai?"
        description={`Data ${deleteTarget?.nama || ""} akan dihapus dari database.`}
        loading={deleteLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={removePegawai}
      />
    </div>
  );
}
