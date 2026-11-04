"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Check, FileSpreadsheet, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import ErrorState from "@/components/ui/ErrorState";
import { downloadXlsx } from "@/lib/export/simpleXlsx";

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

function PersonList({ people = [] }) {
  if (!people.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="min-w-[220px] space-y-1">
      {people.map((person) => (
        <Link key={person.id_pegawai} href={`/pegawai/${person.id_pegawai}`} className="block rounded bg-slate-50 px-2 py-1 text-[11px] font-semibold text-dinkes-800 hover:bg-dinkes-50 hover:underline">
          {person.nama} <span className="font-normal text-slate-500">({person.jenis_pegawai})</span>
        </Link>
      ))}
    </div>
  );
}

function CompactKpi({ label, children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200",
    blue: "border-blue-200",
    emerald: "border-emerald-200"
  };
  return (
    <div className={`min-w-0 rounded-lg border bg-white px-3 py-2 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

function Metric({ label, value, className = "text-slate-950" }) {
  return <p className={`min-w-0 whitespace-nowrap text-sm font-black leading-tight ${className}`}><span className="mr-1 text-[9px] font-bold text-slate-500">{label}</span>{formatNumber(value)}</p>;
}

function SummaryMetric({ label, value, tone }) {
  const className = tone === "blue" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800";
  return <span className={`rounded px-2 py-1 text-center text-[11px] font-extrabold ${className}`}>{label} {formatNumber(value)}</span>;
}

export default function DataJabatanPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ukpd, setUkpd] = useState("");
  const [template, setTemplate] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [structureEditor, setStructureEditor] = useState(null);
  const [structureSaving, setStructureSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const pollingPausedRef = useRef(false);
  const pollingPaused = Boolean(editing || saving || structureEditor || structureSaving || deleteTarget);

  useEffect(() => {
    pollingPausedRef.current = pollingPaused;
  }, [pollingPaused]);

  useEffect(() => {
    let disposed = false;
    let requestInProgress = false;
    let controller = null;
    async function loadData({ silent = false } = {}) {
    if (requestInProgress || (silent && pollingPausedRef.current)) return;
    requestInProgress = true;
    controller = new AbortController();
    const params = new URLSearchParams();
    if (ukpd) params.set("ukpd", ukpd);
    else if (template) params.set("template", template);
    if (!silent) { setLoading(true); setError(""); }
    try {
        const response = await fetch(`/api/peta-jabatan?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.message || "Data jabatan gagal dimuat.");
        if (disposed) return;
        setData(body.data);
        setError("");
      } catch (reason) { if (!disposed && reason.name !== "AbortError" && !silent) setError(reason.message); }
      finally { requestInProgress = false; if (!disposed && !silent) setLoading(false); }
    }
    loadData();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") loadData({ silent: true }); }, 10_000);
    const handleVisibility = () => { if (document.visibilityState === "visible") loadData({ silent: true }); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { disposed = true; window.clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibility); controller?.abort(); };
  }, [ukpd, template, reloadKey]);

  function openStructureEditor(item = null) {
    setStructureEditor({
      id: item?.id || null,
      nama_jabatan_orb: item?.nama_jabatan_orb || "",
      kelas_jabatan_orb: item?.kelas_jabatan_orb || "",
      nama_jabatan_menpan: item?.nama_jabatan_menpan || "",
      kelas_jabatan_menpan: item?.kelas_jabatan_menpan || "",
      atasan_langsung: item?.atasan_langsung || "",
      rumpun_jabatan: item?.rumpun_jabatan || "",
      kebutuhan_asn: String(item?.kebutuhan_asn ?? 0),
      kebutuhan_non_asn: String(item?.kebutuhan_non_asn ?? 0),
      urutan: String(item?.urutan ?? ((data?.positions?.length || 0) + 1))
    });
    setSaveError("");
    setSaveMessage("");
  }

  async function saveStructure() {
    const position = {
      ...structureEditor,
      urutan: Number(structureEditor.urutan)
    };
    if (!structureEditor.id) {
      position.kebutuhan_asn = Number(structureEditor.kebutuhan_asn);
      position.kebutuhan_non_asn = Number(structureEditor.kebutuhan_non_asn);
    } else {
      delete position.kebutuhan_asn;
      delete position.kebutuhan_non_asn;
    }
    setStructureSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/peta-jabatan", {
        method: structureEditor.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(structureEditor.id
          ? { position_id: structureEditor.id, position }
          : { template: data.template, position })
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || "Struktur jabatan gagal disimpan.");
      setStructureEditor(null);
      setSaveMessage(body.message || "Struktur jabatan berhasil disimpan.");
      setReloadKey((value) => value + 1);
    } catch (reason) {
      setSaveError(reason.message);
    } finally {
      setStructureSaving(false);
    }
  }

  function deleteStructure(item) {
    setDeleteTarget(item);
    setSaveError("");
  }

  async function confirmDeleteStructure() {
    if (!deleteTarget) return;
    setSaveError("");
    setStructureSaving(true);
    try {
      const response = await fetch("/api/peta-jabatan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position_id: deleteTarget.id })
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || "Jabatan gagal dihapus.");
      setDeleteTarget(null);
      setSaveMessage(body.message || "Jabatan berhasil dihapus.");
      setReloadKey((value) => value + 1);
    } catch (reason) {
      setSaveError(reason.message);
    } finally {
      setStructureSaving(false);
    }
  }

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.positions || []).filter((item) => !keyword || [
      item.nama_jabatan_orb,
      item.nama_jabatan_menpan,
      item.atasan_langsung,
      item.rumpun_jabatan,
      ...(item.pegawai_asn || []).map((person) => person.nama),
      ...(item.pegawai_non_asn || []).map((person) => person.nama)
    ].join(" ").toLowerCase().includes(keyword));
  }, [data, search]);

  const totals = useMemo(() => (data?.positions || []).reduce((result, item) => ({
    jabatan: result.jabatan + 1,
    bAsn: result.bAsn + Number(item.bezetting_asn),
    kAsn: result.kAsn + Number(item.kebutuhan_asn),
    bNon: result.bNon + Number(item.bezetting_non_asn),
    kNon: result.kNon + Number(item.kebutuhan_non_asn)
  }), { jabatan: 0, bAsn: 0, kAsn: 0, bNon: 0, kNon: 0 }), [data]);

  function startEditing(item) {
    setEditing({
      id: item.id,
      kebutuhan_asn: String(item.kebutuhan_asn ?? 0),
      kebutuhan_non_asn: String(item.kebutuhan_non_asn ?? 0)
    });
    setSaveMessage("");
    setSaveError("");
  }

  async function saveKebutuhan() {
    const kebutuhanAsn = Number(editing?.kebutuhan_asn);
    const kebutuhanNonAsn = Number(editing?.kebutuhan_non_asn);
    if (!Number.isInteger(kebutuhanAsn) || kebutuhanAsn < 0 || !Number.isInteger(kebutuhanNonAsn) || kebutuhanNonAsn < 0) {
      setSaveError("Kebutuhan harus berupa bilangan bulat nol atau lebih.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const response = await fetch("/api/peta-jabatan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ukpd: data.selectedUkpd,
          position_id: editing.id,
          kebutuhan_asn: kebutuhanAsn,
          kebutuhan_non_asn: kebutuhanNonAsn
        })
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || "Angka kebutuhan gagal diperbarui.");
      setData((current) => ({
        ...current,
        positions: current.positions.map((item) => String(item.id) === String(editing.id) ? {
          ...item,
          kebutuhan_asn: kebutuhanAsn,
          kebutuhan_non_asn: kebutuhanNonAsn,
          selisih_asn: Number(item.bezetting_asn) - kebutuhanAsn,
          selisih_non_asn: Number(item.bezetting_non_asn) - kebutuhanNonAsn,
          kebutuhan_override: true
        } : item)
      }));
      setEditing(null);
      setSaveMessage("Angka kebutuhan berhasil disimpan.");
    } catch (reason) {
      setSaveError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function exportExcel() {
    if (data?.mode !== "detail") return;
    setExporting(true);
    setSaveError("");
    try {
      const headers = ["No.", "Nomenklatur ORB/Pergub", "KL ORB", "Nomenklatur MenPAN", "KL MenPAN", "Atasan Langsung", "Rumpun Jabatan", "B ASN", "K ASN", "S ASN (B-K)", "B Non-ASN", "K Non-ASN", "S Non-ASN (B-K)", "Pegawai Pengisi ASN", "Pegawai Pengisi Non-ASN", "UKPD"];
      const exportRows = rows.map((item, index) => [
        index + 1,
        item.nama_jabatan_orb || "",
        item.kelas_jabatan_orb || "",
        item.nama_jabatan_menpan || "",
        item.kelas_jabatan_menpan || "",
        item.atasan_langsung || "",
        item.rumpun_jabatan || "",
        Number(item.bezetting_asn) || 0,
        Number(item.kebutuhan_asn) || 0,
        (Number(item.bezetting_asn) || 0) - (Number(item.kebutuhan_asn) || 0),
        Number(item.bezetting_non_asn) || 0,
        Number(item.kebutuhan_non_asn) || 0,
        (Number(item.bezetting_non_asn) || 0) - (Number(item.kebutuhan_non_asn) || 0),
        (item.pegawai_asn || []).map((person) => `${person.nama} (${person.jenis_pegawai})`).join("\n"),
        (item.pegawai_non_asn || []).map((person) => `${person.nama} (${person.jenis_pegawai})`).join("\n"),
        data.selectedUkpd
      ]);
      const safeName = String(data.selectedUkpd || data.template || "data-jabatan").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
      await downloadXlsx({ filename: `verval-jabatan-${safeName}.xlsx`, sheetName: "Verval Jabatan", headers, rows: exportRows });
    } catch (reason) {
      setSaveError(reason.message || "Data jabatan gagal diekspor.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Verval Jabatan"
        compact
        showBreadcrumb={false}
        action={<div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-stretch sm:justify-end sm:gap-1.5">
          {!loading && !error && data?.mode === "detail" ? <>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch sm:justify-end sm:gap-1.5">
              <CompactKpi label="Jumlah Jabatan"><Metric value={totals.jabatan} /></CompactKpi>
              <CompactKpi label="ASN" tone="blue">
                <Metric label="B" value={totals.bAsn} className="text-blue-800" />
                <Metric label="K" value={totals.kAsn} className="text-blue-800" />
                <Metric label="S" value={totals.bAsn - totals.kAsn} className={totals.bAsn - totals.kAsn > 0 ? "rounded bg-red-100 px-2 py-1 text-red-700" : "text-amber-700"} />
              </CompactKpi>
              <div className="col-span-2 sm:col-span-1">
                <CompactKpi label="Non-ASN" tone="emerald">
                  <Metric label="B" value={totals.bNon} className="text-emerald-800" />
                  <Metric label="K" value={totals.kNon} className="text-emerald-800" />
                  <Metric label="S" value={totals.bNon - totals.kNon} className={totals.bNon - totals.kNon > 0 ? "rounded bg-red-100 px-2 py-1 text-red-700" : "text-amber-700"} />
                </CompactKpi>
              </div>
            </div>
          </> : null}
          {data?.mode === "detail" && data.canManageStructure ? (
            <button type="button" onClick={() => openStructureEditor()} className="btn-primary w-full justify-center self-center sm:w-auto">
              <Plus className="h-4 w-4" />Tambah Jabatan
            </button>
          ) : null}
          <button type="button" onClick={exportExcel} disabled={data?.mode !== "detail" || exporting} className="btn-secondary w-full justify-center self-center sm:w-auto"><FileSpreadsheet className="h-4 w-4" />{exporting ? "Menyiapkan Excel…" : "Export Excel"}</button>
        </div>}
      />

      {data?.canFilterUkpd ? <section className="mb-2 grid gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm lg:grid-cols-2">
        <select className="input h-9 py-1 text-sm" value={ukpd} onChange={(event) => { setUkpd(event.target.value); if (event.target.value) setTemplate(""); }}>
          <option value="">Pilih UKPD</option>
          {(data?.ukpdOptions || []).map((item) => <option key={item.id_ukpd} value={item.nama_ukpd}>{item.nama_ukpd}</option>)}
        </select>
        <select className="input h-9 py-1 text-sm" value={template} onChange={(event) => { setTemplate(event.target.value); setUkpd(""); }}>
          <option value="">Ringkasan seluruh jenis UKPD</option>
          {(data?.templates || []).sort().map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </section> : null}

      {error ? <ErrorState title="Data jabatan belum dapat ditampilkan" message={error} /> : null}
      {loading ? <div className="surface p-8 text-center text-sm font-semibold text-slate-500">Memuat data jabatan…</div> : null}

      {!loading && !error && data?.mode === "summary" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data.summary || []).map((item) => (
            <button key={item.template_ukpd} type="button" onClick={() => { setTemplate(item.template_ukpd); setUkpd(""); }} className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-dinkes-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <Building2 className="h-7 w-7 text-dinkes-700" />
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">{formatNumber(item.jumlah_jabatan)} jabatan</span>
              </div>
              <h2 className="mt-4 font-display text-lg font-black text-slate-950">{item.template_ukpd}</h2>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SummaryMetric label="K ASN" value={item.kebutuhan_asn} tone="blue" />
                <SummaryMetric label="K Non-ASN" value={item.kebutuhan_non_asn} tone="amber" />
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {!loading && !error && data?.mode === "detail" ? (
        <>
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input h-9 py-1 pl-9 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari jabatan, atasan langsung, rumpun, atau nama pegawai" />
          </label>

          {saveMessage ? <p className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{saveMessage}</p> : null}
          {saveError ? <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">{saveError}</p> : null}
          {!data.editable && data.canEditKebutuhan ? <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">Pilih nama UKPD untuk mengubah angka kebutuhan. Rekap jenis UKPD bersifat hanya-baca.</p> : null}

          <section className="surface min-h-0 flex-1 overflow-hidden">
            <div className="max-h-[calc(100vh-250px)] overflow-auto">
              <table className="min-w-[2020px] border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-[#c7d9eb] text-[10px] font-black uppercase text-slate-900">
                  <tr>
                    <th className="sticky left-0 z-30 border border-slate-300 bg-[#c7d9eb] px-2 py-3">No.</th>
                    <th className="border border-slate-300 px-3 py-3">Nomenklatur ORB/Pergub</th><th className="border border-slate-300 px-2 py-3">KL ORB</th>
                    <th className="border border-slate-300 px-3 py-3">Nomenklatur MenPAN</th><th className="border border-slate-300 px-2 py-3">KL MenPAN</th>
                    <th className="border border-slate-300 px-3 py-3">Atasan Langsung</th><th className="border border-slate-300 px-3 py-3">Rumpun Jabatan</th>
                    <th className="border border-slate-300 bg-blue-100 px-2 py-3">B ASN</th><th className="border border-slate-300 bg-blue-100 px-2 py-3">K ASN</th><th className="border border-slate-300 bg-blue-100 px-2 py-3">S ASN</th>
                    <th className="border border-slate-300 bg-emerald-100 px-2 py-3">B Non-ASN</th><th className="border border-slate-300 bg-emerald-100 px-2 py-3">K Non-ASN</th><th className="border border-slate-300 bg-emerald-100 px-2 py-3">S Non-ASN</th>
                    <th className="border border-slate-300 px-3 py-3">Pegawai Pengisi ASN</th><th className="border border-slate-300 px-3 py-3">Pegawai Pengisi Non-ASN</th><th className="border border-slate-300 px-3 py-3">UKPD</th><th className="sticky right-0 z-30 border border-slate-300 bg-[#c7d9eb] px-3 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, index) => {
                    const isEditing = String(editing?.id) === String(item.id);
                    const canManageItem = data.canManageStructure && Number.isSafeInteger(Number(item.id));
                    return (
                      <tr key={item.id} className="align-top odd:bg-white even:bg-slate-50 hover:bg-amber-50">
                        <td className="sticky left-0 border border-slate-200 bg-inherit px-2 py-2 text-center font-bold">{index + 1}</td>
                        <td className="border border-slate-200 px-3 py-2 font-semibold">{item.nama_jabatan_orb || "—"}</td><td className="border border-slate-200 px-2 py-2 text-center">{item.kelas_jabatan_orb || "—"}</td>
                        <td className="border border-slate-200 px-3 py-2 font-semibold">{item.nama_jabatan_menpan || "—"}</td><td className="border border-slate-200 px-2 py-2 text-center">{item.kelas_jabatan_menpan || "—"}</td>
                        <td className="border border-slate-200 px-3 py-2">{item.atasan_langsung || "—"}</td><td className="border border-slate-200 px-3 py-2">{item.rumpun_jabatan || "—"}</td>
                        <td className="border border-slate-200 bg-blue-50/50 px-2 py-2 text-center font-bold">{formatNumber(item.bezetting_asn)}</td>
                        <td className="border border-slate-200 bg-blue-50/50 px-2 py-2 text-center font-bold">{isEditing ? <input type="number" min="0" step="1" className="w-20 rounded border border-blue-300 bg-white px-2 py-1 text-center" value={editing.kebutuhan_asn} onChange={(event) => setEditing((current) => ({ ...current, kebutuhan_asn: event.target.value }))} /> : formatNumber(item.kebutuhan_asn)}</td>
                        <td className={`border border-slate-200 px-2 py-2 text-center font-bold ${Number(item.bezetting_asn) - Number(item.kebutuhan_asn) > 0 ? "bg-red-100 text-red-700" : "bg-blue-50/50"}`}>{formatNumber(Number(item.bezetting_asn) - Number(item.kebutuhan_asn))}</td>
                        <td className="border border-slate-200 bg-emerald-50/50 px-2 py-2 text-center font-bold">{formatNumber(item.bezetting_non_asn)}</td>
                        <td className="border border-slate-200 bg-emerald-50/50 px-2 py-2 text-center font-bold">{isEditing ? <input type="number" min="0" step="1" className="w-20 rounded border border-emerald-300 bg-white px-2 py-1 text-center" value={editing.kebutuhan_non_asn} onChange={(event) => setEditing((current) => ({ ...current, kebutuhan_non_asn: event.target.value }))} /> : formatNumber(item.kebutuhan_non_asn)}</td>
                        <td className={`border border-slate-200 px-2 py-2 text-center font-bold ${Number(item.bezetting_non_asn) - Number(item.kebutuhan_non_asn) > 0 ? "bg-red-100 text-red-700" : "bg-emerald-50/50"}`}>{formatNumber(Number(item.bezetting_non_asn) - Number(item.kebutuhan_non_asn))}</td>
                        <td className="border border-slate-200 p-2"><PersonList people={item.pegawai_asn} /></td><td className="border border-slate-200 p-2"><PersonList people={item.pegawai_non_asn} /></td><td className="border border-slate-200 px-3 py-2">{data.selectedUkpd}</td>
                        <td className="sticky right-0 border border-slate-200 bg-white px-2 py-2 text-center">
                          {isEditing ? (
                            <div className="flex justify-center gap-1">
                              <button type="button" disabled={saving} onClick={saveKebutuhan} className="rounded bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-50" title="Simpan"><Check className="h-4 w-4" /></button>
                              <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded bg-slate-200 p-1.5 text-slate-700 hover:bg-slate-300 disabled:opacity-50" title="Batal"><X className="h-4 w-4" /></button>
                            </div>
                          ) : (
                            <div className="flex justify-center gap-1">
                              {data.editable ? <button type="button" onClick={() => startEditing(item)} className="rounded bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100" title="Edit kebutuhan"><Pencil className="h-4 w-4" /></button> : null}
                              {canManageItem ? <>
                                <button type="button" onClick={() => openStructureEditor(item)} className="rounded bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100" title="Edit struktur"><Pencil className="h-4 w-4" /></button>
                                <button type="button" onClick={() => deleteStructure(item)} className="rounded bg-red-50 p-1.5 text-red-700 hover:bg-red-100" title="Hapus jabatan"><Trash2 className="h-4 w-4" /></button>
                              </> : null}
                              {!data.editable && !canManageItem ? <span className="text-slate-400">—</span> : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {structureEditor ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="structure-editor-title">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 id="structure-editor-title" className="font-black text-slate-950">{structureEditor.id ? "Edit" : "Tambah"} Jabatan</h2>
                <p className="text-xs text-slate-500">Berlaku untuk seluruh UKPD jenis {data.template}; sinkron ke Verval, Peta Jabatan, dan form pegawai.</p>
              </div>
              <button type="button" onClick={() => { setStructureEditor(null); setSaveError(""); }} className="rounded p-2 hover:bg-slate-100" aria-label="Tutup"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {[
                ["nama_jabatan_orb", "Nama Jabatan ORB/Pergub"],
                ["kelas_jabatan_orb", "Kelas ORB"],
                ["nama_jabatan_menpan", "Nama Jabatan Menpan"],
                ["kelas_jabatan_menpan", "Kelas Menpan"],
                ["atasan_langsung", "Atasan Langsung"],
                ["rumpun_jabatan", "Rumpun Jabatan"],
                ["kebutuhan_asn", "Kebutuhan ASN"],
                ["kebutuhan_non_asn", "Kebutuhan Non-ASN"],
                ["urutan", "Urutan Struktur"]
              ].filter(([field]) => !structureEditor.id || !field.startsWith("kebutuhan_")).map(([field, label]) => (
                <label key={field} className={["nama_jabatan_orb", "nama_jabatan_menpan", "atasan_langsung", "rumpun_jabatan"].includes(field) ? "md:col-span-2" : ""}>
                  <span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>
                  <input
                    type={field.startsWith("kebutuhan_") || field === "urutan" ? "number" : "text"}
                    min={field.startsWith("kebutuhan_") || field === "urutan" ? "0" : undefined}
                    className="input"
                    value={structureEditor[field]}
                    onChange={(event) => setStructureEditor((current) => ({ ...current, [field]: event.target.value }))}
                  />
                </label>
              ))}
            </div>
            {saveError ? <p className="mx-5 mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{saveError}</p> : null}
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" disabled={structureSaving} onClick={() => { setStructureEditor(null); setSaveError(""); }} className="btn-secondary">Batal</button>
              <button type="button" disabled={structureSaving} onClick={saveStructure} className="btn-primary">{structureSaving ? "Menyimpan…" : "Simpan dan Sinkronkan"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-position-title">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="border-b px-5 py-4">
              <h2 id="delete-position-title" className="font-black text-red-800">Konfirmasi Hapus Jabatan</h2>
              <p className="mt-1 text-xs text-slate-500">Hanya baris jabatan dengan kombinasi berikut yang akan dihapus.</p>
            </div>
            <dl className="grid gap-3 p-5 text-sm sm:grid-cols-[150px_1fr]">
              <dt className="font-bold text-slate-500">ORB/Pergub</dt><dd className="font-semibold text-slate-900">{deleteTarget.nama_jabatan_orb || "—"}</dd>
              <dt className="font-bold text-slate-500">Menpan</dt><dd className="font-semibold text-slate-900">{deleteTarget.nama_jabatan_menpan || "—"}</dd>
              <dt className="font-bold text-slate-500">Atasan langsung</dt><dd className="font-semibold text-slate-900">{deleteTarget.atasan_langsung || "—"}</dd>
              <dt className="font-bold text-slate-500">Rumpun</dt><dd className="font-semibold text-slate-900">{deleteTarget.rumpun_jabatan || "—"}</dd>
              <dt className="font-bold text-slate-500">Jenis UKPD</dt><dd className="font-semibold text-slate-900">{data.template}</dd>
              <dt className="font-bold text-slate-500">ID baris</dt><dd className="font-mono font-semibold text-slate-900">{deleteTarget.id}</dd>
            </dl>
            {saveError ? <p className="mx-5 mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{saveError}</p> : null}
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" disabled={structureSaving} onClick={() => { setDeleteTarget(null); setSaveError(""); }} className="btn-secondary">Batal</button>
              <button type="button" disabled={structureSaving} onClick={confirmDeleteStructure} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">{structureSaving ? "Menghapus…" : "Hapus Baris Ini"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
