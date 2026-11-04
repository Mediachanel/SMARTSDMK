"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileWarning,
  FileSignature,
  FolderSync,
  Landmark,
  Pencil,
  Plus,
  Printer,
  Save,
  Send,
  SquarePen,
  Stamp,
  Trash2,
  Undo2,
  Upload,
  X
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
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
  PUTUS_JF_CHECKLIST_LABELS as CHECKLIST_LABELS,
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
  { key: 5, title: "Surat Putus JF" }
];

const STATUS_OPTIONS = ["Diusulkan", "Verifikasi Sudin", "Diterima Dinas", "Verifikasi Dinas", "Dikembalikan", "Selesai", "Ditolak"];
const DINAS_PRINT_STATUSES = new Set(["diterima dinas", "verifikasi dinas", "diproses", "selesai"]);
const DINAS_PROCESSED_STATUSES = new Set(["diterima dinas", "verifikasi dinas", "diproses", "selesai"]);

const emptyForm = {
  nrk: "",
  nip: "",
  nama_pegawai: "",
  pangkat_golongan: "",
  nama_ukpd: "",
  ukpd_tujuan: "",
  jabatan: "",
  jabatan_baru: "",
  angka_kredit: "",
  abk_j_lama: "",
  bezetting_j_lama: "",
  nonasn_bezetting_lama: "",
  nonasn_abk_lama: "",
  abk_j_baru: "",
  bezetting_j_baru: "",
  nonasn_bezetting_baru: "",
  nonasn_abk_baru: "",
  nomor_surat: "",
  tanggal_surat: "",
  hal: "",
  pimpinan: "",
  asal_surat: "",
  alasan_pemutusan: "",
  berkas_path: "",
  keterangan: ""
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

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function buildFormFromItem(item, fallbackUkpd = "") {
  const editableValues = Object.fromEntries(
    Object.keys(emptyForm).map((key) => [key, item?.[key] ?? emptyForm[key]])
  );

  return {
    ...emptyForm,
    ...editableValues,
    nama_ukpd: item?.nama_ukpd || fallbackUkpd || "",
    angka_kredit: normalizeNumberInput(item?.angka_kredit),
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

function getChecklistSummary(item) {
  const checklist = parseChecklist(item.verif_checklist, CHECKLIST_LABELS);
  const documents = parseChecklistDocuments(item.dokumen_checklist, CHECKLIST_LABELS, "putus-jf", item.id);
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

function getPutusFlow(item) {
  const status = normalizeText(item.status).toLowerCase();
  if (status === "verifikasi sudin") return { step: 2, stageLabel: "Verifikasi Sudin", nextAction: "Sudin memverifikasi dasar usulan dan kelengkapan surat." };
  if (status === "diterima dinas") return { step: 3, stageLabel: "Diterima Dinas", nextAction: "Berkas lengkap diterima Dinas untuk proses lebih lanjut." };
  if (status === "verifikasi dinas") return { step: 4, stageLabel: "Verifikasi Dinas", nextAction: "Dinas memfinalkan usulan surat putus JF." };
  if (status === "dikembalikan" || status === "ditolak") return { step: 2, stageLabel: "Kembali ke Sudin", nextAction: "Lengkapi usulan lalu kirim ulang." };
  if (status === "selesai") return { step: 5, stageLabel: "Surat selesai", nextAction: "Arsipkan dan teruskan ke proses penetapan." };
  if (status === "diproses") return { step: 3, stageLabel: "Diterima Dinas", nextAction: "Usulan sedang diproses lebih lanjut." };
  return { step: 1, stageLabel: "Usulan UKPD", nextAction: "Lengkapi data dasar dan surat pengantar." };
}

function canPrintDinasUsulan(user, item, statusOverride = "") {
  if (user?.role !== ROLES.SUPER_ADMIN || !item?.id) return false;
  const status = normalizeText(statusOverride || item.status).toLowerCase();
  return DINAS_PRINT_STATUSES.has(status);
}

function canDeleteUsulan(user, item) {
  if (!user || !item?.id) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  return !DINAS_PROCESSED_STATUSES.has(normalizeText(item.status).toLowerCase());
}

function getDownloadFileName(disposition, fallback) {
  const header = disposition || "";
  const utfName = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfName?.[1]) return decodeURIComponent(utfName[1]);

  const plainName = header.match(/filename="?([^";]+)"?/i);
  return plainName?.[1] || fallback;
}

function SummaryCard({ title, value, accent = "slate" }) {
  const accents = {
    slate: "border-slate-200 bg-white",
    blue: "border-sky-200 bg-sky-50/70",
    emerald: "border-emerald-200 bg-emerald-50/70",
    amber: "border-amber-200 bg-amber-50/70"
  };
  return (
    <div className={`rounded-xl border p-3 shadow-sm sm:rounded-2xl sm:p-4 ${accents[accent] || accents.slate}`}>
      <p className="text-xs font-semibold text-slate-600 sm:text-sm">{title}</p>
      <p className="mt-1 text-xl font-bold text-slate-950 sm:mt-2 sm:text-2xl">{value}</p>
    </div>
  );
}

function FlowStrip({ activeStep }) {
  return (
    <section className="surface p-3 sm:p-5">
      <div className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-5 xl:gap-4 xl:overflow-visible xl:pb-0">
        {FLOW_STEPS.map((step) => {
          const active = step.key === activeStep;
          const passed = step.key < activeStep;
          return (
            <div key={step.key} className={`min-w-36 rounded-xl border p-3 xl:min-w-0 xl:rounded-2xl xl:p-4 ${active ? "border-dinkes-200 bg-dinkes-50/60" : "border-slate-200 bg-white"}`}>
              <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold xl:mb-3 xl:h-9 xl:w-9 xl:text-sm ${passed ? "bg-emerald-600 text-white" : active ? "bg-dinkes-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                {step.key}
              </div>
              <p className="text-xs font-bold leading-4 text-slate-900 xl:text-sm">{step.title}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
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
  onPrintUsulan,
  canPrintUsulan,
  saving,
  printingUsulan,
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
              <iframe title="Preview PDF verifikasi putus JF" src={activePreviewUrl} className="h-full min-h-72 w-full rounded-lg bg-white" />
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
              <h2 className="text-base font-semibold text-slate-900">Validasi / Verifikasi</h2>
              <p className="text-sm text-slate-500">Perbarui status, checklist, dan dokumen pendukung.</p>
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">UKPD</p>
                <p className="mt-1 font-medium text-slate-900">{activeItem.nama_ukpd || "-"}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pangkat</p>
                <p className="mt-1 font-medium text-slate-900">{activeItem.pangkat_golongan || "-"}</p>
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
            <h3 className="text-sm font-semibold text-slate-900">Checklist Dokumen</h3>
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
          <textarea className="input min-h-32" value={verifyForm.keterangan} onChange={(event) => onVerifyChange("keterangan", event.target.value)} />
        </label>

        {canPrintUsulan ? (
          <button className="btn-secondary w-full justify-center" type="button" onClick={onPrintUsulan} disabled={printingUsulan || saving}>
            <Printer className="h-4 w-4" />
            {printingUsulan ? "Menyiapkan DOCX..." : "Cetak Usulan"}
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
              <h2 className="text-base font-semibold text-slate-900">{mode === "create" ? "Tambah Usulan Putus JF" : "Edit Usulan Putus JF"}</h2>
              <p className="text-sm text-slate-500">Form hanya dibuka saat dibutuhkan agar tampilan daftar tetap rapi.</p>
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
              ["Pangkat/Golongan", form.pangkat_golongan],
              ["UKPD", form.nama_ukpd],
              ["Jabatan Fungsional", form.jabatan]
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
            <select className="input" value={form.ukpd_tujuan} onChange={(event) => onFormChange("ukpd_tujuan", event.target.value)}>
              <option value="">Pilih UKPD tujuan</option>
              {ukpdOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="label">Jabatan Baru / Tujuan</span>
            <select className="input" value={form.jabatan_baru} onChange={(event) => onFormChange("jabatan_baru", event.target.value)}>
              <option value="">Pilih jabatan baru</option>
              {jabatanOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          {[
            ["angka_kredit", "Angka Kredit"],
            ["nomor_surat", "Nomor Surat"],
            ["tanggal_surat", "Tanggal Surat"],
            ["hal", "Hal"],
            ["pimpinan", "Pimpinan Penandatangan"],
            ["asal_surat", "Asal Surat"]
          ].map(([name, label]) => (
            <label key={name} className={`space-y-2 ${["hal", "pimpinan", "asal_surat"].includes(name) ? "md:col-span-2" : ""}`}>
              <span className="label">{label}</span>
              <input
                className="input"
                type={name === "tanggal_surat" ? "date" : name === "angka_kredit" ? "number" : "text"}
                step={name === "angka_kredit" ? "0.01" : undefined}
                value={form[name]}
                onChange={(event) => onFormChange(name, event.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Ringkasan ABK & Bezetting</h3>
        </div>
        {abkLookupMessage ? <p className="mb-3 text-xs text-slate-500">{abkLookupMessage}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["abk_j_lama", "ABK Jabatan Saat Ini"],
            ["bezetting_j_lama", "Bezetting Jabatan Saat Ini"],
            ["nonasn_bezetting_lama", "Non ASN Saat Ini"],
            ["nonasn_abk_lama", "ABK Non ASN Saat Ini"],
            ["abk_j_baru", "ABK Jabatan Tujuan"],
            ["bezetting_j_baru", "Bezetting Jabatan Tujuan"],
            ["nonasn_bezetting_baru", "Non ASN Tujuan"],
            ["nonasn_abk_baru", "ABK Non ASN Tujuan"]
          ].map(([name, label]) => (
            <label key={name} className="space-y-2">
              <span className="label">{label}</span>
              <input className="input" type="number" min="0" value={form[name]} onChange={(event) => onFormChange(name, event.target.value)} />
            </label>
          ))}
        </div>
      </div>

      <label className="space-y-2">
        <span className="label">Alasan Putus / Pembebasan JF</span>
        <textarea className="input min-h-28" value={form.alasan_pemutusan} onChange={(event) => onFormChange("alasan_pemutusan", event.target.value)} required />
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
        {saving ? "Menyimpan..." : mode === "create" ? "Simpan Usulan Putus JF" : "Simpan Perubahan"}
      </button>
    </form>
  );
}

export default function UsulanPutusJfPage() {
  const [rows, setRows] = useState([]);
  const [user, setUser] = useState(null);
  const [referenceOptions, setReferenceOptions] = useState({ jabatanMenpanOptions: [], jabatanOrbOptions: [] });
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
  const [printingId, setPrintingId] = useState(null);
  const [uploadingKey, setUploadingKey] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [putusResponse, userResponse, optionsResponse] = await Promise.all([
        fetch("/api/usulan/putus-jf", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/pegawai/form-options", { cache: "no-store" })
      ]);
      const putusPayload = await parseApiResponse(putusResponse, "Data usulan putus JF gagal dimuat.");
      if (!putusResponse.ok || !putusPayload.success) {
        throw new Error(putusPayload.message || "Data usulan putus JF gagal dimuat.");
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
      setRows(putusPayload.data || []);
      setUser(userPayload?.data || null);
      if (userPayload?.data?.nama_ukpd) {
        setForm((current) => ({ ...current, nama_ukpd: current.nama_ukpd || userPayload.data.nama_ukpd }));
      }
    } catch (error) {
      setErrorMessage(error.message || "Data usulan putus JF gagal dimuat.");
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
        if (lamaReady) messages.push(lama?.error ? `Jabatan saat ini belum ditemukan: ${lama.error.message}` : "Jabatan saat ini terisi dari peta jabatan.");
        if (baruReady) messages.push(baru?.error ? `Jabatan tujuan belum ditemukan: ${baru.error.message}` : "Jabatan tujuan terisi dari peta jabatan.");
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
    _flow: getPutusFlow(item),
    _checklist: getChecklistSummary(item)
  })), [rows]);
  const statusOptions = useMemo(() => [...new Set(rows.map((item) => normalizeText(item.status)).filter(Boolean))], [rows]);
  const stageOptions = FLOW_STEPS.map((step) => `${step.key}. ${step.title}`);
  const summaries = useMemo(() => ({
    total: decoratedRows.length,
    usulanBaru: decoratedRows.filter((item) => item._flow.step === 1).length,
    verifikasi: decoratedRows.filter((item) => item._flow.step === 2 || item._flow.step === 4).length,
    selesai: decoratedRows.filter((item) => normalizeText(item.status).toLowerCase() === "selesai").length
  }), [decoratedRows]);

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
      item.nomor_surat,
      item.hal,
      item.alasan_pemutusan,
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
  const drawerTitle = panelMode === "verify" ? "Validasi Usulan Putus JF" : panelMode === "edit" ? "Edit Usulan Putus JF" : "Tambah Usulan Putus JF";
  const drawerDescription = panelMode === "verify"
    ? "Perbarui status, checklist, dan dokumen pendukung tanpa menggeser tampilan daftar."
    : "Isi NRK, jabatan tujuan, data surat, dan dokumen checklist dalam satu panel.";

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
    setFormDocuments(parseChecklistDocuments(item.dokumen_checklist, CHECKLIST_LABELS, "putus-jf", item.id));
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
      dokumen_checklist: parseChecklistDocuments(item.dokumen_checklist, CHECKLIST_LABELS, "putus-jf", item.id)
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
      const response = await fetch(`/api/usulan/putus-jf?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const payload = await parseApiResponse(response, "Usulan putus JF gagal dihapus.");
      if (!response.ok || !payload.success) throw new Error(payload.message || "Usulan putus JF gagal dihapus.");
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      setSelectedId((current) => (current === deleteTarget.id ? null : current));
      setDeleteTarget(null);
    } catch (error) {
      setErrorMessage(error.message || "Usulan putus JF gagal dihapus.");
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
      formData.append("type", "putus-jf");
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
      const payloadBody = {
        ...form,
        angka_kredit: form.angka_kredit === "" ? null : Number(form.angka_kredit),
        abk_j_lama: form.abk_j_lama === "" ? null : Number(form.abk_j_lama),
        bezetting_j_lama: form.bezetting_j_lama === "" ? null : Number(form.bezetting_j_lama),
        nonasn_bezetting_lama: form.nonasn_bezetting_lama === "" ? null : Number(form.nonasn_bezetting_lama),
        nonasn_abk_lama: form.nonasn_abk_lama === "" ? null : Number(form.nonasn_abk_lama),
        abk_j_baru: form.abk_j_baru === "" ? null : Number(form.abk_j_baru),
        bezetting_j_baru: form.bezetting_j_baru === "" ? null : Number(form.bezetting_j_baru),
        nonasn_bezetting_baru: form.nonasn_bezetting_baru === "" ? null : Number(form.nonasn_bezetting_baru),
        nonasn_abk_baru: form.nonasn_abk_baru === "" ? null : Number(form.nonasn_abk_baru)
      };
      const response = await fetch("/api/usulan/putus-jf", {
        method: panelMode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(panelMode === "edit" ? { id: activeId, ...payloadBody } : payloadBody)
      });
      const payload = await parseApiResponse(response, "Usulan putus JF gagal disimpan.");
      if (!response.ok || !payload.success) throw new Error(payload.message || "Usulan putus JF gagal disimpan.");
      const uploadedItem = await uploadPendingDocuments(payload.data.id, pendingFormFiles);
      updateRow(uploadedItem || payload.data);
      closePanel();
    } catch (error) {
      setErrorMessage(error.message || "Usulan putus JF gagal disimpan.");
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
      const response = await fetch("/api/usulan/putus-jf", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, keterangan, verif_checklist })
      });
      const payload = await parseApiResponse(response, "Verifikasi usulan putus JF gagal disimpan.");
      if (!response.ok || !payload.success) throw new Error(payload.message || "Verifikasi usulan putus JF gagal disimpan.");
      updateRow(payload.data);
      closePanel();
    } catch (error) {
      setErrorMessage(error.message || "Verifikasi usulan putus JF gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePrintUsulan(item) {
    const id = item?.id || item;
    if (!id) return;

    setPrintingId(id);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/usulan/putus-jf/docx?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) {
        let message = "Cetak usulan putus JF gagal dibuat.";
        const contentType = response.headers.get("Content-Type") || "";
        if (contentType.includes("application/json")) {
          const payload = await parseApiResponse(response, "Cetak usulan putus JF gagal dibuat.");
          message = payload.message || message;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFileName(response.headers.get("Content-Disposition"), `Putus_JF_${id}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setErrorMessage(error.message || "Cetak usulan putus JF gagal dibuat.");
    } finally {
      setPrintingId(null);
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
      const response = await fetch(`/api/usulan/putus-jf/export?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await parseApiResponse(response, "Export Excel usulan putus JF gagal.");
        throw new Error(payload.message || "Export Excel usulan putus JF gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFileName(response.headers.get("Content-Disposition"), "usulan-putus-jf.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error.message || "Export Excel usulan putus JF gagal.");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleUploadDocument(key, file) {
    if (!activeId) return;
    if (!validatePdfFile(file)) return;

    setUploadingKey(key);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("type", "putus-jf");
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
        dokumen_checklist: parseChecklistDocuments(payload.data.dokumen_checklist, CHECKLIST_LABELS, "putus-jf", payload.data.id)
      }));
    } catch (error) {
      setErrorMessage(error.message || "Dokumen checklist gagal diunggah.");
    } finally {
      setUploadingKey("");
    }
  }

  return (
    <>
      <PageHeader
        title="Usulan Putus Jabatan Fungsional"
        breadcrumbs={[{ label: "Usulan" }, { label: "Putus JF" }]}
      />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-5 sm:gap-4 xl:grid-cols-4">
        <SummaryCard title="Total Usulan" value={summaries.total} />
        <SummaryCard title="Usulan Baru" value={summaries.usulanBaru} accent="amber" />
        <SummaryCard title="Sedang Diverifikasi" value={summaries.verifikasi} accent="blue" />
        <SummaryCard title="Selesai" value={summaries.selesai} accent="emerald" />
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
                  key: "surat",
                  header: "Surat",
                  width: 170,
                  wrap: true,
                  render: (item) => (
                    <div className="w-40 whitespace-normal text-sm">
                      <p className="font-medium text-slate-900">{item.nomor_surat || "-"}</p>
                      <p className="text-xs text-slate-500">{formatDate(item.tanggal_surat)}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.asal_surat || "-"}</p>
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
                { key: "tanggal_usulan", header: "Tgl", width: 112, render: (item) => formatDate(item.tanggal_usulan || item.created_at) }
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
              <article className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-label="Detail Usulan Putus JF">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Detail Usulan Putus JF</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">{selected.nama_pegawai || "-"}</h2>
                  <p className="mt-1 text-sm text-slate-500">NRK {selected.nrk || "-"} | NIP {selected.nip || "-"} | {selected.nama_ukpd || "-"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canPrintDinasUsulan(user, selected) ? (
                    <button className="btn-secondary" type="button" onClick={() => handlePrintUsulan(selected)} disabled={printingId === selected.id}>
                      <Printer className="h-4 w-4" />
                      {printingId === selected.id ? "Menyiapkan..." : "Cetak Usulan"}
                    </button>
                  ) : null}
                  <StatusBadge status={selected.status} />
                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    Tahap {selected._flow.step}
                  </span>
                  <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-ring" type="button" onClick={() => setSelectedId(null)} aria-label="Tutup popup">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <FolderSync className="h-4 w-4 text-dinkes-700" />
                      <h3 className="text-sm font-semibold text-slate-900">Arah Proses</h3>
                    </div>
                    <p className="text-sm leading-6 text-slate-600">{selected._flow.nextAction}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {[
                        ["Jabatan Saat Ini", selected.jabatan],
                        ["Jabatan Tujuan", selected.jabatan_baru],
                        ["UKPD Saat Ini", selected.nama_ukpd],
                        ["UKPD Tujuan", selected.ukpd_tujuan || selected.nama_ukpd_tujuan || selected.ukpd_baru]
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-900">{value || "-"}</p>
                        </div>
                      ))}
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Angka Kredit</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{selected.angka_kredit ?? "-"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-dinkes-700" />
                      <h3 className="text-sm font-semibold text-slate-900">Data Surat</h3>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        ["Nomor Surat", selected.nomor_surat],
                        ["Tanggal Surat", formatDate(selected.tanggal_surat)],
                        ["Perihal", selected.hal],
                        ["Pimpinan", selected.pimpinan],
                        ["Asal Surat", selected.asal_surat],
                        ["Jabatan Baru", selected.jabatan_baru]
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-900">{value || "-"}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {[
                    selected.abk_j_lama,
                    selected.bezetting_j_lama,
                    selected.nonasn_bezetting_lama,
                    selected.nonasn_abk_lama,
                    selected.abk_j_baru,
                    selected.bezetting_j_baru,
                    selected.nonasn_bezetting_baru,
                    selected.nonasn_abk_baru
                  ].some((value) => value !== undefined && value !== null && value !== "") ? (
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-dinkes-700" />
                        <h3 className="text-sm font-semibold text-slate-900">ABK & Bezetting</h3>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          ["ABK jabatan saat ini", selected.abk_j_lama],
                          ["Bezetting jabatan saat ini", selected.bezetting_j_lama],
                          ["Non ASN saat ini", selected.nonasn_bezetting_lama],
                          ["ABK Non ASN saat ini", selected.nonasn_abk_lama],
                          ["ABK jabatan tujuan", selected.abk_j_baru],
                          ["Bezetting jabatan tujuan", selected.bezetting_j_baru],
                          ["Non ASN tujuan", selected.nonasn_bezetting_baru],
                          ["ABK Non ASN tujuan", selected.nonasn_abk_baru]
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                            <p className="mt-1 text-sm font-medium text-slate-900">{value ?? "-"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Stamp className="h-4 w-4 text-dinkes-700" />
                      <h3 className="text-sm font-semibold text-slate-900">Alasan Pemutusan</h3>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.alasan_pemutusan || "-"}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Undo2 className="h-4 w-4 text-dinkes-700" />
                      <h3 className="text-sm font-semibold text-slate-900">Catatan Verifikator</h3>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.keterangan || "-"}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-dinkes-700" />
                      <h3 className="text-sm font-semibold text-slate-900">Checklist Dokumen</h3>
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

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-dinkes-700" />
                      <h3 className="text-sm font-semibold text-slate-900">Ringkasan Tahap</h3>
                    </div>
                    <div className="space-y-2 text-sm text-slate-600">
                      {FLOW_STEPS.map((step) => (
                        <div key={step.key} className={`rounded-xl px-3 py-2 ${step.key === selected._flow.step ? "bg-dinkes-50 text-dinkes-800" : step.key < selected._flow.step ? "bg-emerald-50 text-emerald-700" : "bg-slate-50"}`}>
                          {step.key}. {step.title}
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
          onPrintUsulan={() => handlePrintUsulan(activeItem)}
          canPrintUsulan={canPrintDinasUsulan(user, activeItem, verifyForm.status)}
          printingUsulan={printingId === activeItem?.id}
          uploadingKey={uploadingKey}
          drawer
        />
      </ActionDrawer>
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="Hapus usulan putus JF?"
        description={`Usulan putus JF ${deleteTarget?.nama_pegawai || ""} akan dihapus dari database.`}
        loading={deleteLoading}
        onCancel={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        onConfirm={deleteUsulan}
      />
    </>
  );
}
