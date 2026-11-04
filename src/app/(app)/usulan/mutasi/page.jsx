"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileWarning,
  Pencil,
  Plus,
  Printer,
  Save,
  Send,
  ShieldCheck,
  SquarePen,
  Trash2,
  Upload,
  X
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import PdfDocumentPreview from "@/components/ui/PdfDocumentPreview";
import DataTable from "@/components/tables/DataTable";
import SearchFilterBar from "@/components/forms/SearchFilterBar";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ActionDrawer from "@/components/ui/ActionDrawer";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { ROLES } from "@/lib/constants/roles";
import {
  CHECKLIST_DOCUMENT_MAX_BYTES,
  CHECKLIST_DOCUMENT_MAX_MB,
  MUTASI_CHECKLIST_LABELS as CHECKLIST_LABELS,
  formatFileSize,
  hasChecklistDocument,
  parseChecklist,
  parseChecklistDocuments
} from "@/lib/usulan/checklist";

const FLOW_STEPS = [
  { key: 1, title: "UKPD Mengusulkan" },
  { key: 2, title: "Sudin Verifikasi" },
  { key: 3, title: "Diterima Dinas" },
  { key: 4, title: "Dinas Verifikasi" },
  { key: 5, title: "Lanjut Putus JF" }
];

const STATUS_OPTIONS = ["Diusulkan", "Verifikasi Sudin", "Diterima Dinas", "Verifikasi Dinas", "Dikembalikan", "Selesai", "Ditolak"];
const DINAS_PRINT_STATUSES = new Set(["diterima dinas", "verifikasi dinas", "diproses", "selesai"]);
const DINAS_PROCESSED_STATUSES = new Set(["diterima dinas", "verifikasi dinas", "diproses", "selesai"]);

const emptyForm = {
  nrk: "",
  nip: "",
  nama_pegawai: "",
  gelar_depan: "",
  gelar_belakang: "",
  pangkat_golongan: "",
  nama_ukpd: "",
  ukpd_tujuan: "",
  jabatan: "",
  jabatan_baru: "",
  jenis_mutasi: "Mutasi",
  alasan: "",
  berkas_path: "",
  keterangan: "",
  abk_j_lama: "",
  bezetting_j_lama: "",
  nonasn_bezetting_lama: "",
  nonasn_abk_lama: "",
  abk_j_baru: "",
  bezetting_j_baru: "",
  nonasn_bezetting_baru: "",
  nonasn_abk_baru: ""
};

const emptyVerifyForm = {
  id: null,
  status: "Verifikasi Sudin",
  keterangan: "",
  verif_checklist: Object.fromEntries(Object.keys(CHECKLIST_LABELS).map((key) => [key, false])),
  dokumen_checklist: Object.fromEntries(Object.keys(CHECKLIST_LABELS).map((key) => [key, null]))
};

function emptyChecklistDocuments() {
  return Object.fromEntries(Object.keys(CHECKLIST_LABELS).map((key) => [key, null]));
}

function uniqueOptions(values) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
}

function optionsWithCurrent(options, current) {
  return uniqueOptions([...options, current]);
}

async function parseApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text().catch(() => "");
  const summary = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  throw new Error(summary || fallbackMessage);
}

function getPegawaiJabatan(item) {
  return item?.nama_jabatan_menpan || item?.nama_jabatan_orb || item?.jabatan || "";
}

function applyPegawaiToForm(current, pegawai) {
  return {
    ...current,
    nrk: pegawai.nrk || current.nrk || "",
    nip: pegawai.nip || "",
    nama_pegawai: pegawai.nama || pegawai.nama_pegawai || "",
    gelar_depan: pegawai.gelar_depan || "",
    gelar_belakang: pegawai.gelar_belakang || "",
    pangkat_golongan: pegawai.pangkat_golongan || "",
    nama_ukpd: pegawai.nama_ukpd || "",
    jabatan: getPegawaiJabatan(pegawai)
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumberInput(value) {
  return value === "" || value === null || value === undefined ? "" : String(value);
}

function mapAbkLookupToFields(result, prefix) {
  if (!result) {
    return {
      [`abk_j_${prefix}`]: "",
      [`bezetting_j_${prefix}`]: "",
      [`nonasn_bezetting_${prefix}`]: "",
      [`nonasn_abk_${prefix}`]: ""
    };
  }
  return {
    [`abk_j_${prefix}`]: normalizeNumberInput(result.kebutuhan_asn),
    [`bezetting_j_${prefix}`]: normalizeNumberInput(result.bezetting_asn),
    [`nonasn_bezetting_${prefix}`]: normalizeNumberInput(result.bezetting_non_asn),
    [`nonasn_abk_${prefix}`]: normalizeNumberInput(result.kebutuhan_non_asn)
  };
}

async function fetchAbkLookup({ ukpd, jabatan, signal }) {
  if (!normalizeText(ukpd) || !normalizeText(jabatan)) return null;
  const params = new URLSearchParams({ ukpd: normalizeText(ukpd), jabatan: normalizeText(jabatan) });
  const response = await fetch(`/api/peta-jabatan/lookup?${params.toString()}`, { cache: "no-store", signal });
  const payload = await parseApiResponse(response, "Ringkasan ABK gagal dimuat.");
  if (!response.ok || !payload.success) throw new Error(payload.message || "Ringkasan ABK gagal dimuat.");
  return payload.data;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function getDownloadFileName(disposition, fallback) {
  if (!disposition) return fallback;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

function canPrintDinasPertimbangan(user, item, statusOverride = "") {
  if (user?.role !== ROLES.SUPER_ADMIN || !item?.id) return false;
  const status = normalizeText(statusOverride || item.status).toLowerCase();
  return DINAS_PRINT_STATUSES.has(status);
}

function canDeleteUsulan(user, item) {
  if (!user || !item?.id) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  return !DINAS_PROCESSED_STATUSES.has(normalizeText(item.status).toLowerCase());
}

function getChecklistSummary(item) {
  const checklist = parseChecklist(item.verif_checklist, CHECKLIST_LABELS);
  const documents = parseChecklistDocuments(item.dokumen_checklist, CHECKLIST_LABELS, "mutasi", item.id);
  const entries = Object.entries(CHECKLIST_LABELS).map(([key, label]) => ({
    key,
    label,
    checked: Boolean(checklist[key]),
    document: documents[key],
    hasDocument: hasChecklistDocument(documents[key])
  }));
  const checked = entries.filter((entry) => entry.checked).length;
  const documentCount = entries.filter((entry) => entry.hasDocument).length;
  return {
    checklist: entries,
    total: entries.length,
    checked,
    documentCount,
    percent: entries.length ? Math.round((documentCount / entries.length) * 100) : 0
  };
}

function getMutasiFlow(item) {
  const status = normalizeText(item.status).toLowerCase();
  if (status === "verifikasi sudin") return { step: 2, stageLabel: "Verifikasi Sudin", nextAction: "Sudin memeriksa berkas administrasi." };
  if (status === "diterima dinas") return { step: 3, stageLabel: "Diterima Dinas", nextAction: "Siapkan telaah dan verifikasi Dinas." };
  if (status === "verifikasi dinas") return { step: 4, stageLabel: "Verifikasi Dinas", nextAction: "Dinas menilai kesesuaian dan keputusan akhir." };
  if (status === "dikembalikan" || status === "ditolak") return { step: 2, stageLabel: "Kembali ke Sudin", nextAction: "Lengkapi lalu kirim ulang." };
  if (status === "selesai") return { step: 5, stageLabel: "Siap/Tuntas", nextAction: "Lanjut atau arsipkan usulan." };
  if (status === "diproses") return { step: 3, stageLabel: "Diterima Dinas", nextAction: "Usulan sedang diproses lebih lanjut." };
  return { step: 1, stageLabel: "Usulan UKPD", nextAction: "Lengkapi berkas awal dan kirim ke Sudin." };
}

function SummaryCard({ title, value, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white",
    blue: "border-sky-200 bg-sky-50/70",
    emerald: "border-emerald-200 bg-emerald-50/70",
    amber: "border-amber-200 bg-amber-50/70"
  };
  return (
    <div className={`rounded-xl border p-3 shadow-sm sm:rounded-2xl sm:p-4 ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-semibold text-slate-600 sm:text-sm">{title}</p>
      <p className="mt-1 text-xl font-bold text-slate-950 sm:mt-2 sm:text-2xl">{value}</p>
    </div>
  );
}

function FlowStrip({ activeStep }) {
  return (
    <section className="surface p-3 sm:p-5">
      <div className="flex gap-2 overflow-x-auto pb-1 lg:items-stretch lg:overflow-visible lg:pb-0">
        {FLOW_STEPS.map((step, index) => {
          const active = step.key === activeStep;
          const passed = step.key < activeStep;
          return (
            <div key={step.key} className={`flex min-w-36 flex-1 items-center gap-2 rounded-xl border px-3 py-2 lg:min-w-0 lg:items-start lg:gap-3 lg:border-0 lg:px-0 lg:py-0 ${active ? "border-dinkes-200 bg-dinkes-50/70 lg:bg-transparent" : "border-slate-200 bg-white lg:bg-transparent"}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold lg:mt-0.5 lg:h-9 lg:w-9 lg:text-sm ${passed ? "bg-emerald-600 text-white" : active ? "bg-dinkes-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                {step.key}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-bold leading-4 lg:text-sm ${active ? "text-dinkes-800" : "text-slate-700"}`}>{step.title}</p>
              </div>
              {index < FLOW_STEPS.length - 1 ? <ArrowRight className="mt-2 hidden h-4 w-4 shrink-0 text-slate-300 lg:block" /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function buildFormFromItem(item, fallbackUkpd = "") {
  return {
    ...emptyForm,
    ...item,
    nama_ukpd: item?.nama_ukpd || fallbackUkpd || "",
    abk_j_lama: normalizeNumberInput(item?.abk_j_lama),
    bezetting_j_lama: normalizeNumberInput(item?.bezetting_j_lama),
    nonasn_bezetting_lama: normalizeNumberInput(item?.nonasn_bezetting_lama),
    nonasn_abk_lama: normalizeNumberInput(item?.nonasn_abk_lama),
    abk_j_baru: normalizeNumberInput(item?.abk_j_baru),
    bezetting_j_baru: normalizeNumberInput(item?.bezetting_j_baru),
    nonasn_bezetting_baru: normalizeNumberInput(item?.nonasn_bezetting_baru),
    nonasn_abk_baru: normalizeNumberInput(item?.nonasn_abk_baru)
  };
}

function ActionPanel({
  mode,
  form,
  verifyForm,
  activeItem,
  pegawaiLookupMessage,
  abkLookupMessage,
  referenceOptions,
  formDocuments,
  pendingFormFiles,
  onClose,
  onFormChange,
  onVerifyChange,
  onSubmitForm,
  onSubmitVerify,
  onUploadDocument,
  onSelectFormDocument,
  onPrintPertimbangan,
  canPrintPertimbangan,
  saving,
  printingPertimbangan,
  uploadingKey,
  drawer = false
}) {
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState("");
  if (!mode) return null;

  if (mode === "verify") {
    const availableDocuments = Object.entries(verifyForm.dokumen_checklist || {}).filter(([, document]) => document?.url);
    const activePreviewUrl = previewDocumentUrl || availableDocuments[0]?.[1]?.url || "";
    return (
      <section className={drawer ? "grid h-[calc(100vh-96px)] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 lg:grid-cols-2" : "surface space-y-4 p-5"}>
        {drawer ? (
          <div className="min-h-72 bg-slate-800 p-3 lg:h-full">
            {activePreviewUrl ? (
              <PdfDocumentPreview url={activePreviewUrl} title="Dokumen verifikasi mutasi" />
            ) : (
              <div className="flex h-full min-h-72 items-center justify-center rounded-lg border border-dashed border-slate-500 text-sm font-medium text-slate-200">
                Belum ada PDF checklist yang bisa dipreview.
              </div>
            )}
          </div>
        ) : null}
        <div className={drawer ? "h-full space-y-5 overflow-y-auto bg-white p-5" : "space-y-4"}>
        {!drawer ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Verifikasi Usulan</h2>
              <p className="text-sm text-slate-500">Perbarui status dan checklist berkas sesuai hasil verifikasi.</p>
            </div>
            <button className="btn-secondary" type="button" onClick={onClose}>
              <X className="h-4 w-4" />
              Tutup
            </button>
          </div>
        ) : null}

        {activeItem ? (
          <div className="rounded-2xl border border-dinkes-100 bg-dinkes-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-dinkes-700">Sedang Diverifikasi</p>
            <h3 className="mt-1 text-base font-bold text-slate-950">{activeItem.nama_pegawai || "-"}</h3>
            <p className="mt-1 text-sm text-slate-600">NRK {activeItem.nrk || "-"} | NIP {activeItem.nip || "-"}</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Asal</p>
                <p className="mt-1 font-medium text-slate-900">{activeItem.nama_ukpd || "-"}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tujuan</p>
                <p className="mt-1 font-medium text-slate-900">{activeItem.ukpd_tujuan || "-"}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jabatan</p>
                <p className="mt-1 font-medium text-slate-900">{activeItem.jabatan || "-"} ke {activeItem.jabatan_baru || "-"}</p>
              </div>
            </div>
          </div>
        ) : null}

        <label className="space-y-2">
          <span className="label">Status Proses</span>
          <select className="input" value={verifyForm.status} onChange={(event) => onVerifyChange("status", event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-dinkes-700" />
            <h3 className="text-sm font-semibold text-slate-900">Checklist Berkas</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500">Lihat PDF yang sudah diunggah, lalu centang item yang valid. Upload dipakai hanya untuk menambah atau mengganti dokumen.</p>
          <div className="space-y-2">
            {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
              const document = verifyForm.dokumen_checklist?.[key];
              const isUploading = uploadingKey === key;
              return (
                <div key={key} className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{label}</p>
                      {document ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <a className="inline-flex items-center rounded-lg border border-dinkes-200 bg-white px-3 py-1.5 text-xs font-semibold text-dinkes-700 hover:bg-dinkes-50" href={document.url} target="_blank" rel="noreferrer">
                            Lihat PDF
                          </a>
                          <button className="inline-flex items-center rounded-lg border border-dinkes-200 bg-white px-3 py-1.5 text-xs font-semibold text-dinkes-700 hover:bg-dinkes-50" type="button" onClick={() => setPreviewDocumentUrl(document.url)}>
                            Preview Inline
                          </button>
                          <span className="max-w-[260px] truncate text-xs text-slate-500">{document.name} ({formatFileSize(document.size)})</span>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">Belum ada PDF</p>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(verifyForm.verif_checklist[key])}
                      onChange={(event) => onVerifyChange("verif_checklist", { ...verifyForm.verif_checklist, [key]: event.target.checked })}
                    />
                  </div>
                  <label className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${isUploading ? "border-slate-200 bg-white text-slate-400" : "border-dinkes-200 bg-white text-dinkes-700 hover:bg-dinkes-50"}`}>
                    <Upload className="h-3.5 w-3.5" />
                    {isUploading ? "Mengunggah..." : document ? "Ganti PDF" : "Upload PDF"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="application/pdf"
                      disabled={isUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onUploadDocument(key, file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <label className="space-y-2">
          <span className="label">Catatan Verifikator</span>
          <textarea className="input min-h-28" value={verifyForm.keterangan} onChange={(event) => onVerifyChange("keterangan", event.target.value)} />
        </label>

        {canPrintPertimbangan ? (
          <button className="btn-secondary w-full justify-center" type="button" onClick={onPrintPertimbangan} disabled={printingPertimbangan || saving}>
            <Printer className="h-4 w-4" />
            {printingPertimbangan ? "Menyiapkan DOCX..." : "Cetak Form Pertimbangan"}
          </button>
        ) : null}

        <button className="btn-primary w-full" type="button" onClick={onSubmitVerify} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Menyimpan..." : "Simpan Verifikasi"}
        </button>
        </div>
      </section>
    );
  }

  const ukpdOptions = optionsWithCurrent(referenceOptions?.ukpdOptions || [], form.ukpd_tujuan);
  const jabatanOptions = optionsWithCurrent([
    ...(referenceOptions?.jabatanMenpanOptions || []),
    ...(referenceOptions?.jabatanOrbOptions || [])
  ], form.jabatan_baru);

  return (
    <form className={drawer ? "space-y-5" : "surface space-y-4 p-5"} onSubmit={onSubmitForm}>
      {!drawer ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {mode === "create" ? <Plus className="h-5 w-5 text-dinkes-700" /> : <Pencil className="h-5 w-5 text-dinkes-700" />}
            <div>
              <h2 className="text-base font-semibold text-slate-900">{mode === "create" ? "Tambah Usulan Mutasi" : "Edit Usulan Mutasi"}</h2>
              <p className="text-sm text-slate-500">Form disimpan saat diperlukan, bukan tampil terus di layar.</p>
            </div>
          </div>
          <button className="btn-secondary" type="button" onClick={onClose}>
            <X className="h-4 w-4" />
            Tutup
          </button>
        </div>
      ) : null}

      <div className="space-y-4">
        <label className="space-y-2">
          <span className="label">NRK Pegawai</span>
          <input className="input" value={form.nrk} onChange={(event) => onFormChange("nrk", event.target.value.replace(/\D/g, ""))} required placeholder="Masukkan NRK" />
          {pegawaiLookupMessage ? <p className="text-xs text-slate-500">{pegawaiLookupMessage}</p> : null}
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-dinkes-700" />
            <h3 className="text-sm font-semibold text-slate-900">Data Pegawai dari Master</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["NIP", form.nip],
              ["Nama Pegawai", form.nama_pegawai],
              ["Gelar", [form.gelar_depan, form.gelar_belakang].filter(Boolean).join(" ")],
              ["Pangkat/Golongan", form.pangkat_golongan],
              ["UKPD Asal", form.nama_ukpd],
              ["Jabatan Lama", form.jabatan]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 min-h-5 text-sm font-medium text-slate-900">{value || "-"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="label">UKPD Tujuan</span>
            <select className="input" value={form.ukpd_tujuan} onChange={(event) => onFormChange("ukpd_tujuan", event.target.value)} required>
              <option value="">Pilih UKPD tujuan</option>
              {ukpdOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="label">Jabatan Baru</span>
            <select className="input" value={form.jabatan_baru} onChange={(event) => onFormChange("jabatan_baru", event.target.value)}>
              <option value="">Pilih jabatan baru</option>
              {jabatanOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="space-y-2 md:col-span-2">
          <span className="label">Jenis Mutasi</span>
          <select className="input" value={form.jenis_mutasi} onChange={(event) => onFormChange("jenis_mutasi", event.target.value)}>
            <option value="Mutasi">Mutasi</option>
            <option value="Mutasi Luar SKPD">Mutasi Luar SKPD</option>
            <option value="Alih Tugas">Alih Tugas</option>
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Ringkasan ABK & Bezetting</h3>
        </div>
        {abkLookupMessage ? <p className="mb-3 text-xs text-slate-500">{abkLookupMessage}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["abk_j_lama", "ABK Jabatan Lama"],
            ["bezetting_j_lama", "Bezetting Jabatan Lama"],
            ["nonasn_bezetting_lama", "Non ASN Bezetting Lama"],
            ["nonasn_abk_lama", "Non ASN ABK Lama"],
            ["abk_j_baru", "ABK Jabatan Baru"],
            ["bezetting_j_baru", "Bezetting Jabatan Baru"],
            ["nonasn_bezetting_baru", "Non ASN Bezetting Baru"],
            ["nonasn_abk_baru", "Non ASN ABK Baru"]
          ].map(([name, label]) => (
            <label key={name} className="space-y-2">
              <span className="label">{label}</span>
              <input className="input" type="number" min="0" value={form[name]} onChange={(event) => onFormChange(name, event.target.value)} />
            </label>
          ))}
        </div>
      </div>

      <label className="space-y-2">
        <span className="label">Alasan Mutasi</span>
        <textarea className="input min-h-28" value={form.alasan} onChange={(event) => onFormChange("alasan", event.target.value)} required />
      </label>
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-dinkes-700" />
          <h3 className="text-sm font-semibold text-slate-900">Dokumen Checklist</h3>
        </div>
        <p className="mb-3 text-xs text-slate-500">Pilih PDF maksimal {CHECKLIST_DOCUMENT_MAX_MB} MB per item. File akan diunggah saat usulan disimpan.</p>
        <div className="space-y-2">
          {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
            const document = formDocuments?.[key];
            const pendingFile = pendingFormFiles?.[key];
            const isUploading = uploadingKey === key;
            return (
              <div key={key} className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{label}</p>
                  {pendingFile ? (
                    <p className="mt-1 truncate text-xs font-semibold text-amber-700">
                      {pendingFile.name} ({formatFileSize(pendingFile.size)}) - siap diunggah
                    </p>
                  ) : document ? (
                    <a className="mt-1 block truncate text-xs font-semibold text-dinkes-700 hover:underline" href={document.url} target="_blank" rel="noreferrer">
                      {document.name} ({formatFileSize(document.size)})
                    </a>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">Belum ada PDF</p>
                  )}
                </div>
                <label className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${saving || isUploading ? "border-slate-200 bg-white text-slate-400" : "border-dinkes-200 bg-white text-dinkes-700 hover:bg-dinkes-50"}`}>
                  <Upload className="h-3.5 w-3.5" />
                  {isUploading ? "Mengunggah..." : pendingFile ? "Ganti pilihan" : document ? "Ganti PDF" : "Pilih PDF"}
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/pdf"
                    disabled={saving || isUploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onSelectFormDocument(key, file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
      <label className="space-y-2">
        <span className="label">Catatan</span>
        <textarea className="input min-h-24" value={form.keterangan} onChange={(event) => onFormChange("keterangan", event.target.value)} />
      </label>
      <button className="btn-primary w-full" disabled={saving}>
        <Send className="h-4 w-4" />
        {saving ? "Menyimpan..." : mode === "create" ? "Simpan Usulan" : "Simpan Perubahan"}
      </button>
    </form>
  );
}

export default function UsulanMutasiPage() {
  const [rows, setRows] = useState([]);
  const [user, setUser] = useState(null);
  const [referenceOptions, setReferenceOptions] = useState({ ukpdOptions: [], jabatanMenpanOptions: [], jabatanOrbOptions: [] });
  const [form, setForm] = useState(emptyForm);
  const [verifyForm, setVerifyForm] = useState(emptyVerifyForm);
  const [pegawaiLookupMessage, setPegawaiLookupMessage] = useState("");
  const [abkLookupMessage, setAbkLookupMessage] = useState("");
  const [formDocuments, setFormDocuments] = useState(emptyChecklistDocuments);
  const [pendingFormFiles, setPendingFormFiles] = useState(emptyChecklistDocuments);
  const [panelMode, setPanelMode] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState("");
  const [printingPertimbanganId, setPrintingPertimbanganId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [mutasiResponse, userResponse, optionsResponse] = await Promise.all([
        fetch("/api/usulan/mutasi", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/pegawai/form-options?context=mutasi", { cache: "no-store" })
      ]);
      const mutasiPayload = await parseApiResponse(mutasiResponse, "Data usulan mutasi gagal dimuat.");
      if (!mutasiResponse.ok || !mutasiPayload.success) {
        throw new Error(mutasiPayload.message || "Data usulan mutasi gagal dimuat.");
      }

      const userPayload = userResponse.ok
        ? await parseApiResponse(userResponse, "Data pengguna gagal dimuat.").catch(() => null)
        : null;
      const optionsPayload = optionsResponse.ok
        ? await parseApiResponse(optionsResponse, "Opsi form pegawai gagal dimuat.").catch(() => null)
        : null;

      if (optionsResponse.ok && optionsPayload?.success) {
        setReferenceOptions(optionsPayload.data || {});
      }
      setRows(mutasiPayload.data || []);
      setUser(userPayload?.data || null);
      if (userPayload?.data?.nama_ukpd) {
        setForm((current) => ({ ...current, nama_ukpd: current.nama_ukpd || userPayload.data.nama_ukpd }));
      }
    } catch (error) {
      setErrorMessage(error.message || "Data usulan mutasi gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!panelMode || panelMode === "verify") return undefined;
    const nrk = normalizeText(form.nrk);
    if (!nrk) {
      setPegawaiLookupMessage("");
      return undefined;
    }
    if (nrk.length < 3) {
      setPegawaiLookupMessage("Ketik minimal 3 digit NRK.");
      return undefined;
    }

    let cancelled = false;
    setPegawaiLookupMessage("Mencari data pegawai...");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/pegawai?nrk=${encodeURIComponent(nrk)}&pageSize=10`, { cache: "no-store" });
        const payload = await parseApiResponse(response, "Pencarian pegawai gagal.");
        if (!response.ok || !payload.success) throw new Error(payload.message || "Data pegawai gagal dicari.");
        const pegawai = (payload.data?.rows || []).find((item) => normalizeText(item.nrk) === nrk);
        if (cancelled) return;
        if (!pegawai) {
          setPegawaiLookupMessage("NRK tidak ditemukan pada master pegawai.");
          return;
        }
        setForm((current) => (normalizeText(current.nrk) === nrk ? applyPegawaiToForm(current, pegawai) : current));
        setPegawaiLookupMessage("Data pegawai terisi otomatis dari master.");
      } catch (error) {
        if (!cancelled) setPegawaiLookupMessage(error.message || "Data pegawai gagal dicari.");
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.nrk, panelMode]);

  useEffect(() => {
    if (!panelMode || panelMode === "verify") {
      setAbkLookupMessage("");
      return undefined;
    }

    const lamaReady = normalizeText(form.nama_ukpd) && normalizeText(form.jabatan);
    const baruReady = normalizeText(form.ukpd_tujuan) && normalizeText(form.jabatan_baru);
    if (!lamaReady && !baruReady) {
      setAbkLookupMessage("");
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAbkLookupMessage("Mengambil ABK dan bezetting dari peta jabatan...");
      try {
        const [lama, baru] = await Promise.all([
          lamaReady ? fetchAbkLookup({ ukpd: form.nama_ukpd, jabatan: form.jabatan, signal: controller.signal }).catch((error) => ({ error })) : null,
          baruReady ? fetchAbkLookup({ ukpd: form.ukpd_tujuan, jabatan: form.jabatan_baru, signal: controller.signal }).catch((error) => ({ error })) : null
        ]);
        if (controller.signal.aborted) return;

        setForm((current) => ({
          ...current,
          ...(lamaReady ? mapAbkLookupToFields(lama?.error ? null : lama, "lama") : {}),
          ...(baruReady ? mapAbkLookupToFields(baru?.error ? null : baru, "baru") : {})
        }));

        const messages = [];
        if (lamaReady) messages.push(lama?.error ? `Jabatan lama belum ditemukan: ${lama.error.message}` : "Jabatan lama terisi dari peta jabatan.");
        if (baruReady) messages.push(baru?.error ? `Jabatan baru belum ditemukan: ${baru.error.message}` : "Jabatan baru terisi dari peta jabatan.");
        setAbkLookupMessage(messages.join(" "));
      } catch (error) {
        if (!controller.signal.aborted) setAbkLookupMessage(error.message || "ABK dan bezetting gagal dimuat.");
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [form.nama_ukpd, form.jabatan, form.ukpd_tujuan, form.jabatan_baru, panelMode]);

  const decoratedRows = useMemo(() => rows.map((item) => ({
    ...item,
    _flow: getMutasiFlow(item),
    _checklist: getChecklistSummary(item)
  })), [rows]);

  const summaries = useMemo(() => {
    const total = decoratedRows.length;
    return {
      total,
      usulanBaru: decoratedRows.filter((item) => item._flow.step === 1).length,
      verifikasi: decoratedRows.filter((item) => item._flow.step === 2 || item._flow.step === 4).length,
      selesai: decoratedRows.filter((item) => normalizeText(item.status).toLowerCase() === "selesai").length
    };
  }, [decoratedRows]);

  const statusOptions = useMemo(() => [...new Set(rows.map((item) => normalizeText(item.status)).filter(Boolean))], [rows]);
  const stageOptions = FLOW_STEPS.map((step) => `${step.key}. ${step.title}`);

  const filteredRows = useMemo(() => decoratedRows.filter((item) => {
    const query = normalizeText(searchTerm).toLowerCase();
    const matchesSearch = !query || [
      item.nama_pegawai,
      item.nrk,
      item.nip,
      item.nama_ukpd,
      item.ukpd_tujuan,
      item.jabatan,
      item.jabatan_baru,
      item.jenis_mutasi,
      item.alasan,
      item.status
    ].some((value) => normalizeText(value).toLowerCase().includes(query));
    const matchesStatus = !statusFilter || normalizeText(item.status) === statusFilter;
    const matchesStage = !stageFilter || `${item._flow.step}. ${FLOW_STEPS[item._flow.step - 1]?.title}` === stageFilter;
    return matchesSearch && matchesStatus && matchesStage;
  }), [decoratedRows, searchTerm, statusFilter, stageFilter]);
  const pageSize = 25;
  const maxPage = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, stageFilter]);

  useEffect(() => {
    setPage((current) => Math.min(current, maxPage));
  }, [maxPage]);

  const selected = selectedId !== null && selectedId !== undefined
    ? filteredRows.find((item) => item.id === selectedId) || decoratedRows.find((item) => item.id === selectedId) || null
    : null;
  const activeItem = decoratedRows.find((item) => item.id === activeId) || rows.find((item) => item.id === activeId) || null;
  const drawerTitle = panelMode === "verify" ? "Validasi Usulan Mutasi" : panelMode === "edit" ? "Edit Usulan Mutasi" : "Tambah Usulan Mutasi";
  const drawerDescription = panelMode === "verify"
    ? "Perbarui status, checklist, dan dokumen pendukung tanpa menggeser tampilan daftar."
    : "Isi NRK, tujuan mutasi, jabatan, serta dokumen checklist dalam satu panel.";

  function closePanel() {
    setPanelMode(null);
    setActiveId(null);
    setForm((current) => ({ ...emptyForm, nama_ukpd: user?.nama_ukpd || current.nama_ukpd || "" }));
    setFormDocuments(emptyChecklistDocuments());
    setPendingFormFiles(emptyChecklistDocuments());
    setPegawaiLookupMessage("");
    setAbkLookupMessage("");
    setVerifyForm(emptyVerifyForm);
  }

  function openCreate() {
    setActiveId(null);
    setPanelMode("create");
    setForm(buildFormFromItem(null, user?.nama_ukpd || ""));
    setFormDocuments(emptyChecklistDocuments());
    setPendingFormFiles(emptyChecklistDocuments());
    setPegawaiLookupMessage("");
    setAbkLookupMessage("");
  }

  function openEdit(item) {
    setActiveId(item.id);
    setPanelMode("edit");
    setForm(buildFormFromItem(item, user?.nama_ukpd || ""));
    setFormDocuments(parseChecklistDocuments(item.dokumen_checklist, CHECKLIST_LABELS, "mutasi", item.id));
    setPendingFormFiles(emptyChecklistDocuments());
    setPegawaiLookupMessage(item.nrk ? "" : "Isi NRK jika ingin memperbarui data pegawai dari master.");
    setAbkLookupMessage("");
  }

  function openVerify(item) {
    setActiveId(item.id);
    setPanelMode("verify");
    setVerifyForm({
      id: item.id,
      status: item.status || "Verifikasi Sudin",
      keterangan: item.keterangan || "",
      verif_checklist: parseChecklist(item.verif_checklist, CHECKLIST_LABELS),
      dokumen_checklist: parseChecklistDocuments(item.dokumen_checklist, CHECKLIST_LABELS, "mutasi", item.id)
    });
  }

  function openDetail(item) {
    setSelectedId(item.id);
  }

  function updateRow(updatedItem) {
    setRows((current) => {
      const exists = current.some((item) => item.id === updatedItem.id);
      return exists ? current.map((item) => (item.id === updatedItem.id ? updatedItem : item)) : [updatedItem, ...current];
    });
    setSelectedId(updatedItem.id);
  }

  async function deleteUsulan() {
    if (!deleteTarget?.id) return;

    setDeleteLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/usulan/mutasi?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const payload = await parseApiResponse(response, "Usulan mutasi gagal dihapus.");
      if (!response.ok || !payload.success) throw new Error(payload.message || "Usulan mutasi gagal dihapus.");
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      setSelectedId((current) => (current === deleteTarget.id ? null : current));
      setDeleteTarget(null);
    } catch (error) {
      setErrorMessage(error.message || "Usulan mutasi gagal dihapus.");
    } finally {
      setDeleteLoading(false);
    }
  }

  function validatePdfFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMessage("Dokumen pendukung wajib berformat PDF.");
      return false;
    }
    if (file.size > CHECKLIST_DOCUMENT_MAX_BYTES) {
      setErrorMessage(`Ukuran PDF maksimal ${CHECKLIST_DOCUMENT_MAX_MB} MB per dokumen.`);
      return false;
    }
    setErrorMessage("");
    return true;
  }

  function selectPendingFormDocument(key, file) {
    if (!validatePdfFile(file)) return;
    setPendingFormFiles((current) => ({ ...current, [key]: file }));
  }

  async function uploadPendingDocuments(itemId, files) {
    let latestItem = null;
    const selectedFiles = Object.entries(files).filter(([, file]) => Boolean(file));

    for (const [key, file] of selectedFiles) {
      setUploadingKey(key);
      const formData = new FormData();
      formData.append("type", "mutasi");
      formData.append("id", String(itemId));
      formData.append("key", key);
      formData.append("file", file);

      const response = await fetch("/api/usulan/dokumen", {
        method: "POST",
        body: formData
      });
      const payload = await parseApiResponse(response, "Dokumen checklist gagal diunggah.");
      if (!response.ok || !payload.success) throw new Error(payload.message || "Dokumen checklist gagal diunggah.");
      latestItem = payload.data;
    }

    setUploadingKey("");
    return latestItem;
  }

  function sanitizeFormPayload() {
    return {
      ...form,
      abk_j_lama: form.abk_j_lama === "" ? null : Number(form.abk_j_lama),
      bezetting_j_lama: form.bezetting_j_lama === "" ? null : Number(form.bezetting_j_lama),
      nonasn_bezetting_lama: form.nonasn_bezetting_lama === "" ? null : Number(form.nonasn_bezetting_lama),
      nonasn_abk_lama: form.nonasn_abk_lama === "" ? null : Number(form.nonasn_abk_lama),
      abk_j_baru: form.abk_j_baru === "" ? null : Number(form.abk_j_baru),
      bezetting_j_baru: form.bezetting_j_baru === "" ? null : Number(form.bezetting_j_baru),
      nonasn_bezetting_baru: form.nonasn_bezetting_baru === "" ? null : Number(form.nonasn_bezetting_baru),
      nonasn_abk_baru: form.nonasn_abk_baru === "" ? null : Number(form.nonasn_abk_baru)
    };
  }

  async function handleSubmitForm(event) {
    event.preventDefault();
    if (!normalizeText(form.nrk)) {
      setErrorMessage("NRK pegawai wajib diisi.");
      return;
    }
    if (!normalizeText(form.nama_pegawai) || !normalizeText(form.nama_ukpd)) {
      setErrorMessage("Data pegawai belum terisi dari master. Periksa kembali NRK.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/usulan/mutasi", {
        method: panelMode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(panelMode === "edit" ? { id: activeId, ...sanitizeFormPayload() } : sanitizeFormPayload())
      });
      const payload = await parseApiResponse(response, "Usulan mutasi gagal disimpan.");
      if (!response.ok || !payload.success) throw new Error(payload.message || "Usulan mutasi gagal disimpan.");
      const uploadedItem = await uploadPendingDocuments(payload.data.id, pendingFormFiles);
      updateRow(uploadedItem || payload.data);
      closePanel();
    } catch (error) {
      setErrorMessage(error.message || "Usulan mutasi gagal disimpan.");
    } finally {
      setUploadingKey("");
      setSaving(false);
    }
  }

  async function handleSubmitVerify() {
    setSaving(true);
    setErrorMessage("");
    try {
      const { id, status, keterangan, verif_checklist } = verifyForm;
      const response = await fetch("/api/usulan/mutasi", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, keterangan, verif_checklist })
      });
      const payload = await parseApiResponse(response, "Verifikasi usulan mutasi gagal disimpan.");
      if (!response.ok || !payload.success) throw new Error(payload.message || "Verifikasi usulan mutasi gagal disimpan.");
      updateRow(payload.data);
      closePanel();
    } catch (error) {
      setErrorMessage(error.message || "Verifikasi usulan mutasi gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadDocument(key, file) {
    if (!activeId) return;
    if (!validatePdfFile(file)) return;

    setUploadingKey(key);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("type", "mutasi");
      formData.append("id", String(activeId));
      formData.append("key", key);
      formData.append("file", file);

      const response = await fetch("/api/usulan/dokumen", {
        method: "POST",
        body: formData
      });
      const payload = await parseApiResponse(response, "Dokumen checklist gagal diunggah.");
      if (!response.ok || !payload.success) throw new Error(payload.message || "Dokumen checklist gagal diunggah.");
      updateRow(payload.data);
      setVerifyForm((current) => ({
        ...current,
        verif_checklist: parseChecklist(payload.data.verif_checklist, CHECKLIST_LABELS),
        dokumen_checklist: parseChecklistDocuments(payload.data.dokumen_checklist, CHECKLIST_LABELS, "mutasi", payload.data.id)
      }));
    } catch (error) {
      setErrorMessage(error.message || "Dokumen checklist gagal diunggah.");
    } finally {
      setUploadingKey("");
    }
  }

  async function handlePrintPertimbangan(item) {
    if (!item?.id) return;

    setPrintingPertimbanganId(item.id);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/usulan/mutasi/pertimbangan?id=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      if (!response.ok) {
        let message = "Cetak form pertimbangan mutasi gagal dibuat.";
        try {
          const payload = await parseApiResponse(response, "Cetak pertimbangan mutasi gagal dibuat.");
          message = payload.message || message;
        } catch {
          // Use the default message when the response is not JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFileName(response.headers.get("Content-Disposition"), `Form_Pertimbangan_Mutasi_${item.id}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error.message || "Cetak form pertimbangan mutasi gagal dibuat.");
    } finally {
      setPrintingPertimbanganId(null);
    }
  }

  async function handleExportExcel() {
    setExportLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        stage: stageFilter ? stageFilter.split(".", 1)[0] : ""
      });
      const response = await fetch(`/api/usulan/mutasi/export?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await parseApiResponse(response, "Export Excel usulan mutasi gagal.");
        throw new Error(payload.message || "Export Excel usulan mutasi gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFileName(response.headers.get("Content-Disposition"), "usulan-mutasi.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error.message || "Export Excel usulan mutasi gagal.");
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Usulan Mutasi"
        breadcrumbs={[{ label: "Usulan" }, { label: "Mutasi" }]}
        action={selected ? <Link className="btn-secondary" href="/usulan/putus-jf">Lihat Putus JF</Link> : null}
      />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-5 sm:gap-4 xl:grid-cols-4">
        <SummaryCard title="Total Usulan" value={summaries.total} />
        <SummaryCard title="Usulan Baru" value={summaries.usulanBaru} tone="amber" />
        <SummaryCard title="Sedang Diverifikasi" value={summaries.verifikasi} tone="blue" />
        <SummaryCard title="Tuntas" value={summaries.selesai} tone="emerald" />
      </div>


      {errorMessage ? (
        <section className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </section>
      ) : null}

      <section className="mt-5">
        <div className="space-y-5">
          <SearchFilterBar
            search={{
              label: "Cari usulan",
              value: searchTerm,
              onChange: setSearchTerm,
              placeholder: "Cari nama, NRK, NIP, UKPD, atau jabatan..."
            }}
            filters={[
              { name: "status", label: "Semua status", value: statusFilter, onChange: setStatusFilter, options: statusOptions },
              { name: "tahap", label: "Semua tahap", value: stageFilter, onChange: setStageFilter, options: stageOptions }
            ]}
            actions={(
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" type="button" onClick={handleExportExcel} disabled={exportLoading}>
                  <Download className="h-4 w-4" />
                  {exportLoading ? "Mengekspor..." : "Export Excel"}
                </button>
                <button className="btn-primary" type="button" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Tambah
                </button>
              </div>
            )}
          />

          {loading ? <EmptyState title="Memuat data usulan" description="Data dari database sedang diambil." /> : (
            <DataTable
              rowKey="id"
              data={paginatedRows}
              showNumber
              startNumber={(page - 1) * pageSize + 1}
              actionWidth={132}
              fitToWidth
              compact
              columns={[
                {
                  key: "pegawai",
                  header: "Pegawai",
                  width: 210,
                  wrap: true,
                  render: (item) => (
                    <div className="max-w-[190px] whitespace-normal">
                      <p className="font-semibold text-slate-900">{item.nama_pegawai || "-"}</p>
                      <p className="text-xs text-slate-500">NRK {item.nrk || "-"} | NIP {item.nip || "-"}</p>
                    </div>
                  )
                },
                {
                  key: "unit",
                  header: "Asal / Tujuan",
                  width: 180,
                  wrap: true,
                  render: (item) => (
                    <div className="max-w-[165px] whitespace-normal text-sm">
                      <p>{item.nama_ukpd || "-"}</p>
                      <p className="text-slate-400">ke</p>
                      <p>{item.ukpd_tujuan || "-"}</p>
                    </div>
                  )
                },
                {
                  key: "jabatan",
                  header: "Jabatan",
                  width: 190,
                  wrap: true,
                  render: (item) => (
                    <div className="max-w-[175px] whitespace-normal text-sm">
                      <p>{item.jabatan || "-"}</p>
                      <p className="text-slate-400">ke</p>
                      <p>{item.jabatan_baru || "-"}</p>
                    </div>
                  )
                },
                {
                  key: "berkas",
                  header: "Berkas",
                  width: 120,
                  wrap: true,
                  render: (item) => (
                    <div className="w-28 whitespace-normal text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        {item._checklist.documentCount === item._checklist.total && item._checklist.total > 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <FileWarning className="h-4 w-4 text-amber-600" />}
                        <span>{item._checklist.documentCount}/{item._checklist.total}</span>
                      </div>
                      <p className="text-xs text-slate-500">{item._checklist.documentCount ? "PDF checklist terlampir" : "Belum ada PDF checklist"}</p>
                    </div>
                  )
                },
                {
                  key: "tahap",
                  header: "Tahap",
                  width: 140,
                  wrap: true,
                  render: (item) => (
                    <div className="w-32 whitespace-normal">
                      <p className="font-semibold text-slate-900">{item._flow.stageLabel}</p>
                      <StatusBadge status={item.status} />
                    </div>
                  )
                },
                { key: "tanggal_usulan", header: "Tgl", width: 112, render: (item) => formatDateTime(item.tanggal_usulan || item.created_at) }
              ]}
              actions={(item) => (
                <div className="flex items-center justify-end gap-0.5">
                  <button className="rounded-md p-1.5 text-dinkes-700 hover:bg-dinkes-50 focus-ring" type="button" onClick={() => openDetail(item)} aria-label="Detail" title="Detail">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100 focus-ring" type="button" onClick={() => openEdit(item)} aria-label="Edit" title="Edit">
                    <SquarePen className="h-4 w-4" />
                  </button>
                  <button className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50 focus-ring" type="button" onClick={() => openVerify(item)} aria-label="Verifikasi" title="Verifikasi">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  {canDeleteUsulan(user, item) ? (
                    <button className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 focus-ring" type="button" onClick={() => setDeleteTarget(item)} aria-label="Hapus" title="Hapus">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              )}
            />
          )}

          {!loading && filteredRows.length ? (
            <footer className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <span>
                Menampilkan {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} dari {filteredRows.length} usulan
              </span>
              <div className="flex items-center gap-2">
                <span className="mr-2">25 data per halaman</span>
                <button className="btn-secondary px-3 py-2" type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button>
                <span className="min-w-[7rem] rounded-lg bg-slate-50 px-3 py-2 text-center font-bold text-slate-800">Hal {page} / {maxPage}</span>
                <button className="btn-secondary px-3 py-2" type="button" disabled={page === maxPage} onClick={() => setPage((current) => Math.min(maxPage, current + 1))}>Berikutnya</button>
              </div>
            </footer>
          ) : null}

          {selected ? (
            <div
              className="fixed inset-0 z-50 grid items-end bg-slate-950/40 px-3 pb-3 sm:place-items-center sm:p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setSelectedId(null);
              }}
            >
              <article className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-label="Detail Usulan Mutasi">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Detail Usulan Mutasi</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">{selected.nama_pegawai || "-"}</h2>
                  <p className="mt-1 text-sm text-slate-500">NRK {selected.nrk || "-"} | NIP {selected.nip || "-"} | {selected.nama_ukpd || "-"} ke {selected.ukpd_tujuan || "-"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    Tahap {selected._flow.step}
                  </span>
                  <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-ring" type="button" onClick={() => setSelectedId(null)} aria-label="Tutup popup">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-dinkes-700" />
                    <h3 className="text-sm font-semibold text-slate-900">Arah Tindak Lanjut</h3>
                  </div>
                  <p className="text-sm leading-6 text-slate-600">{selected._flow.nextAction}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {[
                      ["Jabatan Saat Ini", selected.jabatan],
                      ["Jabatan Tujuan", selected.jabatan_baru]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-900">{value || "-"}</p>
                      </div>
                    ))}
                    {[
                      {
                        title: "UKPD Saat Ini",
                        value: selected.nama_ukpd,
                        metrics: [
                          ["ABK Jabatan", selected.abk_j_lama],
                          ["Bezetting Jabatan", selected.bezetting_j_lama],
                          ["Non ASN", selected.nonasn_bezetting_lama],
                          ["ABK Non ASN", selected.nonasn_abk_lama]
                        ]
                      },
                      {
                        title: "UKPD Tujuan",
                        value: selected.ukpd_tujuan,
                        metrics: [
                          ["ABK Jabatan", selected.abk_j_baru],
                          ["Bezetting Jabatan", selected.bezetting_j_baru],
                          ["Non ASN", selected.nonasn_bezetting_baru],
                          ["ABK Non ASN", selected.nonasn_abk_baru]
                        ]
                      }
                    ].map((section) => (
                      <div key={section.title} className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-900">{section.value || "-"}</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {section.metrics.map(([label, value]) => (
                            <div key={label} className="rounded-lg bg-white px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                              <p className="mt-1 text-sm font-medium text-slate-900">{value ?? "-"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jenis Mutasi</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{selected.jenis_mutasi || "-"}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alasan</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.alasan || "-"}</p>
                  </div>
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Catatan</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.keterangan || "-"}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-dinkes-700" />
                      <h3 className="text-sm font-semibold text-slate-900">Checklist Berkas Sudin</h3>
                    </div>
                    <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-dinkes-700" style={{ width: `${selected._checklist.percent}%` }} />
                    </div>
                    <p className="mb-3 text-xs text-slate-500">{selected._checklist.documentCount} dari {selected._checklist.total} PDF terunggah</p>
                    <div className="space-y-2">
                      {selected._checklist.checklist.map((entry) => (
                        <div key={entry.key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <span>{entry.label}</span>
                            {entry.document ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <a className="inline-flex items-center rounded-lg border border-dinkes-200 bg-white px-3 py-1.5 text-xs font-semibold text-dinkes-700 hover:bg-dinkes-50" href={entry.document.url} target="_blank" rel="noreferrer">
                                  Lihat PDF
                                </a>
                                <span className="max-w-[260px] truncate text-xs text-slate-500">{entry.document.name} ({formatFileSize(entry.document.size)})</span>
                              </div>
                            ) : (
                              <p className="mt-1 text-xs text-slate-500">Belum ada PDF</p>
                            )}
                          </div>
                          {entry.hasDocument ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <FileWarning className="h-4 w-4 shrink-0 text-slate-300" />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              </article>
            </div>
          ) : null}
        </div>
      </section>

      <ActionDrawer open={Boolean(panelMode)} title={drawerTitle} description={drawerDescription} onClose={closePanel}>
        <ActionPanel
          mode={panelMode}
          form={form}
          verifyForm={verifyForm}
          activeItem={activeItem}
          pegawaiLookupMessage={pegawaiLookupMessage}
          abkLookupMessage={abkLookupMessage}
          referenceOptions={referenceOptions}
          formDocuments={formDocuments}
          pendingFormFiles={pendingFormFiles}
          saving={saving}
          onClose={closePanel}
          onFormChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onVerifyChange={(name, value) => setVerifyForm((current) => ({ ...current, [name]: value }))}
          onSubmitForm={handleSubmitForm}
          onSubmitVerify={handleSubmitVerify}
          onUploadDocument={handleUploadDocument}
          onSelectFormDocument={selectPendingFormDocument}
          onPrintPertimbangan={() => handlePrintPertimbangan(activeItem)}
          canPrintPertimbangan={canPrintDinasPertimbangan(user, activeItem, verifyForm.status)}
          printingPertimbangan={printingPertimbanganId === activeItem?.id}
          uploadingKey={uploadingKey}
          drawer
        />
      </ActionDrawer>
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="Hapus usulan mutasi?"
        description={`Usulan mutasi ${deleteTarget?.nama_pegawai || ""} akan dihapus dari database.`}
        loading={deleteLoading}
        onCancel={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        onConfirm={deleteUsulan}
      />
    </>
  );
}
