"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Search, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import ErrorState from "@/components/ui/ErrorState";

const FIELD_LABELS = {
  nama: "Nama", nik: "NIK", nip: "NIP", nrk: "NRK", nama_ukpd: "UKPD",
  jenis_pegawai: "Jenis Pegawai", jenis_kontrak: "Jenis Kontrak", status_rumpun: "Status Rumpun",
  nama_jabatan_orb: "Jabatan Pergub 1 Tahun 2017", nama_jabatan_menpan: "Jabatan Kepmenpan 11",
  pangkat_golongan: "Pangkat/Golongan", kondisi: "Kondisi", wilayah: "Wilayah",
  tempat_lahir: "Tempat Lahir", tanggal_lahir: "Tanggal Lahir", jenis_kelamin: "Jenis Kelamin",
  agama: "Agama", jenjang_pendidikan: "Jenjang Pendidikan", program_studi: "Program Studi"
};

function labelFor(field) {
  return FIELD_LABELS[field] || field.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Jakarta"
  }).format(date);
}

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export default function PegawaiHistoryPage({ type }) {
  const isEdit = type === "update";
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ type, page: String(page), pageSize: String(pageSize), q: search });
        const response = await fetch(`/api/history/pegawai?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "Gagal memuat history.");
        if (!controller.signal.aborted) {
          setRows(payload.data?.rows || []);
          setTotal(payload.data?.total || 0);
        }
      } catch (loadError) {
        if (loadError.name !== "AbortError") setError(loadError.message || "Gagal memuat history.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [page, pageSize, search, type]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(page * pageSize, total);
  const title = isEdit ? "History Edit Pegawai" : "History Tambah Pegawai";
  const description = isEdit
    ? "Riwayat perubahan data pegawai beserta nilai sebelum dan sesudah."
    : "Riwayat pegawai yang ditambahkan ke dalam sistem.";
  const detailEntries = useMemo(() => Object.entries(detail?.changes || {}), [detail]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader title={title} description={description} />

      <section className="surface p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(query.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama, NIP, NRK, jabatan, jenis pegawai, UKPD, atau pengguna..."
            />
          </div>
          <button className="btn-primary h-11 px-5" type="submit">Cari</button>
        </form>
      </section>

      {error ? <ErrorState message={error} /> : (
        <section className="surface min-h-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] border-collapse text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Pegawai</th>
                  <th className="px-4 py-3">NIP / NRK</th>
                  <th className="px-4 py-3">Jabatan</th>
                  <th className="px-4 py-3">Jenis Pegawai</th>
                  <th className="px-4 py-3">UKPD</th>
                  <th className="px-4 py-3">{isEdit ? "Diedit oleh" : "Ditambahkan oleh"}</th>
                  {isEdit ? <th className="px-4 py-3">Perubahan</th> : null}
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  Array.from({ length: pageSize }).map((_, index) => (
                    <tr key={index}><td colSpan={isEdit ? 10 : 9} className="px-4 py-4"><div className="h-5 animate-pulse rounded bg-slate-100" /></td></tr>
                  ))
                ) : rows.length ? rows.map((item, index) => {
                  const changeCount = Object.keys(item.changes || {}).length;
                  return (
                    <tr key={item.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-3">{pageStart + index}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(item.created_at)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.nama}</td>
                      <td className="px-4 py-3"><div>{item.nip}</div><div className="text-xs text-slate-500">NRK {item.nrk}</div></td>
                      <td className="max-w-[280px] px-4 py-3">{item.jabatan}</td>
                      <td className="whitespace-nowrap px-4 py-3">{item.jenis_pegawai}</td>
                      <td className="max-w-[260px] px-4 py-3">{item.nama_ukpd}</td>
                      <td className="px-4 py-3"><div>{item.actor}</div><div className="text-xs text-slate-500">{item.actor_role}</div></td>
                      {isEdit ? (
                        <td className="px-4 py-3">
                          {changeCount ? `${changeCount} field diubah` : <span className="text-slate-500">Detail versi lama tidak tersedia</span>}
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          {item.id_pegawai ? (
                            <Link className="rounded-lg p-2 text-blue-700 hover:bg-blue-50" href={`/pegawai/${item.id_pegawai}`} title="Lihat profil"><Eye className="h-4 w-4" /></Link>
                          ) : null}
                          {isEdit ? (
                            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50" type="button" onClick={() => setDetail(item)}>Detail</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={isEdit ? 10 : 9} className="px-4 py-12 text-center text-slate-500">Belum ada data history.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">Menampilkan {pageStart}-{pageEnd} dari {total} data</div>
            <div className="flex items-center gap-2">
              <select className="h-9 rounded-lg border border-slate-300 px-2 text-sm" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / halaman</option>)}
              </select>
              <button className="rounded-lg border border-slate-300 p-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-20 text-center text-sm">Hal. {page}/{totalPages}</span>
              <button className="rounded-lg border border-slate-300 p-2 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </section>
      )}

      {detail ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}>
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div><div className="text-xs font-semibold uppercase text-blue-700">Detail Perubahan Pegawai</div><h2 className="mt-1 text-xl font-bold">{detail.nama}</h2><p className="mt-1 text-sm text-slate-500">{formatDateTime(detail.created_at)} · oleh {detail.actor}</p></div>
              <button className="rounded-lg p-2 hover:bg-slate-100" onClick={() => setDetail(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-6">
              {detailEntries.length ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-left"><tr><th className="px-4 py-3">Field</th><th className="px-4 py-3">Sebelum</th><th className="px-4 py-3">Sesudah</th></tr></thead>
                    <tbody className="divide-y divide-slate-200">
                      {detailEntries.map(([field, values]) => <tr key={field} className="align-top"><td className="px-4 py-3 font-semibold">{labelFor(field)}</td><td className="max-w-[300px] whitespace-pre-wrap px-4 py-3 text-rose-700">{valueOrDash(values.before)}</td><td className="max-w-[300px] whitespace-pre-wrap px-4 py-3 text-emerald-700">{valueOrDash(values.after)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              ) : <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Perubahan ini dibuat sebelum pencatatan detail nilai sebelum–sesudah diaktifkan.</div>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
