"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Download,
  FolderArchive,
  Hash,
  LoaderCircle,
  Plus,
  Save,
  Send,
  Search,
  Trash2,
  UploadCloud,
  UserRoundCheck,
  X,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import PdfDocumentPreview from "@/components/ui/PdfDocumentPreview";
import { ROLES } from "@/lib/constants/roles";
import { CPNS_PNS_DOCUMENT_MAX_BYTES } from "@/lib/usulan/cpnsPns";

const EMPTY = {
  items: [],
  candidates: [],
  documentLabels: {},
  statuses: [],
  cpnsSummary: { total: 0, notSubmitted: 0 },
  user: {},
};
async function json(response, fallback) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success)
    throw new Error(payload?.message || fallback);
  return payload;
}
function tone(status) {
  if (
    [
      "Terverifikasi Admin UKPD",
      "Direkap Dinkes",
      "Diusulkan ke BKD",
      "Selesai",
    ].includes(status)
  )
    return "bg-emerald-100 text-emerald-800";
  if (status === "Dikembalikan ke CPNS") return "bg-rose-100 text-rose-800";
  if (status === "Diajukan ke Admin UKPD") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
}

export default function CpnsPnsPage() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState({ type: "", text: "" });
  const [filters, setFilters] = useState({ q: "", tahap: "", status: "", ukpd: "" });
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState("");

  async function load() {
    setLoading(true);
    try {
      const payload = await json(
        await fetch("/api/usulan/cpns-pns", { cache: "no-store" }),
        "Data gagal dimuat.",
      );
      setData(payload.data);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const selected = data.items.find((item) => item.id === selectedId);
  const canVerify = data.user.role === ROLES.ADMIN_UKPD;
  const canSubmit = data.user.role === ROLES.CPNS;
  const canRecap = data.user.role === ROLES.SUPER_ADMIN;
  const ukpds = useMemo(
    () =>
      [...new Set(data.items.map((item) => item.nama_ukpd))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "id")),
    [data.items],
  );
  const rows = useMemo(
    () =>
      data.items.filter((item) => {
        const q = filters.q.toLowerCase();
        return (
          (!q ||
            [item.nama_pegawai, item.nip, item.nrk, item.nama_ukpd].some(
              (value) =>
                String(value || "")
                  .toLowerCase()
                  .includes(q),
            )) &&
          (!filters.status || item.status === filters.status) &&
          (!filters.tahap || String(item.tahap) === filters.tahap) &&
          (!filters.ukpd || item.nama_ukpd === filters.ukpd)
        );
      }),
    [data.items, filters],
  );
  const complete = data.items.filter(
    (item) => item.progress.uploaded === item.progress.total,
  ).length;
  const submittedToAdminUkpd = data.items.filter(
    (item) => item.status === "Diajukan ke Admin UKPD",
  ).length;
  const returnedToCpns = data.items.filter(
    (item) => item.status === "Dikembalikan ke CPNS",
  ).length;
  const stageTwoSubmissions = data.items.filter(
    (item) => Number(item.tahap) === 2,
  ).length;
  const valid = data.items.filter((item) =>
    [
      "Terverifikasi Admin UKPD",
      "Direkap Dinkes",
      "Diusulkan ke BKD",
      "Selesai",
    ].includes(item.status),
  ).length;
  const groupedRows = useMemo(
    () =>
      Object.entries(
        rows.reduce((groups, item) => {
          (groups[item.nama_ukpd || "Tanpa UKPD"] ||= []).push(item);
          return groups;
        }, {}),
      ).sort(([a], [b]) => a.localeCompare(b, "id")),
    [rows],
  );
  const roleStatuses = canSubmit
    ? ["Draft CPNS", "Diajukan ke Admin UKPD"]
    : canVerify
      ? ["Dikembalikan ke CPNS", "Terverifikasi Admin UKPD"]
      : canRecap
        ? ["Direkap Dinkes", "Diusulkan ke BKD", "Selesai"]
        : [];

  function open(item) {
    setSelectedId(item.id);
    const firstDocument = Object.values(item.dokumen || {}).find((document) => document?.url);
    setPreviewDocumentUrl(firstDocument?.url || "");
    setDraft({
      status_latsar: item.status_latsar,
      status: roleStatuses.includes(item.status)
        ? item.status
        : roleStatuses[0] || item.status,
      catatan: item.catatan || "",
      nomor_sttpl: item.nomor_sttpl || "",
      tanggal_sttpl: item.tanggal_sttpl || "",
      nomor_suket: item.nomor_suket || "",
      tanggal_suket: item.tanggal_suket || "",
      keterangan_lampiran: item.keterangan_lampiran || "",
      verifikasi: { ...item.verifikasi },
    });
    setNotice({ type: "", text: "" });
  }
  function download(mode, extra = {}) {
    return `/api/usulan/cpns-pns/download?${new URLSearchParams({ mode, ...extra })}`;
  }

  async function add() {
    const candidate = data.candidates[0];
    if (!candidate) return;
    setBusy("add");
    try {
      const result = await json(
        await fetch("/api/usulan/cpns-pns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        "CPNS gagal ditambahkan.",
      );
      setNotice({ type: "success", text: result.message });
      setSelectedId(null);
      setDraft(null);
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function upload(key, file) {
    if (!selected || !file) return;
    if (
      !file.name.toLowerCase().endsWith(".pdf") ||
      file.size > CPNS_PNS_DOCUMENT_MAX_BYTES
    )
      return setNotice({
        type: "error",
        text: "Dokumen harus PDF dengan ukuran maksimal 1 MB.",
      });
    setBusy(`upload-${key}`);
    const form = new FormData();
    form.set("id", selected.id);
    form.set("key", key);
    form.set("file", file);
    try {
      const result = await json(
        await fetch("/api/usulan/cpns-pns/dokumen", {
          method: "POST",
          body: form,
        }),
        "Upload gagal.",
      );
      setNotice({ type: "success", text: result.message });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save");
    const changes = canSubmit
      ? {
          status_latsar: draft.status_latsar,
          status: selected.status === "Dikembalikan ke CPNS" ? "Draft CPNS" : selected.status,
          nomor_sttpl: draft.nomor_sttpl,
          tanggal_sttpl: draft.tanggal_sttpl,
          nomor_suket: draft.nomor_suket,
          tanggal_suket: draft.tanggal_suket,
          keterangan_lampiran: draft.keterangan_lampiran,
        }
      : canVerify
        ? {
            status: draft.status,
            catatan: draft.catatan,
            verifikasi: draft.verifikasi,
          }
        : { status: draft.status };
    try {
      const result = await json(
        await fetch("/api/usulan/cpns-pns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selected.id, ...changes }),
        }),
        "Perubahan gagal disimpan.",
      );
      setNotice({ type: "success", text: result.message });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function submitToUkpd(item) {
    setBusy("submit");
    try {
      const result = await json(
        await fetch("/api/usulan/cpns-pns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            status: "Diajukan ke Admin UKPD",
          }),
        }),
        "Usulan gagal diajukan ke Admin UKPD.",
      );
      setNotice({ type: "success", text: result.message });
      setConfirmItem(null);
      setSelectedId(null);
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function remove(item) {
    if (!window.confirm(`Hapus ${item.nama_pegawai} dari daftar pengusulan?`))
      return;
    setBusy(`delete-${item.id}`);
    try {
      const result = await json(
        await fetch(`/api/usulan/cpns-pns?id=${item.id}`, { method: "DELETE" }),
        "Data gagal dihapus.",
      );
      setNotice({ type: "success", text: result.message });
      if (selectedId === item.id) setSelectedId(null);
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function moveToStageTwo(item) {
    if (!window.confirm(`Pindahkan draft ${item.nama_pegawai} ke Tahap II? Semua data dan dokumen yang sudah diunggah akan tetap dipertahankan.`)) return;
    setBusy(`move-${item.id}`);
    try {
      const result = await json(
        await fetch("/api/usulan/cpns-pns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, tahap: 2 }),
        }),
        "Draft gagal dipindahkan ke Tahap II.",
      );
      setNotice({ type: "success", text: result.message });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader
        title="Pengangkatan CPNS menjadi PNS"
               breadcrumbs={[{ label: "Usulan" }, { label: "CPNS menjadi PNS" }]}
      />
      {notice.text ? (
        <p
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
        >
          {notice.text}
        </p>
      ) : null}

      <section className={`mb-3 rounded-xl border px-4 py-3 text-sm ${data.submissionOpen ? "border-blue-200 bg-blue-50 text-blue-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
        <p className="font-extrabold">
          {data.activeStage === 1
            ? "Tahap I aktif sampai 3 September 2026 pukul 23.59 WIB"
            : data.activeStage === 2
              ? "Tahap II sedang aktif"
              : "Tahap I telah ditutup — Tahap II dibuka 8 September 2026"}
        </p>
        <p className="mt-1 text-xs leading-5">
          Draft, data isian, dan seluruh dokumen yang telah diunggah tetap tersimpan. Dokumen hanya menjadi usulan resmi setelah CPNS menekan Ajukan ke Admin UKPD.
        </p>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        {[
          {
            label: "Jumlah CPNS di UKPD",
            value: data.cpnsSummary?.total || 0,
          },
          {
            label: "Dalam Pengusulan",
            value: data.items.length,
          },
          {
            label: "Dokumen Lengkap",
            value: complete,
          },
          {
            label: "Diajukan ke Admin UKPD",
            value: submittedToAdminUkpd,
          },
          {
            label: "Dikembalikan ke CPNS",
            value: returnedToCpns,
          },
          {
            label: "Pengajuan Tahap II",
            value: stageTwoSubmissions,
          },
          {
            label: "Valid Admin UKPD",
            value: valid,
          },
          {
            label: "Belum Mengusulkan",
            value: data.cpnsSummary?.notSubmitted || 0,
          },
        ].map((card) => (
          <article
            className="surface flex min-h-14 items-center justify-between gap-3 px-3 py-2"
            key={card.label}
          >
            <p className="text-xs font-bold leading-4 text-dinkes-800">
              {card.label}
            </p>
            <p className="font-display text-xl font-bold tabular-nums text-slate-950">
              {card.value}
            </p>
          </article>
        ))}
      </section>

      {canSubmit && !data.items.length ? (
        <section className="surface mt-3 grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          {data.candidates[0] ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-dinkes-700">Data CPNS sesuai akun</p>
              <p className="mt-1 font-semibold text-slate-900">{data.candidates[0].nama}</p>
              <p className="text-sm text-slate-500">{data.candidates[0].nip} · {data.candidates[0].nama_ukpd}</p>
              <p className="mt-1 text-xs text-slate-500">{data.submissionOpen ? `Sistem menetapkan Tahap ${data.activeStage} secara otomatis.` : "Pembuatan usulan baru sedang ditutup."}</p>
            </div>
          ) : (
            <p className="text-sm text-amber-700">Data CPNS untuk akun ini tidak ditemukan atau sudah masuk pengusulan.</p>
          )}
          <button
            className="btn-primary justify-center"
            disabled={!data.candidates[0] || !data.submissionOpen || busy === "add"}
            onClick={add}
            type="button"
          >
            {busy === "add" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}{" "}
            Mulai Pengusulan Saya
          </button>
        </section>
      ) : null}

      {!canSubmit ? (
        <section className="surface mt-3 grid gap-3 p-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_140px_190px_minmax(220px,300px)]">
            <label className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input-field w-full pl-9"
                placeholder="Cari nama, NIP, NRK, atau UKPD"
                value={filters.q}
                onChange={(event) =>
                  setFilters({ ...filters, q: event.target.value })
                }
              />
            </label>
            <select
              className="input-field w-full"
              value={filters.tahap}
              onChange={(event) => setFilters({ ...filters, tahap: event.target.value })}
            >
              <option value="">Semua tahap</option>
              <option value="1">Tahap I</option>
              <option value="2">Tahap II</option>
            </select>
            <select
              className="input-field w-full"
              value={filters.status}
              onChange={(event) =>
                setFilters({ ...filters, status: event.target.value })
              }
            >
              <option value="">Semua status</option>
              {data.statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <select
              className="input-field w-full"
              value={filters.ukpd}
              onChange={(event) =>
                setFilters({ ...filters, ukpd: event.target.value })
              }
            >
              <option value="">Semua UKPD</option>
              {ukpds.map((ukpd) => (
                <option key={ukpd}>{ukpd}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <a
              className="btn-secondary min-w-[170px] justify-center"
              href={download(
                filters.ukpd ? "ukpd" : "all",
                {
                  ...(filters.ukpd ? { ukpd: filters.ukpd } : {}),
                  ...(filters.tahap ? { tahap: filters.tahap } : {}),
                },
              )}
            >
              <FolderArchive className="h-4 w-4" /> {filters.tahap ? `Paket Valid Tahap ${filters.tahap === "2" ? "II" : "I"}` : "Paket Valid"}
            </a>
            {canRecap ? (
              <a
                className="btn-secondary min-w-[210px] justify-center"
                href={download("report", filters.tahap ? { tahap: filters.tahap } : {})}
              >
                <Download className="h-4 w-4" /> {filters.tahap ? `Download Rekap Tahap ${filters.tahap === "2" ? "II" : "I"}` : "Download Rekap Semua"}
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="mt-3 grid gap-2">
        {loading ? (
          <div className="surface flex justify-center gap-2 p-10 text-sm text-slate-500">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Memuat...
          </div>
        ) : null}
        {!loading && !rows.length ? (
          <div className="surface p-10 text-center text-sm text-slate-500">
            Belum ada data pengusulan yang sesuai.
          </div>
        ) : null}
        {groupedRows.map(([ukpd, items]) => (
          <details className="surface overflow-hidden" key={ukpd} open>
            <summary className="flex cursor-pointer list-none items-center justify-between bg-dinkes-50 px-3 py-2 text-sm font-bold text-dinkes-900">
              <span>{ukpd}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs">
                {items.length} CPNS
              </span>
            </summary>
            <div className="table-scroll">
              <table className="min-w-[1500px] w-full table-fixed border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="w-12 border px-2 py-2">NO</th>
                    <th className="w-44 border px-2 py-2">NIP</th>
                    <th className="w-52 border px-2 py-2">NAMA</th>
                    <th className="w-56 border px-2 py-2">UNIT KERJA</th>
                    <th className="w-44 border px-2 py-2">NOMOR STTPL</th>
                    <th className="w-32 border px-2 py-2">TANGGAL STTPL</th>
                    <th className="w-48 border px-2 py-2">
                      NOMOR SURAT KESEHATAN
                    </th>
                    <th className="w-36 border px-2 py-2">
                      TANGGAL SURAT KESEHATAN
                    </th>
                    <th className="w-48 border px-2 py-2">KETERANGAN</th>
                    <th className="w-56 border px-2 py-2">AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr
                      className="odd:bg-white even:bg-slate-50/60"
                      key={item.id}
                    >
                      <td className="border px-2 py-1.5 text-center">
                        {index + 1}
                      </td>
                      <td className="border px-2 py-1.5">{item.nip}</td>
                      <td className="border px-2 py-1.5 font-semibold">
                        {item.nama_pegawai}
                      </td>
                      <td className="border px-2 py-1.5">{item.nama_ukpd}</td>
                      <td className="border px-2 py-1.5">
                        {item.nomor_sttpl || "-"}
                      </td>
                      <td className="border px-2 py-1.5">
                        {item.tanggal_sttpl || "-"}
                      </td>
                      <td className="border px-2 py-1.5">
                        {item.nomor_suket || "-"}
                      </td>
                      <td className="border px-2 py-1.5">
                        {item.tanggal_suket || "-"}
                      </td>
                      <td className="border px-2 py-1.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${tone(item.status)}`}
                        >
                          {item.status}
                        </span>
                        <span className="ml-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                          Tahap {Number(item.tahap) === 2 ? "II" : "I"}
                        </span>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">
                          {item.keterangan_lampiran ||
                            `${item.progress.uploaded}/${item.progress.total} dokumen`}
                        </p>
                      </td>
                      <td className="border px-2 py-1.5">
                        <div className="flex justify-center gap-1">
                          <button
                            aria-label={canVerify ? "Periksa berkas usulan" : "Lihat detail usulan"}
                            className={`inline-flex items-center justify-center rounded-md border px-2.5 py-1.5 text-[11px] font-bold shadow-sm transition ${
                              canVerify
                                ? "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                            onClick={() => open(item)}
                            title={canVerify ? "Periksa kelengkapan dan validitas dokumen" : "Lihat seluruh detail usulan"}
                            type="button"
                          >
                            {canVerify ? "Periksa Berkas" : "Lihat Detail"}
                          </button>
                          {canSubmit && item.stageSubmissionOpen && ["Draft CPNS", "Dikembalikan ke CPNS"].includes(item.status) ? (
                            <button
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                              onClick={() => setConfirmItem(item)}
                              type="button"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Ajukan ke Admin UKPD
                            </button>
                          ) : null}
                          {canRecap && data.canMoveToStageTwo && Number(item.tahap) === 1 && ["Draft CPNS", "Dikembalikan ke CPNS"].includes(item.status) ? (
                            <button
                              className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100"
                              disabled={busy === `move-${item.id}`}
                              onClick={() => moveToStageTwo(item)}
                              type="button"
                            >
                              Pindahkan ke Tahap II
                            </button>
                          ) : null}
                          <a
                            className="btn-secondary px-2 py-1"
                            href={download("cpns", {
                              id: item.id,
                              onlyValid: 0,
                            })}
                          >
                            <Download className="h-3 w-3" />
                          </a>
                          {canRecap || (canSubmit && item.stageSubmissionOpen) ? (
                            <button
                              className="rounded border border-rose-200 p-1 text-rose-700"
                              disabled={busy === `delete-${item.id}`}
                              onClick={() => remove(item)}
                              type="button"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </section>

      {confirmItem ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            aria-labelledby="submit-confirmation-title"
            aria-modal="true"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
          >
            <div className="bg-gradient-to-br from-dinkes-700 to-dinkes-900 px-6 py-5 text-white">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                <Send className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold" id="submit-confirmation-title">
                Ajukan ke Admin UKPD?
              </h2>
              <p className="mt-1 text-sm text-dinkes-100">
                Pastikan seluruh data dan dokumen sudah benar.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nama CPNS</p>
                <p className="mt-1 font-bold text-slate-900">{confirmItem.nama_pegawai}</p>
                <p className="text-sm text-slate-600">{confirmItem.nip} · {confirmItem.nama_ukpd}</p>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Setelah diajukan, berkas tidak dapat diubah selama proses verifikasi Admin UKPD.
              </p>
              <div className="flex gap-3 pt-1">
                <button
                  className="btn-secondary flex-1 justify-center"
                  disabled={busy === "submit"}
                  onClick={() => setConfirmItem(null)}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
                  disabled={busy === "submit"}
                  onClick={() => submitToUkpd(confirmItem)}
                  type="button"
                >
                  {busy === "submit" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Ya, Ajukan
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {selected && draft ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-6"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
        >
          <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
            <header className="flex shrink-0 justify-between border-b bg-white p-5">
              <div>
                <p className="section-label">{canSubmit ? "Kelengkapan Berkas" : canVerify ? "Verifikasi Berkas" : "Peninjauan Usulan"}</p>
                <h2 className="font-display text-lg font-bold text-dinkes-900">
                  {selected.nama_pegawai}
                </h2>
                <p className="text-sm text-slate-500">
                  {selected.nip} · {selected.nama_ukpd}
                </p>
              </div>
              <button
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Tutup"
                onClick={() => {
                  setSelectedId(null);
                  setPreviewDocumentUrl("");
                }}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            {notice.text ? (
              <div
                className={`mx-4 mt-4 flex shrink-0 items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm sm:mx-5 ${
                  notice.type === "error"
                    ? "border-rose-300 bg-rose-50 text-rose-800"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800"
                }`}
                role="alert"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${notice.type === "error" ? "bg-rose-600" : "bg-emerald-600"}`}
                >
                  {notice.type === "error" ? "!" : "✓"}
                </span>
                <span className="leading-5">{notice.text}</span>
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
              <section className="min-h-80 bg-slate-800 p-3 lg:h-full lg:min-h-0">
                {previewDocumentUrl ? (
                  <div className="h-[60vh] min-h-80 lg:h-full">
                    <PdfDocumentPreview url={previewDocumentUrl} title="Dokumen usulan CPNS menjadi PNS" />
                  </div>
                ) : (
                  <div className="flex h-full min-h-80 items-center justify-center rounded-lg border border-dashed border-slate-500 px-6 text-center text-sm font-medium text-slate-200">
                    Pilih dokumen yang sudah diunggah untuk melihat preview PDF.
                  </div>
                )}
              </section>
              <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
              {canSubmit && !selected.stageSubmissionOpen ? (
                <section className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-extrabold">Pengisian Tahap {Number(selected.tahap) === 2 ? "II" : "I"} telah ditutup</p>
                  <p className="mt-1 text-xs leading-5">Data dan dokumen Anda tetap tersimpan dan dapat dilihat, tetapi tidak dapat diubah atau diajukan pada periode ini.</p>
                </section>
              ) : null}
              {canSubmit && selected.catatan ? (
                <section className="overflow-hidden rounded-xl border border-rose-200 bg-rose-50 shadow-sm">
                  <header className="flex items-center gap-3 border-b border-rose-200 bg-rose-100 px-4 py-3 text-rose-900">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-600 text-white">
                      <AlertTriangle className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold">Perbaikan dari Admin UKPD</h3>
                      <p className="text-xs font-medium text-rose-700">Perhatikan catatan berikut sebelum mengajukan ulang.</p>
                    </div>
                  </header>
                  <div className="space-y-3 p-4">
                    <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">{selected.catatan}</p>
                    {Object.entries(data.documentLabels).some(([key]) => selected.dokumen[key] && !selected.verifikasi[key]) ? (
                      <div className="rounded-lg border border-rose-200 bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-rose-700">Dokumen yang perlu diperiksa atau diperbaiki</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                          {Object.entries(data.documentLabels)
                            .filter(([key]) => selected.dokumen[key] && !selected.verifikasi[key])
                            .map(([key, label]) => <li key={key}>{label}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}
              <section className="surface p-4">
                <h3 className="text-sm font-bold">Dokumen wajib</h3>
                <p className="mt-1 text-xs text-slate-500">
                  CPNS mengunggah PDF maksimal 1 MB; Admin UKPD memeriksa dan
                  mencentang valid.
                </p>
                <div className="mt-4 space-y-3">
                  {Object.entries(data.documentLabels).map(([key, label]) => {
                    const doc = selected.dokumen[key];
                    return (
                      <article
                        className="rounded-lg border bg-slate-50 p-3"
                        key={key}
                      >
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{label}</p>
                            {canSubmit && selected.catatan && doc && !selected.verifikasi[key] ? (
                              <p className="mt-1 inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Perlu diperbaiki</p>
                            ) : null}
                            {doc ? (
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <button
                                  className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${previewDocumentUrl === doc.url ? "border-dinkes-600 bg-dinkes-700 text-white" : "border-dinkes-200 bg-white text-dinkes-700 hover:bg-dinkes-50"}`}
                                  onClick={() => setPreviewDocumentUrl(doc.url)}
                                  type="button"
                                >
                                  Tampilkan Dokumen
                                </button>
                                <a
                                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                  href={doc.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Lihat Dokumen Penuh
                                </a>
                                <span className="max-w-[280px] truncate text-xs font-medium text-slate-500">
                                  {doc.name} ({Math.round(doc.size / 1024)} KB)
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs text-amber-700">
                                Belum diunggah
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {canVerify ? (
                              <label className="flex gap-2 text-xs font-semibold">
                                <input
                                  checked={Boolean(draft.verifikasi[key])}
                                  disabled={!doc}
                                  onChange={(event) =>
                                    setDraft({
                                      ...draft,
                                      verifikasi: {
                                        ...draft.verifikasi,
                                        [key]: event.target.checked,
                                      },
                                    })
                                  }
                                  type="checkbox"
                                />
                                Valid Admin UKPD
                              </label>
                            ) : null}
                            {canSubmit && selected.stageSubmissionOpen ? (
                              <label className="btn-secondary cursor-pointer px-3 py-2 text-xs">
                                {busy === `upload-${key}` ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UploadCloud className="h-4 w-4" />
                                )}
                                {doc ? "Ganti" : "Upload"}
                                <input
                                  className="hidden"
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) upload(key, file);
                                    event.target.value = "";
                                  }}
                                />
                              </label>
                            ) : null}
                          </div>
                        </div>
                        {key === "sttpl" ? (
                          <div className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <Hash className="h-3.5 w-3.5 text-dinkes-600" />
                                Nomor STTPL
                              </span>
                              <input
                                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-dinkes-500 focus:ring-4 focus:ring-dinkes-100 disabled:bg-slate-100 disabled:text-slate-500"
                                disabled={!canSubmit || !selected.stageSubmissionOpen}
                                placeholder="Masukkan nomor STTPL"
                                value={draft.nomor_sttpl}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    nomor_sttpl: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <CalendarDays className="h-3.5 w-3.5 text-dinkes-600" />
                                Tanggal STTPL
                              </span>
                              <input
                                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-dinkes-500 focus:ring-4 focus:ring-dinkes-100 disabled:bg-slate-100 disabled:text-slate-500"
                                disabled={!canSubmit || !selected.stageSubmissionOpen}
                                type="date"
                                value={draft.tanggal_sttpl}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    tanggal_sttpl: event.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        ) : null}
                        {key === "suket" ? (
                          <div className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <Hash className="h-3.5 w-3.5 text-dinkes-600" />
                                Nomor Surat Kesehatan
                              </span>
                              <input
                                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-dinkes-500 focus:ring-4 focus:ring-dinkes-100 disabled:bg-slate-100 disabled:text-slate-500"
                                disabled={!canSubmit || !selected.stageSubmissionOpen}
                                placeholder="Masukkan nomor surat kesehatan"
                                value={draft.nomor_suket}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    nomor_suket: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <CalendarDays className="h-3.5 w-3.5 text-dinkes-600" />
                                Tanggal Surat Kesehatan
                              </span>
                              <input
                                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-dinkes-500 focus:ring-4 focus:ring-dinkes-100 disabled:bg-slate-100 disabled:text-slate-500"
                                disabled={!canSubmit || !selected.stageSubmissionOpen}
                                type="date"
                                value={draft.tanggal_suket}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    tanggal_suket: event.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
              {!canSubmit ? (
                <section className="surface grid gap-3 p-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold sm:col-span-2">
                    Keputusan Verifikasi
                    <select
                      className={`mt-1 block w-full rounded-xl border-2 px-3 py-3 text-sm font-extrabold outline-none transition focus:ring-4 ${
                        canVerify && draft.status === "Dikembalikan ke CPNS"
                          ? "border-rose-300 bg-rose-50 text-rose-900 focus:border-rose-500 focus:ring-rose-100"
                          : canVerify && draft.status === "Terverifikasi Admin UKPD"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900 focus:border-emerald-500 focus:ring-emerald-100"
                            : "border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-100"
                      }`}
                      value={draft.status}
                      onChange={(event) =>
                        setDraft({ ...draft, status: event.target.value })
                      }
                    >
                      {roleStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status === "Dikembalikan ke CPNS"
                            ? "Kembalikan ke CPNS untuk diperbaiki"
                            : status === "Terverifikasi Admin UKPD"
                              ? "Lolos verifikasi — siap diproses Dinas Kesehatan"
                              : status}
                        </option>
                      ))}
                    </select>
                  </label>
                  {canVerify ? (
                    <>
                      <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 sm:col-span-2 ${
                        draft.status === "Dikembalikan ke CPNS"
                          ? "border-rose-300 bg-rose-50 text-rose-900"
                          : "border-emerald-300 bg-emerald-50 text-emerald-900"
                      }`}>
                        {draft.status === "Dikembalikan ke CPNS" ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> : <UserRoundCheck className="mt-0.5 h-5 w-5 shrink-0" />}
                        <div>
                          <p className="text-sm font-extrabold">
                            {draft.status === "Dikembalikan ke CPNS" ? "Usulan akan dikembalikan kepada CPNS" : "Usulan dinyatakan lolos verifikasi UKPD"}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-5">
                            {draft.status === "Dikembalikan ke CPNS"
                              ? "CPNS akan melihat catatan dan daftar dokumen yang harus diperbaiki sebelum mengajukan ulang."
                              : "Berkas selanjutnya siap direkap dan diproses oleh Dinas Kesehatan."}
                          </p>
                        </div>
                      </div>
                      <label className="text-sm font-semibold sm:col-span-2">
                        {draft.status === "Dikembalikan ke CPNS" ? "Catatan Perbaikan untuk CPNS (wajib)" : "Catatan Verifikasi Admin UKPD"}
                        <textarea
                          className="input-field mt-1 min-h-24"
                          placeholder={draft.status === "Dikembalikan ke CPNS" ? "Tuliskan secara jelas dokumen atau data yang harus diperbaiki..." : "Tambahkan catatan verifikasi jika diperlukan..."}
                          value={draft.catatan}
                          onChange={(event) =>
                            setDraft({ ...draft, catatan: event.target.value })
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </section>
              ) : null}
              <div className="flex gap-3">
                <a
                  className="btn-secondary flex-1 justify-center"
                  href={download("cpns", { id: selected.id, onlyValid: 0 })}
                >
                  <Archive className="h-4 w-4" />
                  Download ZIP
                </a>
                <button
                  className="btn-primary flex-1 justify-center"
                  disabled={busy === "save" || (canSubmit && !selected.stageSubmissionOpen)}
                  onClick={save}
                  type="button"
                >
                  {busy === "save" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Simpan
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
