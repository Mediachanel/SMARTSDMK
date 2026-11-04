"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Eye, Loader2, Search } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import ErrorState from "@/components/ui/ErrorState";
import { normalizePangkatGolonganOption } from "@/lib/pegawaiReferenceOptions";
import { compareDuk, getDukCompleteness, nipAppointmentDate } from "@/lib/duk/ranking";

const PANGKAT_RANK = [
  ["IV/e", "iv/e", "pembina utama"],
  ["IV/d", "iv/d", "pembina utama madya"],
  ["IV/c", "iv/c", "pembina utama muda"],
  ["IV/b", "iv/b", "pembina tk.i", "pembina tingkat i"],
  ["IV/a", "iv/a", "pembina"],
  ["III/d", "iii/d", "penata tk.i", "penata tingkat i"],
  ["III/c", "iii/c", "penata"],
  ["III/b", "iii/b", "penata muda tk.i", "penata muda tingkat i"],
  ["III/a", "iii/a", "penata muda"],
  ["II/d", "ii/d", "pengatur tk.i", "pengatur tingkat i"],
  ["II/c", "ii/c", "pengatur"],
  ["II/b", "ii/b", "pengatur muda tk.i", "pengatur muda tingkat i"],
  ["II/a", "ii/a", "pengatur muda"],
  ["I/d", "i/d", "juru tk.i", "juru tingkat i"],
  ["I/c", "i/c", "juru"],
  ["I/b", "i/b", "juru muda tk.i", "juru muda tingkat i"],
  ["I/a", "i/a", "juru muda"]
];

const EDUCATION_RANK = {
  S3: 12,
  SPESIALIS: 11,
  S2: 10,
  PROFESI: 9,
  S1: 8,
  D4: 7,
  D3: 6,
  D2: 5,
  D1: 4,
  "SMA/SMK": 3,
  SMA: 3,
  SMK: 3,
  SMP: 2,
  SD: 1
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function normalizePangkatText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\btingkat\b/g, "tk")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function hasGolonganCode(text, code) {
  const [group, level] = code.toLowerCase().split("/");
  const pattern = new RegExp(`(^|[^a-z0-9])${group}\\s*[/.]?\\s*${level}([^a-z0-9]|$)`);
  return pattern.test(text);
}

function pangkatRank(value) {
  const text = normalizePangkatText(value);
  const byCode = PANGKAT_RANK.findIndex(([code]) => hasGolonganCode(text, code));
  if (byCode !== -1) return byCode;

  const byName = PANGKAT_RANK.findIndex(([, , ...aliases]) => aliases.some((alias) => normalizePangkatText(alias) === text));
  return byName === -1 ? 999 : byName;
}

function educationRank(value) {
  const text = String(value || "").toUpperCase();
  const key = Object.keys(EDUCATION_RANK).find((item) => text.includes(item));
  return key ? EDUCATION_RANK[key] : 0;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00`);
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timeValue(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return value || "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

function yearsSince(value) {
  const start = value instanceof Date ? value : parseDate(value);
  if (!start) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  return `${Math.max(0, years)} th ${Math.max(0, months)} bln`;
}

function valueOrDash(value) {
  return value || "-";
}

function formatPangkatGolongan(value) {
  const normalized = normalizePangkatGolonganOption(value);
  return valueOrDash(normalized || value);
}

function rankBadgeClass(number) {
  if (number <= 3) return "bg-govgold-100 text-govgold-700 ring-govgold-300";
  if (number <= 10) return "bg-dinkes-50 text-dinkes-700 ring-dinkes-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function pangkatBadgeClass(value) {
  const rank = pangkatRank(value);
  if (rank <= 4) return "bg-violet-50 text-violet-700 ring-violet-200";
  if (rank <= 9) return "bg-dinkes-50 text-dinkes-700 ring-dinkes-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function pendidikanLabel(item) {
  const jenjang = String(item?.jenjang_pendidikan || "").trim();
  const programStudi = String(item?.program_studi || "").trim();
  if (jenjang && programStudi) return `${jenjang} - ${programStudi}`;
  return jenjang || programStudi || "-";
}

function educationEntryLabel(entry) {
  const study = [entry?.jenjang_pendidikan, entry?.program_studi].filter(Boolean).join(" - ");
  const institution = String(entry?.institusi || "").trim();
  const graduation = entry?.tanggal_ijazah || entry?.tahun_lulus;
  return `${study || "Pendidikan"}${institution ? `, ${institution}` : ""}${graduation ? ` (${formatDate(graduation)})` : ""}`;
}

function fullEducationLabel(item) {
  const history = Array.isArray(item?.riwayat_pendidikan_formal) ? item.riwayat_pendidikan_formal : [];
  return history.length ? history.map(educationEntryLabel).join("; ") : pendidikanLabel(item);
}

function fullTrainingLabel(item) {
  const history = Array.isArray(item?.riwayat_pelatihan) ? item.riwayat_pelatihan : [];
  return history.length ? history.map(educationEntryLabel).join("; ") : valueOrDash(item?.nama_latihan_jabatan);
}

function historyDateValue(entry, fields) {
  for (const field of fields) {
    const parsed = parseDate(entry?.[field]);
    if (parsed) return parsed.getTime();
  }
  return 0;
}

function sortHistoryRows(rows, fields) {
  return [...rows].sort((a, b) => historyDateValue(b, fields) - historyDateValue(a, fields));
}

function pangkatHistory(item) {
  const history = Array.isArray(item?.riwayat_pangkat) ? item.riwayat_pangkat : [];
  return sortHistoryRows(history, ["tmt_pangkat", "tanggal_sk"]);
}

function jabatanHistory(item) {
  const history = Array.isArray(item?.riwayat_jabatan) ? item.riwayat_jabatan : [];
  return sortHistoryRows(history, ["tmt_jabatan", "tanggal_sk"]);
}

function latestPangkatValue(item) {
  const history = pangkatHistory(item);
  return history.find((entry) => entry?.pangkat_golongan)?.pangkat_golongan || item?.pangkat_golongan;
}

function latestPangkatRow(item) {
  return pangkatHistory(item).find((entry) => entry?.pangkat_golongan || entry?.tmt_pangkat || entry?.tanggal_sk) || null;
}

function pangkatEntryLabel(entry) {
  const pangkatText = formatPangkatGolongan(entry?.pangkat_golongan);
  const tmt = entry?.tmt_pangkat || entry?.tanggal_sk;
  return `${pangkatText}${tmt ? ` - TMT ${formatDate(tmt)}` : ""}`;
}

function fullPangkatLabel(item) {
  const history = pangkatHistory(item);
  return history.length ? history.map(pangkatEntryLabel).join("; ") : formatPangkatGolongan(item?.pangkat_golongan);
}

function latestJabatanName(item) {
  const history = jabatanHistory(item);
  const latest = history.find((entry) => entry?.nama_jabatan_menpan || entry?.nama_jabatan_orb);
  return latest?.nama_jabatan_menpan || latest?.nama_jabatan_orb || item?.nama_jabatan_menpan || item?.nama_jabatan_orb || "";
}

function latestJabatanRow(item) {
  return jabatanHistory(item).find((entry) => entry?.nama_jabatan_menpan || entry?.nama_jabatan_orb || entry?.tmt_jabatan || entry?.tanggal_sk) || null;
}

function jabatanEntryLabel(entry) {
  const name = entry?.nama_jabatan_menpan || entry?.nama_jabatan_orb || "Jabatan";
  const tmt = entry?.tmt_jabatan || entry?.tanggal_sk;
  const eselon = entry?.eselon ? `, Eselon ${entry.eselon}` : "";
  return `${name}${tmt ? ` - TMT ${formatDate(tmt)}` : ""}${eselon}`;
}

function fullJabatanLabel(item) {
  const history = jabatanHistory(item);
  return history.length ? history.map(jabatanEntryLabel).join("; ") : valueOrDash(latestJabatanName(item));
}

function numberedPangkatHistoryLabel(item) {
  const history = pangkatHistory(item);
  return history.length ? history.map((entry, index) => `${index + 1}. ${pangkatEntryLabel(entry)}`).join("\n") : formatPangkatGolongan(item?.pangkat_golongan);
}

function numberedJabatanHistoryLabel(item) {
  const history = jabatanHistory(item);
  return history.length ? history.map((entry, index) => `${index + 1}. ${jabatanEntryLabel(entry)}`).join("\n") : valueOrDash(latestJabatanName(item));
}

function pangkatExportEntryLabel(entry) {
  const base = pangkatEntryLabel(entry);
  const sk = entry?.nomor_sk ? `, SK ${entry.nomor_sk}` : "";
  const lokasi = entry?.lokasi ? `, ${entry.lokasi}` : "";
  return `${base}${sk}${lokasi}`;
}

function jabatanExportEntryLabel(entry) {
  const base = jabatanEntryLabel(entry);
  const unit = entry?.nama_ukpd ? `, ${entry.nama_ukpd}` : "";
  const sk = entry?.nomor_sk ? `, SK ${entry.nomor_sk}` : "";
  return `${base}${unit}${sk}`;
}

function numberedPangkatExportLabel(item) {
  const history = pangkatHistory(item);
  return history.length ? history.map((entry, index) => `${index + 1}. ${pangkatExportEntryLabel(entry)}`).join("\n") : formatPangkatGolongan(item?.pangkat_golongan);
}

function numberedJabatanExportLabel(item) {
  const history = jabatanHistory(item);
  return history.length ? history.map((entry, index) => `${index + 1}. ${jabatanExportEntryLabel(entry)}`).join("\n") : valueOrDash(latestJabatanName(item));
}

function numberedEducationHistoryLabel(entries, fallback) {
  return entries.length ? entries.map((entry, index) => `${index + 1}. ${educationEntryLabel(entry)}`).join("\n") : valueOrDash(fallback);
}

function withLatestHistoryValues(item) {
  const latestPangkat = latestPangkatRow(item);
  const latestJabatan = latestJabatanRow(item);
  return {
    ...item,
    pangkat_golongan: latestPangkat?.pangkat_golongan || item.pangkat_golongan,
    tmt_pangkat_terakhir: latestPangkat?.tmt_pangkat || latestPangkat?.tanggal_sk || item.tmt_pangkat_terakhir,
    nama_jabatan_menpan: latestJabatan?.nama_jabatan_menpan || item.nama_jabatan_menpan,
    nama_jabatan_orb: latestJabatan?.nama_jabatan_orb || item.nama_jabatan_orb,
    jenis_jabatan: latestJabatan?.jenis_jabatan || item.jenis_jabatan,
    eselon: latestJabatan?.eselon || item.eselon,
    tmt_jabatan: latestJabatan?.tmt_jabatan || latestJabatan?.tanggal_sk || item.tmt_jabatan
  };
}

function RankBadge({ number }) {
  return (
    <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-extrabold ring-1 ${rankBadgeClass(number)}`}>
      {number}
    </span>
  );
}

function PangkatBadge({ value }) {
  const text = formatPangkatGolongan(value);

  return (
    <span className={`inline-flex w-full max-w-[220px] items-center justify-center rounded-md px-3 py-1.5 text-center text-xs font-bold leading-5 ring-1 ${pangkatBadgeClass(value)}`} title={text}>
      <span className="truncate">{text}</span>
    </span>
  );
}

function HistoryList({ rows, fallback, render }) {
  if (!rows.length) {
    return <p className="text-xs leading-5 text-slate-700">{fallback || "-"}</p>;
  }

  return (
    <div className="duk-history-list">
      {rows.map((entry, historyIndex) => (
        <div key={historyIndex} className="duk-history-item">
          <span className="duk-history-number">{historyIndex + 1}</span>
          <span>{render(entry, historyIndex)}</span>
        </div>
      ))}
    </div>
  );
}

function DukFilters({ search, setSearch, pangkat, setPangkat, jabatan, setJabatan, ukpd, setUkpd, pangkatOptions, jabatanOptions, ukpdOptions, hasActiveFilters, onReset }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_160px_minmax(170px,230px)_minmax(170px,230px)_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input h-10 pl-9 text-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, NIP, jabatan, atau UKPD"
          />
        </label>
        <select className="input h-10 text-sm" value={pangkat} onChange={(event) => setPangkat(event.target.value)}>
          <option value="">Semua pangkat</option>
          {pangkatOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select className="input h-10 text-sm" value={jabatan} onChange={(event) => setJabatan(event.target.value)}>
          <option value="">Semua jabatan</option>
          {jabatanOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select className="input h-10 text-sm" value={ukpd} onChange={(event) => setUkpd(event.target.value)}>
          <option value="">Semua UKPD</option>
          {ukpdOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        {hasActiveFilters ? (
          <button className="btn-secondary h-10 px-4 text-sm" type="button" onClick={onReset}>
            Reset
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DukTable({ rows, startNumber }) {
  return (
    <section className="surface flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid gap-3 p-3 md:hidden">
        {rows.map((item, index) => {
          const number = startNumber + index;
          return (
            <article key={item.id_pegawai} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <RankBadge number={number} />
                <div className="min-w-0 flex-1">
                  <Link className="block truncate text-sm font-extrabold text-slate-950 hover:text-dinkes-700" href={`/pegawai/${item.id_pegawai}`}>
                    {valueOrDash(item.nama)}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">NIP {valueOrDash(item.nip)}</p>
                </div>
                <Link className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-dinkes-300 hover:text-dinkes-700" href={`/pegawai/${item.id_pegawai}`}>
                  Profil
                </Link>
              </div>
              <div className="mt-3 grid gap-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-500">Pangkat</span>
                  <span className="flex w-[180px] max-w-[58vw] justify-end">
                    <PangkatBadge value={latestPangkatValue(item)} />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-500">TMT Pangkat</span>
                  <span className="font-semibold text-slate-800">{formatDate(item.tmt_pangkat_terakhir)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-500">Masa Kerja</span>
                  <span className="font-semibold text-slate-800">{yearsSince(nipAppointmentDate(item.nip)) || "-"}</span>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="font-semibold text-slate-500">Jabatan</p>
                  <p className="mt-1 whitespace-pre-line leading-5 text-slate-800">{numberedJabatanHistoryLabel(item)}</p>
                  <p className="mt-1 text-slate-500">TMT {formatDate(item.tmt_jabatan)} · {valueOrDash(item.eselon)}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="font-semibold text-slate-500">Riwayat Pangkat</p>
                  <p className="mt-1 whitespace-pre-line leading-5 text-slate-800">{numberedPangkatHistoryLabel(item)}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="font-semibold text-slate-500">Pendidikan</p>
                  <p className="mt-1 line-clamp-4 leading-5 text-slate-800">{fullEducationLabel(item)}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="font-semibold text-slate-500">Pelatihan</p>
                  <p className="mt-1 line-clamp-4 leading-5 text-slate-800">{fullTrainingLabel(item)}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="font-semibold text-slate-500">Unit Kerja</p>
                  <p className="mt-1 leading-5 text-slate-800">{valueOrDash(item.nama_ukpd)}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="font-semibold text-slate-500">Kelengkapan Data</p>
                  <p className="mt-1 leading-5 text-slate-800">{getDukCompleteness(item).complete ? "Lengkap" : `Belum ada: ${getDukCompleteness(item).missing.join(", ")}`}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="table-scroll hidden min-h-0 flex-1 md:block">
        <table className="w-full min-w-[1760px] table-fixed border-collapse">
          <colgroup>
            <col className="w-[72px]" />
            <col className="w-[230px]" />
            <col className="w-[360px]" />
            <col className="w-[520px]" />
            <col className="w-[230px]" />
            <col className="w-[260px]" />
            <col className="w-[190px]" />
            <col className="w-[100px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="table-th sticky left-0 z-30 bg-[#f3f4f6] text-center uppercase" scope="col">No</th>
              <th className="table-th sticky left-[72px] z-30 bg-[#f3f4f6] uppercase" scope="col">Pegawai</th>
              <th className="table-th uppercase" scope="col">Pangkat/Gol</th>
              <th className="table-th uppercase" scope="col">Jabatan</th>
              <th className="table-th uppercase" scope="col">Pendidikan</th>
              <th className="table-th uppercase" scope="col">Pelatihan</th>
              <th className="table-th uppercase" scope="col">Unit Kerja</th>
              <th className="table-th sticky right-0 z-30 bg-[#f3f4f6] text-center uppercase" scope="col">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((item, index) => {
              const number = startNumber + index;
              const rankHistory = pangkatHistory(item);
              const positionHistory = jabatanHistory(item);
              return (
                <tr key={item.id_pegawai} className="group align-top hover:bg-dinkes-50/40">
                  <td className="table-td sticky left-0 z-20 bg-white text-center align-middle group-hover:bg-dinkes-50/40">
                    <RankBadge number={number} />
                  </td>
                  <td className="table-td sticky left-[72px] z-20 bg-white align-middle group-hover:bg-dinkes-50/40">
                    <Link className="block truncate text-sm font-extrabold leading-5 text-slate-950 hover:text-dinkes-700" href={`/pegawai/${item.id_pegawai}`}>
                      {valueOrDash(item.nama)}
                    </Link>
                    <p className="mt-1 truncate text-xs leading-5 text-slate-500">NIP {valueOrDash(item.nip)}</p>
                  </td>
                  <td className="table-td whitespace-normal align-top">
                    <HistoryList rows={rankHistory} fallback={formatPangkatGolongan(item.pangkat_golongan)} render={pangkatEntryLabel} />
                  </td>
                  <td className="table-td whitespace-normal align-top text-slate-700">
                    <HistoryList rows={positionHistory} fallback={valueOrDash(latestJabatanName(item))} render={jabatanEntryLabel} />
                    <p className="mt-2 text-xs font-semibold text-slate-500">Masa kerja {yearsSince(nipAppointmentDate(item.nip)) || "-"}</p>
                  </td>
                  <td className="table-td whitespace-normal">
                    <p className="line-clamp-4 text-xs leading-5 text-slate-700" title={fullEducationLabel(item)}>{fullEducationLabel(item)}</p>
                  </td>
                  <td className="table-td whitespace-normal">
                    <p className="line-clamp-4 text-xs leading-5 text-slate-700" title={fullTrainingLabel(item)}>{fullTrainingLabel(item)}</p>
                  </td>
                  <td className="table-td whitespace-normal leading-5 text-slate-700">
                    <p className="line-clamp-3">{valueOrDash(item.nama_ukpd)}</p>
                  </td>
                  <td className="table-td sticky right-0 z-20 bg-white text-center group-hover:bg-dinkes-50/40">
                  <Link
                    href={`/pegawai/${item.id_pegawai}`}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-dinkes-300 hover:text-dinkes-700"
                  >
                    <Eye className="h-4 w-4" />
                    Profil
                  </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length ? (
        <div className="px-4 py-10 text-center text-sm font-medium text-slate-500">
          Tidak ada pegawai yang sesuai dengan filter.
        </div>
      ) : null}
    </section>
  );
}

function Pagination({ page, setPage, pageSize, setPageSize, total }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="font-medium">
        Menampilkan <span className="font-bold text-slate-900">{formatNumber(start)}-{formatNumber(end)}</span> dari <span className="font-bold text-slate-900">{formatNumber(total)}</span> pegawai.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Per halaman</span>
        <select className="input w-24 py-2" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <button className="btn-secondary px-3 py-2" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[7rem] rounded-lg bg-slate-50 px-3 py-2 text-center font-bold text-slate-800">Hal {page} / {totalPages}</span>
        <button className="btn-secondary px-3 py-2" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

export default function DukPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [pangkat, setPangkat] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [ukpd, setUkpd] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage("");
    fetch("/api/duk")
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.success) throw new Error(payload?.message || "Data DUK gagal dimuat.");
        if (active) setRows(payload.data || []);
      })
      .catch((error) => {
        if (active) {
          setRows([]);
          setErrorMessage(error.message || "Data DUK gagal dimuat.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [jabatan, pangkat, search, ukpd]);

  const pangkatOptions = useMemo(() => [...new Set(rows.map((item) => formatPangkatGolongan(latestPangkatValue(item))).filter((item) => item !== "-"))].sort((a, b) => pangkatRank(a) - pangkatRank(b) || a.localeCompare(b, "id")), [rows]);
  const jabatanOptions = useMemo(() => [...new Set(rows.map((item) => latestJabatanName(item)).filter(Boolean))], [rows]);
  const ukpdOptions = useMemo(() => [...new Set(rows.map((item) => item.nama_ukpd).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [rows]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return rows.map(withLatestHistoryValues).filter((item) => {
      const matchSearch = [item.nama, item.nip, item.nama_ukpd, fullPangkatLabel(item), fullJabatanLabel(item), fullEducationLabel(item), fullTrainingLabel(item)].join(" ").toLowerCase().includes(query);
      return matchSearch
        && (!pangkat || formatPangkatGolongan(latestPangkatValue(item)) === pangkat)
        && (!jabatan || latestJabatanName(item) === jabatan)
        && (!ukpd || item.nama_ukpd === ukpd);
    }).sort(compareDuk);
  }, [jabatan, pangkat, rows, search, ukpd]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasActiveFilters = Boolean(search || pangkat || jabatan || ukpd);

  async function exportDuk() {
    if (exporting || !filtered.length) return;
    setExporting(true);
    try {
      const excelModule = await import("exceljs");
      const ExcelJS = excelModule.default || excelModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SMART SDMK";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("DUK", {
        properties: { defaultRowHeight: 20 },
        pageSetup: {
          orientation: "landscape",
          paperSize: 14,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          horizontalCentered: true,
          margins: { left: 0.2, right: 0.2, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
        },
        views: [{ state: "frozen", ySplit: 1, xSplit: 2 }]
      });

      const headers = ["No.", "Nama Pegawai", "NIP", "Pangkat/Gol.", "TMT Pangkat", "Jabatan", "Eselon", "TMT Jabatan", "Masa Kerja", "Pendidikan", "Pelatihan", "Tanggal Lahir", "Usia", "Unit Kerja"];
      const lastColumn = "N";
      const headerRow = worksheet.getRow(1);
      headerRow.values = headers;
      headerRow.height = 26;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF073763" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { top: { style: "thin", color: { argb: "FF64748B" } }, left: { style: "thin", color: { argb: "FF64748B" } }, bottom: { style: "thin", color: { argb: "FF64748B" } }, right: { style: "thin", color: { argb: "FF64748B" } } };
      });

      const rankHistoryRows = [];
      const positionHistoryRows = [];

      filtered.forEach((item, index) => {
        const formalHistory = Array.isArray(item.riwayat_pendidikan_formal) ? item.riwayat_pendidikan_formal : [];
        const trainingHistory = Array.isArray(item.riwayat_pelatihan) ? item.riwayat_pelatihan : [];
        const rankHistory = pangkatHistory(item);
        const positionHistory = jabatanHistory(item);
        pangkatHistory(item).forEach((entry, historyIndex) => {
          rankHistoryRows.push([
            item.nama || "-",
            item.nip || "-",
            historyIndex + 1,
            formatPangkatGolongan(entry.pangkat_golongan),
            parseDate(entry.tmt_pangkat) || entry.tmt_pangkat || "-",
            entry.lokasi || "-",
            entry.nomor_sk || "-",
            parseDate(entry.tanggal_sk) || entry.tanggal_sk || "-",
            entry.keterangan || "-"
          ]);
        });
        jabatanHistory(item).forEach((entry, historyIndex) => {
          positionHistoryRows.push([
            item.nama || "-",
            item.nip || "-",
            historyIndex + 1,
            entry.nama_jabatan_menpan || entry.nama_jabatan_orb || "-",
            entry.jenis_jabatan || "-",
            entry.eselon || "-",
            parseDate(entry.tmt_jabatan) || entry.tmt_jabatan || "-",
            entry.nama_ukpd || item.nama_ukpd || "-",
            entry.nomor_sk || "-",
            parseDate(entry.tanggal_sk) || entry.tanggal_sk || "-",
            entry.keterangan || "-"
          ]);
        });
        const row = worksheet.addRow([
          index + 1,
          item.nama || "-",
          item.nip || "-",
          numberedPangkatExportLabel(item),
          parseDate(item.tmt_pangkat_terakhir) || item.tmt_pangkat_terakhir || "-",
          numberedJabatanExportLabel(item),
          item.eselon || "-",
          parseDate(item.tmt_jabatan) || item.tmt_jabatan || "-",
          yearsSince(nipAppointmentDate(item.nip)) || "-",
          numberedEducationHistoryLabel(formalHistory, pendidikanLabel(item)),
          numberedEducationHistoryLabel(trainingHistory, item.nama_latihan_jabatan),
          parseDate(item.tanggal_lahir) || item.tanggal_lahir || "-",
          yearsSince(item.tanggal_lahir) || "-",
          item.nama_ukpd || "-"
        ]);
        const longestHistory = Math.max(1, rankHistory.length, positionHistory.length, formalHistory.length, trainingHistory.length);
        row.height = Math.min(260, Math.max(34, 16 + (longestHistory * 18)));
        row.eachCell((cell, columnNumber) => {
          cell.font = { name: "Arial", size: [4, 6, 10, 11].includes(columnNumber) ? 8 : 9 };
          cell.alignment = { vertical: "top", wrapText: true, horizontal: [1, 5, 7, 8, 9, 12, 13].includes(columnNumber) ? "center" : "left" };
          cell.border = { top: { style: "hair", color: { argb: "FF94A3B8" } }, left: { style: "hair", color: { argb: "FF94A3B8" } }, bottom: { style: "hair", color: { argb: "FF94A3B8" } }, right: { style: "hair", color: { argb: "FF94A3B8" } } };
          if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        });
        [5, 8, 12].forEach((columnNumber) => {
          if (row.getCell(columnNumber).value instanceof Date) row.getCell(columnNumber).numFmt = "dd/mm/yyyy";
        });
        row.getCell(3).numFmt = "@";
      });

      [5, 30, 21, 36, 13, 52, 10, 13, 14, 38, 38, 13, 13, 28].forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
      worksheet.getColumn(3).numFmt = "@";
      worksheet.autoFilter = { from: "A1", to: `${lastColumn}1` };
      worksheet.pageSetup.printArea = `A1:${lastColumn}${worksheet.rowCount}`;
      worksheet.pageSetup.printTitlesRow = "1:1";
      worksheet.headerFooter.oddFooter = "&L SMART SDMK&C Halaman &P dari &N&R DUK PNS";
      worksheet.headerFooter.evenFooter = worksheet.headerFooter.oddFooter;

      const addHistorySheet = (sheetName, historyHeaders, historyRows, widths, dateColumns = []) => {
        const sheet = workbook.addWorksheet(sheetName, {
          properties: { defaultRowHeight: 20 },
          views: [{ state: "frozen", ySplit: 1 }]
        });
        const row = sheet.getRow(1);
        row.values = historyHeaders;
        row.height = 26;
        row.eachCell((cell) => {
          cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF073763" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.border = { top: { style: "thin", color: { argb: "FF64748B" } }, left: { style: "thin", color: { argb: "FF64748B" } }, bottom: { style: "thin", color: { argb: "FF64748B" } }, right: { style: "thin", color: { argb: "FF64748B" } } };
        });
        historyRows.forEach((values, rowIndex) => {
          const historyRow = sheet.addRow(values);
          historyRow.eachCell((cell, columnNumber) => {
            cell.font = { name: "Arial", size: 9 };
            cell.alignment = { vertical: "middle", wrapText: true, horizontal: [3, ...dateColumns].includes(columnNumber) ? "center" : "left" };
            cell.border = { top: { style: "hair", color: { argb: "FF94A3B8" } }, left: { style: "hair", color: { argb: "FF94A3B8" } }, bottom: { style: "hair", color: { argb: "FF94A3B8" } }, right: { style: "hair", color: { argb: "FF94A3B8" } } };
            if (rowIndex % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
            if (dateColumns.includes(columnNumber) && cell.value instanceof Date) cell.numFmt = "dd/mm/yyyy";
          });
        });
        widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
        sheet.getColumn(2).numFmt = "@";
        sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + historyHeaders.length)}1` };
      };

      addHistorySheet(
        "Riwayat Pangkat",
        ["Nama Pegawai", "NIP", "No.", "Pangkat/Gol.", "TMT Pangkat", "Lokasi", "No. SK", "Tanggal SK", "Keterangan"],
        rankHistoryRows,
        [30, 21, 6, 22, 13, 24, 22, 13, 30],
        [5, 8]
      );
      addHistorySheet(
        "Riwayat Jabatan",
        ["Nama Pegawai", "NIP", "No.", "Jabatan", "Jenis Jabatan", "Eselon", "TMT Jabatan", "UKPD", "No. SK", "Tanggal SK", "Keterangan"],
        positionHistoryRows,
        [30, 21, 6, 44, 18, 10, 13, 28, 22, 13, 30],
        [7, 10]
      );

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `DUK-PNS-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error?.message || "Export Excel DUK gagal. Silakan coba kembali.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-2 lg:h-[calc(100vh-5.5rem)] lg:overflow-hidden">
      <PageHeader
        title="Daftar Urut Kepangkatan"
        breadcrumbs={[{ label: "DUK" }]}
        compact
        action={<button className="btn-secondary" type="button" onClick={exportDuk} disabled={exporting || !filtered.length}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} {exporting ? "Menyiapkan Excel…" : "Export Excel F4"}</button>}
      />
      <DukFilters
        search={search}
        setSearch={setSearch}
        pangkat={pangkat}
        setPangkat={setPangkat}
        jabatan={jabatan}
        setJabatan={setJabatan}
        ukpd={ukpd}
        setUkpd={setUkpd}
        pangkatOptions={pangkatOptions}
        jabatanOptions={jabatanOptions}
        ukpdOptions={ukpdOptions}
        hasActiveFilters={hasActiveFilters}
        onReset={() => {
          setSearch("");
          setPangkat("");
          setJabatan("");
          setUkpd("");
          setPage(1);
        }}
      />

      {loading ? (
        <div className="min-h-0 flex-1 animate-pulse rounded-lg bg-white" />
      ) : errorMessage ? (
        <ErrorState description={errorMessage} onRetry={() => setRefreshKey((value) => value + 1)} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <DukTable rows={paginatedRows} startNumber={(safePage - 1) * pageSize + 1} />
          <Pagination page={safePage} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={filtered.length} />
        </div>
      )}
    </div>
  );
}
