"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, FileSpreadsheet, Search } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import ErrorState from "@/components/ui/ErrorState";
import { downloadXlsx } from "@/lib/export/simpleXlsx";

function number(value) {
  return Number(value) || 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(number(value));
}

function emptyMetric() {
  return { b: 0, k: 0, s: 0 };
}

const IDENTITY_COLUMNS = [48, 208, 64, 208, 64, 208, 208];
const IDENTITY_WIDTH = IDENTITY_COLUMNS.reduce((total, width) => total + width, 0);

function frozenColumnStyle(index) {
  const width = IDENTITY_COLUMNS[index];
  return {
    left: IDENTITY_COLUMNS.slice(0, index).reduce((total, value) => total + value, 0),
    width,
    minWidth: width,
    maxWidth: width,
    ...(index === IDENTITY_COLUMNS.length - 1 ? { boxShadow: "3px 0 0 #94a3b8" } : {})
  };
}

function getMetric(container, unitId, group) {
  return container?.cells?.[String(unitId)]?.[group] || emptyMetric();
}

function totalMetric(container, units, group) {
  return (units || []).reduce((result, unit) => {
    const metric = getMetric(container, unit.id_ukpd, group);
    result.b += number(metric.b);
    result.k += number(metric.k);
    result.s += number(metric.s);
    return result;
  }, emptyMetric());
}

function groupCellClass(group) {
  return group === "asn" ? "bg-blue-50/50" : "bg-emerald-50/50";
}

function groupHeaderClass(group) {
  return group === "asn" ? "bg-blue-50" : "bg-emerald-50";
}

function unitHeaderClass(group) {
  return group === "asn" ? "bg-blue-100" : "bg-emerald-100";
}

function metricClass(type, value, group) {
  if (type === "s" && number(value) > 0) return "bg-red-100 font-extrabold text-red-700";
  return `${groupCellClass(group)} font-bold text-slate-800`;
}

function SummaryMetric({ label, value, tone }) {
  const className = tone === "blue" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800";
  return <span className={`rounded px-2 py-1 text-center text-[11px] font-extrabold ${className}`}>{label} {formatNumber(value)}</span>;
}

function MetricCells({ metric, group, summary = false, total = false }) {
  return ["b", "k", "s"].map((type) => (
    <td
      key={type}
      className={`border border-slate-300 px-2 py-2 text-center tabular-nums ${summary || total ? "font-black" : "text-xs"} ${total && type === "b" ? "border-l-2 border-l-slate-500" : ""} ${metricClass(type, metric[type], group)}`}
    >
      {formatNumber(metric[type])}
    </td>
  ));
}

export default function MatriksJabatanUkpdPage() {
  const [data, setData] = useState(null);
  const [template, setTemplate] = useState("");
  const [group, setGroup] = useState("asn");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view: "matrix" });
    if (template) params.set("template", template);
    setLoading(true);
    setError("");
    fetch(`/api/peta-jabatan?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.message || "Matriks jabatan gagal dimuat.");
        setData(body.data);
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [template, reloadKey]);

  const rows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id-ID");
    return (data?.rows || []).filter((item) => !keyword || [
      item.nama_jabatan_orb,
      item.nama_jabatan_menpan,
      item.atasan_langsung,
      item.rumpun_jabatan
    ].join(" ").toLocaleLowerCase("id-ID").includes(keyword));
  }, [data, search]);

  async function exportExcel() {
    if (!data?.units?.length) return;
    setExporting(true);
    try {
      const identityHeaders = [
        "No.",
        "Nomenklatur ORB/Pergub",
        "Kelas ORB",
        "Nomenklatur Kepmenpan",
        "Kelas Kepmenpan",
        "Atasan Langsung",
        "Rumpun Jabatan"
      ];
      const unitHeaders = data.units.flatMap((unit) => [
        `${unit.nama_ukpd} - B ${group === "asn" ? "ASN" : "NON-ASN"}`,
        `${unit.nama_ukpd} - K ${group === "asn" ? "ASN" : "NON-ASN"}`,
        `${unit.nama_ukpd} - S ${group === "asn" ? "ASN" : "NON-ASN"}`
      ]);
      const totalHeaders = [
        `TOTAL - B ${group === "asn" ? "ASN" : "NON-ASN"}`,
        `TOTAL - K ${group === "asn" ? "ASN" : "NON-ASN"}`,
        `TOTAL - S ${group === "asn" ? "ASN" : "NON-ASN"}`
      ];
      const summaryRows = (data.summaries || []).map((item) => [
        "",
        item.label,
        "",
        "",
        "",
        "",
        "",
        ...data.units.flatMap((unit) => {
          const metric = getMetric(item, unit.id_ukpd, group);
          return [metric.b, metric.k, metric.s];
        }),
        ...Object.values(totalMetric(item, data.units, group))
      ]);
      const detailRows = (data.rows || []).map((item, index) => [
        index + 1,
        item.nama_jabatan_orb || "-",
        item.kelas_jabatan_orb || "-",
        item.nama_jabatan_menpan || "-",
        item.kelas_jabatan_menpan || "-",
        item.atasan_langsung || "-",
        item.rumpun_jabatan || "-",
        ...data.units.flatMap((unit) => {
          const metric = getMetric(item, unit.id_ukpd, group);
          return [metric.b, metric.k, metric.s];
        }),
        ...Object.values(totalMetric(item, data.units, group))
      ]);
      await downloadXlsx({
        filename: `matriks-jabatan-${data.template.toLowerCase().replace(/\s+/g, "-")}-${group}.xlsx`,
        sheetName: `Matriks ${data.template}`,
        headers: [...identityHeaders, ...unitHeaders, ...totalHeaders],
        rows: [...summaryRows, ...detailRows]
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Matriks Jabatan UKPD"
        showBreadcrumb={false}
        action={data?.mode === "detail" ? (
          <div className="flex flex-wrap items-end justify-end gap-2">
            <div>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Kelompok Pegawai</p>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button type="button" onClick={() => setGroup("asn")} className={`rounded-md px-4 py-2 text-xs font-extrabold transition ${group === "asn" ? "bg-dinkes-800 text-white shadow" : "text-slate-600 hover:bg-white"}`}>ASN/PNS</button>
                <button type="button" onClick={() => setGroup("non_asn")} className={`rounded-md px-4 py-2 text-xs font-extrabold transition ${group === "non_asn" ? "bg-emerald-700 text-white shadow" : "text-slate-600 hover:bg-white"}`}>Non-ASN</button>
              </div>
            </div>
            <button className="btn-secondary mb-0.5" type="button" onClick={exportExcel} disabled={exporting || !data.units?.length}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              {exporting ? "Menyiapkan..." : "Export Excel"}
            </button>
          </div>
        ) : null}
      />

      {error ? <ErrorState description={error} onRetry={() => setReloadKey((value) => value + 1)} /> : (
        <div className="space-y-4">
          {loading ? (
            <section className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500 shadow-sm">Memuat matriks jabatan...</section>
          ) : data?.mode === "summary" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(data.summary || []).map((item) => (
                <button key={item.template_ukpd} type="button" onClick={() => setTemplate(item.template_ukpd)} className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-dinkes-300 hover:shadow-md">
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
          ) : data?.mode === "detail" ? (
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => { setTemplate(""); setSearch(""); }} className="btn-secondary px-3 py-2 text-xs">Semua Jenis</button>
                    <h2 className="text-base font-black text-slate-950">Perbandingan {data.template}</h2>
                  </div>
                  <label className="relative block w-full sm:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input className="form-input w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari jabatan, atasan, atau rumpun..." />
                  </label>
                </div>

                <div className="max-h-[calc(100vh-230px)] overflow-auto">
                  <table className="table-fixed border-collapse text-[11px]" style={{ minWidth: `${IDENTITY_WIDTH + ((data.units?.length || 0) + 1) * 168}px` }}>
                    <colgroup>
                      {IDENTITY_COLUMNS.map((width, index) => <col key={`identity-${index}`} style={{ width }} />)}
                      {(data.units || []).flatMap((unit) => ["b", "k", "s"].map((type) => <col key={`${unit.id_ukpd}-${type}`} style={{ width: 56 }} />))}
                      {["b", "k", "s"].map((type) => <col key={`total-${type}`} style={{ width: 56 }} />)}
                    </colgroup>
                    <thead className="sticky top-0 z-20 bg-white text-slate-950">
                      <tr>
                        {[
                          ["No.", "text-center"],
                          ["Nomenklatur ORB/Pergub", "text-left"],
                          ["KL ORB", "text-center"],
                          ["Nomenklatur Kepmenpan", "text-left"],
                          ["KL Menpan", "text-center"],
                          ["Atasan Langsung", "text-left"],
                          ["Rumpun Jabatan", "text-left"]
                        ].map(([label, alignment], index) => (
                          <th key={label} rowSpan="2" className={`sticky z-40 border border-slate-400 bg-slate-100 px-3 py-2 ${alignment}`} style={frozenColumnStyle(index)}>{label}</th>
                        ))}
                        {(data.units || []).map((unit) => (
                          <th key={unit.id_ukpd} colSpan="3" className={`w-[168px] border border-slate-400 px-2 py-2 text-center text-[10px] font-black uppercase leading-tight ${unitHeaderClass(group)}`}>
                            {unit.nama_ukpd}<span className={`mt-1 block text-[9px] ${group === "asn" ? "text-blue-800" : "text-emerald-800"}`}>{group === "asn" ? "ASN" : "NON-ASN"}</span>
                          </th>
                        ))}
                        <th colSpan="3" className="w-[168px] border border-l-2 border-slate-500 bg-slate-200 px-2 py-2 text-center text-[10px] font-black uppercase leading-tight">
                          Total {data.template}<span className="mt-1 block text-[9px] text-slate-700">{group === "asn" ? "ASN/PNS" : "NON-ASN"}</span>
                        </th>
                      </tr>
                      <tr>
                        {(data.units || []).flatMap((unit) => [
                          <th key={`${unit.id_ukpd}-b`} className={`border border-slate-400 px-2 py-1.5 text-center ${groupHeaderClass(group)}`}>B</th>,
                          <th key={`${unit.id_ukpd}-k`} className={`border border-slate-400 px-2 py-1.5 text-center ${groupHeaderClass(group)}`}>K</th>,
                          <th key={`${unit.id_ukpd}-s`} className={`border border-slate-400 px-2 py-1.5 text-center ${groupHeaderClass(group)}`}>S</th>
                        ])}
                        <th className="border border-l-2 border-slate-500 bg-slate-200 px-2 py-1.5 text-center">B</th>
                        <th className="border border-slate-500 bg-slate-200 px-2 py-1.5 text-center">K</th>
                        <th className="border border-slate-500 bg-slate-200 px-2 py-1.5 text-center">S</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.summaries || []).map((item) => (
                        <tr key={item.key} className="bg-slate-100">
                          <th colSpan="7" className="sticky left-0 z-30 border border-slate-400 bg-slate-100 px-3 py-2 text-left text-xs font-black uppercase" style={{ width: IDENTITY_WIDTH, minWidth: IDENTITY_WIDTH, maxWidth: IDENTITY_WIDTH, boxShadow: "3px 0 0 #94a3b8" }}>{item.label}</th>
                          {(data.units || []).flatMap((unit) => (
                            <MetricCells key={unit.id_ukpd} metric={getMetric(item, unit.id_ukpd, group)} group={group} summary />
                          ))}
                          <MetricCells metric={totalMetric(item, data.units, group)} group={group} summary total />
                        </tr>
                      ))}
                      {rows.map((item, index) => (
                        <tr key={item.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/50">
                          {[
                            [index + 1, "px-2 text-center font-bold"],
                            [item.nama_jabatan_orb || "-", "px-3 font-semibold text-slate-900"],
                            [item.kelas_jabatan_orb || "-", "px-2 text-center"],
                            [item.nama_jabatan_menpan || "-", "px-3 font-semibold text-slate-900"],
                            [item.kelas_jabatan_menpan || "-", "px-2 text-center"],
                            [item.atasan_langsung || "-", "px-3 text-slate-700"],
                            [item.rumpun_jabatan || "-", "px-3 text-slate-700"]
                          ].map(([value, className], columnIndex) => (
                            <td key={columnIndex} className={`sticky z-10 border border-slate-300 py-2 ${index % 2 ? "bg-slate-50" : "bg-white"} ${className}`} style={frozenColumnStyle(columnIndex)}>{value}</td>
                          ))}
                          {(data.units || []).flatMap((unit) => (
                            <MetricCells key={unit.id_ukpd} metric={getMetric(item, unit.id_ukpd, group)} group={group} />
                          ))}
                          <MetricCells metric={totalMetric(item, data.units, group)} group={group} total />
                        </tr>
                      ))}
                      {!rows.length ? (
                        <tr><td colSpan={10 + (data.units?.length || 0) * 3} className="border border-slate-300 px-4 py-10 text-center text-sm font-semibold text-slate-500">Tidak ada jabatan yang sesuai pencarian.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
          ) : null}
        </div>
      )}
    </>
  );
}
