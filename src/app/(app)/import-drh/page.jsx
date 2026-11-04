"use client";

import { useEffect, useState } from "react";
import { Eye, FileText, LoaderCircle, Save, Table2, UploadCloud } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import DataTable from "@/components/tables/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";

const COUNT_KEYS = [
  "alamat",
  "keluarga",
  "riwayat_pendidikan",
  "riwayat_jabatan",
  "riwayat_gaji_pokok",
  "riwayat_pangkat",
  "riwayat_penghargaan",
  "riwayat_skp",
  "riwayat_hukuman_disiplin",
  "riwayat_prestasi_pendidikan",
  "riwayat_narasumber",
  "riwayat_kegiatan_strategis",
  "riwayat_keberhasilan",
];

const DATA_DIRI_FIELDS = [
  { key: "nama_lengkap", label: "Nama Lengkap" },
  { key: "nama", label: "Nama" },
  { key: "gelar_depan", label: "Gelar Depan" },
  { key: "gelar_belakang", label: "Gelar Belakang" },
  { key: "nrk", label: "NRK" },
  { key: "nip", label: "NIP" },
  { key: "tempat_lahir", label: "Tempat Lahir" },
  { key: "tanggal_lahir", label: "Tanggal Lahir" },
  { key: "agama", label: "Agama" },
  { key: "jenis_kelamin", label: "Jenis Kelamin" },
  { key: "status_pernikahan", label: "Status Pernikahan" },
  { key: "jabatan", label: "Jabatan" },
  { key: "unit_kerja", label: "Unit Kerja" },
  { key: "no_telepon", label: "No. Telepon" },
  { key: "no_hp", label: "No. HP" },
  { key: "email", label: "Email" },
  { key: "alamat", label: "Alamat" },
];

const PREVIEW_TABLES = [
  {
    key: "riwayat_pendidikan",
    label: "Riwayat Pendidikan",
    columns: [
      { key: "jenis_riwayat", header: "Jenis", width: 150 },
      { key: "jenjang_pendidikan", header: "Jenjang", width: 160 },
      { key: "program_studi", header: "Program Studi", width: 220 },
      { key: "nama_institusi", header: "Institusi", width: 260 },
      { key: "kota_institusi", header: "Kota", width: 180 },
      { key: "tanggal_ijazah", header: "Tanggal Ijazah", width: 170 },
      { key: "tahun_lulus", header: "Tahun Lulus", width: 140 },
    ],
  },
  {
    key: "keluarga",
    label: "Keluarga",
    columns: [
      { key: "hubungan", header: "Hubungan", width: 150 },
      { key: "hubungan_detail", header: "Detail", width: 170 },
      { key: "nama", header: "Nama", width: 240 },
      { key: "jenis_kelamin", header: "JK", width: 90 },
      { key: "tempat_lahir", header: "Tempat Lahir", width: 180 },
      { key: "tanggal_lahir", header: "Tanggal Lahir", width: 160 },
      { key: "status_tunjangan", header: "Tunjangan", width: 140 },
      { key: "pekerjaan", header: "Pekerjaan", width: 190 },
    ],
  },
  {
    key: "riwayat_jabatan",
    label: "Riwayat Jabatan",
    columns: [
      { key: "jenis_jabatan", header: "Jenis", width: 150 },
      { key: "tmt_jabatan", header: "TMT Jabatan", width: 160 },
      { key: "lokasi", header: "Lokasi", width: 220 },
      { key: "nama_jabatan_menpan", header: "Jabatan", width: 300 },
      { key: "pangkat_golongan", header: "Pangkat/Gol", width: 170 },
      { key: "eselon", header: "Eselon", width: 110 },
      { key: "nomor_sk", header: "Nomor SK", width: 210 },
      { key: "tanggal_sk", header: "Tanggal SK", width: 150 },
    ],
  },
  {
    key: "riwayat_gaji_pokok",
    label: "Riwayat Gaji Pokok",
    columns: [
      { key: "tmt_gaji", header: "TMT Gaji", width: 160 },
      { key: "pangkat_golongan", header: "Pangkat/Gol", width: 180 },
      { key: "gaji_pokok", header: "Gaji Pokok", width: 160 },
      { key: "nomor_sk", header: "Nomor SK", width: 240 },
      { key: "tanggal_sk", header: "Tanggal SK", width: 160 },
    ],
  },
  {
    key: "riwayat_pangkat",
    label: "Riwayat Pangkat",
    columns: [
      { key: "tmt_pangkat", header: "TMT Pangkat", width: 160 },
      { key: "pangkat_golongan", header: "Pangkat/Gol", width: 180 },
      { key: "lokasi", header: "Lokasi", width: 220 },
      { key: "nomor_sk", header: "Nomor SK", width: 240 },
      { key: "tanggal_sk", header: "Tanggal SK", width: 160 },
    ],
  },
  {
    key: "riwayat_penghargaan",
    label: "Riwayat Penghargaan",
    columns: [
      { key: "nama_penghargaan", header: "Penghargaan", width: 260 },
      { key: "asal_penghargaan", header: "Asal", width: 220 },
      { key: "nomor_sk", header: "Nomor SK", width: 240 },
      { key: "tanggal_sk", header: "Tanggal SK", width: 160 },
    ],
  },
  {
    key: "riwayat_skp",
    label: "Riwayat SKP",
    columns: [
      { key: "tahun", header: "Tahun", width: 120 },
      { key: "nilai_skp", header: "Nilai SKP", width: 140 },
      { key: "nilai_perilaku", header: "Nilai Perilaku", width: 170 },
      { key: "nilai_prestasi", header: "Nilai Prestasi", width: 170 },
      { key: "keterangan_prestasi", header: "Keterangan Prestasi", width: 260 },
    ],
  },
  {
    key: "riwayat_hukuman_disiplin",
    label: "Riwayat Hukuman Disiplin",
    columns: [
      { key: "tanggal_mulai", header: "Tanggal Mulai", width: 160 },
      { key: "tanggal_akhir", header: "Tanggal Akhir", width: 160 },
      { key: "hukuman_disiplin", header: "Hukuman Disiplin", width: 260 },
      { key: "nomor_sk", header: "Nomor SK", width: 240 },
      { key: "tanggal_sk", header: "Tanggal SK", width: 160 },
      { key: "keterangan", header: "Keterangan", width: 260 },
    ],
  },
  {
    key: "riwayat_prestasi_pendidikan",
    label: "Prestasi Pendidikan",
    columns: [
      { key: "kategori", header: "Kategori", width: 150 },
      { key: "jenjang_pendidikan", header: "Jenjang", width: 180 },
      { key: "prestasi", header: "Prestasi", width: 360 },
    ],
  },
  {
    key: "riwayat_narasumber",
    label: "Narasumber",
    columns: [
      { key: "kegiatan", header: "Kegiatan", width: 320 },
      { key: "judul_materi", header: "Judul Materi", width: 320 },
      { key: "lembaga_penyelenggara", header: "Lembaga Penyelenggara", width: 300 },
    ],
  },
  {
    key: "riwayat_kegiatan_strategis",
    label: "Kegiatan Strategis",
    columns: [
      { key: "kegiatan", header: "Kegiatan", width: 320 },
      { key: "tahun_anggaran", header: "Tahun Anggaran", width: 180 },
      { key: "jumlah_anggaran", header: "Jumlah Anggaran", width: 180 },
      { key: "kedudukan_dalam_kegiatan", header: "Kedudukan", width: 260 },
    ],
  },
  {
    key: "riwayat_keberhasilan",
    label: "Keberhasilan",
    columns: [
      { key: "jabatan", header: "Jabatan", width: 260 },
      { key: "tahun", header: "Tahun", width: 120 },
      { key: "keberhasilan", header: "Keberhasilan", width: 320 },
      { key: "kendala_yang_dihadapi", header: "Kendala", width: 320 },
      { key: "solusi_yang_dilakukan", header: "Solusi", width: 320 },
    ],
  },
];

function formatCount(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${formatCount(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${formatCount(Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postImportFiles(formData) {
  try {
    return await fetch("/api/import-drh", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    await wait(700);
    return fetch("/api/import-drh", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      cache: "no-store",
    });
  }
}

async function putEditedPreview(item) {
  return fetch("/api/import-drh", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      fileName: item.fileName,
      parsedSummary: item.parsedSummary,
      parsedPreview: item.parsedPreview,
    }),
  });
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function sumImportedCounts(result) {
  if (!result) return null;
  if (Array.isArray(result.results) && !result.batch) return null;
  if (!result.batch) return result.importedCounts || null;
  if (result.importedCounts) return result.importedCounts;
  return (result.results || []).reduce((total, item) => {
    if (item.status !== "success") return total;
    for (const key of COUNT_KEYS) {
      total[key] = Number(total[key] || 0) + Number(item.importedCounts?.[key] || 0);
    }
    return total;
  }, {});
}

function sumImportedCountsFromItems(items) {
  return (items || []).reduce((total, item) => {
    if (item.status !== "success") return total;
    for (const key of COUNT_KEYS) {
      total[key] = Number(total[key] || 0) + Number(item.importedCounts?.[key] || 0);
    }
    return total;
  }, {});
}

function formatPreviewValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return formatCount(value);
  return String(value);
}

function formatInputValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildResultItemId(item, index) {
  return `${item?.fileName || item?.nip || "single"}-${index}`;
}

function getResultItems(result) {
  if (!result) return [];
  if (Array.isArray(result.results)) return result.results;
  if (result.status) return [result];
  return [];
}

function getDefaultPreviewId(result) {
  const items = getResultItems(result);
  const failedIndex = items.findIndex((item) => item.status === "failed" && item.parsedPreview);
  if (failedIndex >= 0) return buildResultItemId(items[failedIndex], failedIndex);
  return "";
}

function updateResultItem(result, targetId, updater) {
  if (!result) return result;
  if (Array.isArray(result.results)) {
    const results = result.results.map((item, index) => {
      const id = buildResultItemId(item, index);
      return id === targetId ? updater(item) : item;
    });
    const successCount = results.filter((item) => item.status === "success").length;
    const failedCount = results.length - successCount;
    return {
      ...result,
      batch: true,
      successCount,
      failedCount,
      importedCounts: sumImportedCountsFromItems(results),
      results,
    };
  }

  return buildResultItemId(result, 0) === targetId ? updater(result) : result;
}

function updateResultItemPreview(result, targetId, sectionKey, rowIndex, fieldKey, value) {
  return updateResultItem(result, targetId, (item) => {
    const parsedPreview = {
      ...(item.parsedPreview || {}),
      pegawai: { ...(item.parsedPreview?.pegawai || {}) },
    };
    const parsedSummary = {
      ...(item.parsedSummary || {}),
      pegawai: { ...(item.parsedSummary?.pegawai || {}) },
    };

    if (sectionKey === "data_diri") {
      parsedPreview.pegawai[fieldKey] = value;
      parsedSummary.pegawai[fieldKey] = value;
      return {
        ...item,
        parsedPreview,
        parsedSummary,
        namaPegawai: fieldKey === "nama" || fieldKey === "nama_lengkap" ? value : item.namaPegawai,
        nip: fieldKey === "nip" ? value : item.nip,
      };
    }

    const rows = Array.isArray(parsedPreview[sectionKey]) ? [...parsedPreview[sectionKey]] : [];
    rows[rowIndex] = {
      ...(rows[rowIndex] || {}),
      [fieldKey]: value,
    };
    parsedPreview[sectionKey] = rows;
    return { ...item, parsedPreview, parsedSummary };
  });
}

function replaceSavedResultItem(result, targetId, savedItem) {
  return updateResultItem(result, targetId, () => savedItem);
}

function buildDataDiriRows(pegawai = {}) {
  return DATA_DIRI_FIELDS.map((field) => ({
    id: field.key,
    kolom: field.label,
    nilai: pegawai?.[field.key],
  }));
}

function buildPreviewSections(parsedPreview) {
  if (!parsedPreview) return [];
  return [
    {
      key: "data_diri",
      label: "Data Diri",
      rows: buildDataDiriRows(parsedPreview.pegawai),
      columns: [
        { key: "kolom", header: "Kolom", width: 220 },
        { key: "nilai", header: "Nilai", width: 520 },
      ],
    },
    ...PREVIEW_TABLES.map((section) => ({
      ...section,
      rows: Array.isArray(parsedPreview?.[section.key]) ? parsedPreview[section.key] : [],
    })),
  ];
}

function PreviewSectionTable({ sectionKey, columns, rows, onCellChange }) {
  const minWidth = columns.reduce((total, column) => total + (column.width || 180), 0);

  if (!rows.length) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
        Tidak ada data terbaca.
      </div>
    );
  }

  return (
    <div className="table-scroll rounded-md border border-slate-200 bg-white">
      <table className="w-full table-fixed border-collapse" style={{ minWidth }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: column.width || 180 }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="table-th" scope="col">
                <span className="block truncate" title={column.header}>{column.header}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || rowIndex} className="hover:bg-dinkes-50/50">
              {columns.map((column) => (
                <td key={column.key} className="table-td whitespace-normal break-words leading-5">
                  {sectionKey === "data_diri" && column.key === "kolom" ? (
                    formatPreviewValue(row?.[column.key])
                  ) : (
                    <input
                      className="input min-h-9 px-2 py-1.5 text-xs"
                      value={formatInputValue(sectionKey === "data_diri" ? row?.nilai : row?.[column.key])}
                      onChange={(event) => onCellChange(sectionKey, rowIndex, sectionKey === "data_diri" ? row.id : column.key, event.target.value)}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParsedPreviewDetail({ item, onCellChange, onSave, saving, saveError, saveNotice }) {
  if (!item?.parsedPreview) return null;
  const sections = buildPreviewSections(item.parsedPreview);

  return (
    <section className="surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Table2 className="h-5 w-5 text-dinkes-700" />
            Data Terbaca dari PDF
          </h2>
          <div className="mt-1 text-sm text-slate-500">{item.fileName || "PDF DRH"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status === "success" ? "Tersimpan" : "Gagal"} />
          <button className="btn-primary px-3 py-2" type="button" onClick={() => onSave(item)} disabled={saving}>
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Menyimpan..." : "Simpan hasil edit"}
          </button>
        </div>
      </div>

      {item.message ? (
        <div className={`mt-4 rounded-md border px-4 py-3 text-sm ${item.status === "failed" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          <span className="font-semibold">Keterangan:</span> {item.message}
        </div>
      ) : null}

      {saveError ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{saveError}</div>
      ) : null}

      {saveNotice ? (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{saveNotice}</div>
      ) : null}

      <div className="mt-5 space-y-6">
        {sections.map((section) => (
          <section key={section.key} className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{section.label}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {formatCount(section.rows.length)} data
              </span>
            </div>
            <PreviewSectionTable sectionKey={section.key} columns={section.columns} rows={section.rows} onCellChange={onCellChange} />
          </section>
        ))}
      </div>
    </section>
  );
}

function ImportSkeletonPreview({ progress }) {
  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="h-5 w-56 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-dinkes-blue transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 text-sm font-semibold text-dinkes-navy">Parsing PDF DRH {progress}%</div>
      <div className="mt-6 grid gap-3">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="grid grid-cols-[140px_1fr_120px] gap-3">
            <div className="h-10 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ImportDrhPage() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [selectedPreviewId, setSelectedPreviewId] = useState("");
  const [savingPreviewId, setSavingPreviewId] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => {
    if (!loading) return undefined;
    setImportProgress(8);
    const timer = window.setInterval(() => {
      setImportProgress((current) => {
        if (current < 40) return current + 7;
        if (current < 78) return current + 4;
        if (current < 92) return current + 1;
        return current;
      });
    }, 450);
    return () => window.clearInterval(timer);
  }, [loading]);

  async function handleImport(event) {
    event.preventDefault();
    if (!files.length) {
      setError("Pilih satu atau beberapa file PDF DRH terlebih dahulu.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSelectedPreviewId("");
    setSaveError("");
    setSaveNotice("");

    try {
      const formData = new FormData();
      for (const selectedFile of files) {
        formData.append("files", selectedFile);
      }

      const response = await postImportFiles(formData);
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.success) {
        if (payload.errors) {
          setResult(payload.errors);
          setSelectedPreviewId(getDefaultPreviewId(payload.errors));
        }
        throw new Error(payload.message || "Import DRH gagal diproses.");
      }
      setResult(payload.data);
      setSelectedPreviewId(getDefaultPreviewId(payload.data));
      setImportProgress(100);
    } catch (requestError) {
      const message = requestError instanceof TypeError
        ? "Koneksi ke server import terputus. Refresh halaman lalu coba upload lagi."
        : requestError.message || "Import DRH gagal diproses.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handlePreviewCellChange(sectionKey, rowIndex, fieldKey, value) {
    if (!selectedPreviewId) return;
    setSaveError("");
    setSaveNotice("");
    setResult((current) => updateResultItemPreview(current, selectedPreviewId, sectionKey, rowIndex, fieldKey, value));
  }

  async function handleSavePreview(item) {
    if (!item?.parsedPreview || !selectedPreviewId) return;
    const currentPreviewId = selectedPreviewId;
    setSavingPreviewId(currentPreviewId);
    setSaveError("");
    setSaveNotice("");

    try {
      const response = await putEditedPreview(item);
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Hasil edit DRH gagal disimpan.");
      }
      setResult((current) => replaceSavedResultItem(current, currentPreviewId, payload.data));
      setSelectedPreviewId(currentPreviewId);
      setSaveNotice(payload.message || "Hasil edit DRH berhasil disimpan.");
    } catch (requestError) {
      setSaveError(requestError.message || "Hasil edit DRH gagal disimpan.");
    } finally {
      setSavingPreviewId("");
    }
  }

  const importedCounts = sumImportedCounts(result);
  const preview = result
    ? [
        { id: 1, bagian: "Alamat", jumlah: importedCounts?.alamat || 0, status: importedCounts?.alamat ? "Tersimpan" : "Kosong" },
        { id: 2, bagian: "Pendidikan", jumlah: importedCounts?.riwayat_pendidikan || 0, status: importedCounts?.riwayat_pendidikan ? "Tersimpan" : "Kosong" },
        { id: 3, bagian: "Keluarga", jumlah: importedCounts?.keluarga || 0, status: importedCounts?.keluarga ? "Tersimpan" : "Kosong" },
        { id: 4, bagian: "Jabatan", jumlah: importedCounts?.riwayat_jabatan || 0, status: importedCounts?.riwayat_jabatan ? "Tersimpan" : "Kosong" },
        { id: 5, bagian: "Gaji Pokok", jumlah: importedCounts?.riwayat_gaji_pokok || 0, status: importedCounts?.riwayat_gaji_pokok ? "Tersimpan" : "Kosong" },
        { id: 6, bagian: "Pangkat", jumlah: importedCounts?.riwayat_pangkat || 0, status: importedCounts?.riwayat_pangkat ? "Tersimpan" : "Kosong" },
        { id: 7, bagian: "Penghargaan", jumlah: importedCounts?.riwayat_penghargaan || 0, status: importedCounts?.riwayat_penghargaan ? "Tersimpan" : "Kosong" },
        { id: 8, bagian: "SKP", jumlah: importedCounts?.riwayat_skp || 0, status: importedCounts?.riwayat_skp ? "Tersimpan" : "Kosong" },
        { id: 9, bagian: "Hukuman Disiplin", jumlah: importedCounts?.riwayat_hukuman_disiplin || 0, status: importedCounts?.riwayat_hukuman_disiplin ? "Tersimpan" : "Kosong" },
        { id: 10, bagian: "Prestasi Pendidikan", jumlah: importedCounts?.riwayat_prestasi_pendidikan || 0, status: importedCounts?.riwayat_prestasi_pendidikan ? "Tersimpan" : "Kosong" },
        { id: 11, bagian: "Narasumber", jumlah: importedCounts?.riwayat_narasumber || 0, status: importedCounts?.riwayat_narasumber ? "Tersimpan" : "Kosong" },
        { id: 12, bagian: "Kegiatan Strategis", jumlah: importedCounts?.riwayat_kegiatan_strategis || 0, status: importedCounts?.riwayat_kegiatan_strategis ? "Tersimpan" : "Kosong" },
        { id: 13, bagian: "Keberhasilan", jumlah: importedCounts?.riwayat_keberhasilan || 0, status: importedCounts?.riwayat_keberhasilan ? "Tersimpan" : "Kosong" },
      ]
    : [
        { id: 1, bagian: "Data Diri", jumlah: "-", status: "Menunggu File" },
        { id: 2, bagian: "Riwayat Pendidikan", jumlah: "-", status: "Menunggu File" },
        { id: 3, bagian: "Riwayat Keluarga", jumlah: "-", status: "Menunggu File" },
      ];
  const resultItems = getResultItems(result);
  const previewItems = resultItems.map((item, index) => ({
    id: buildResultItemId(item, index),
    item,
  }));
  const selectedPreview = previewItems.find((item) => item.id === selectedPreviewId)?.item || null;
  const showResultRows = Boolean(result?.batch || Array.isArray(result?.results));
  const batchRows = showResultRows
    ? resultItems.map((item, index) => ({
        id: buildResultItemId(item, index),
        fileName: item.fileName || "-",
        nama: item.namaPegawai || item.parsedSummary?.pegawai?.nama_lengkap || "-",
        nip: item.nip || item.parsedSummary?.pegawai?.nip || "-",
        status: item.status === "success" ? "Tersimpan" : "Gagal",
        mode: item.status === "success" ? (item.createdPegawai ? "Dibuat" : "Diperbarui") : "-",
        message: item.status === "success" ? "Berhasil diproses" : item.message || "Gagal diproses",
        canPreview: Boolean(item.parsedPreview),
      }))
    : [];
  const singlePreviewId = !showResultRows && previewItems[0]?.item?.parsedPreview ? previewItems[0].id : "";
  const shouldShowResultSummary = Boolean(result?.batch || result?.status === "success");

  return (
    <>
      <PageHeader
        title="Import DRH"
        description="Upload satu atau beberapa PDF Daftar Riwayat Hidup pegawai. Sistem akan membaca isi PDF, memetakan tiap bagian, lalu menyimpan hasilnya ke tabel pegawai dan tabel riwayat DRH."
        breadcrumbs={[{ label: "Import DRH" }]}
      />
      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <form className="surface p-5" onSubmit={handleImport}>
          <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-dinkes-200 bg-dinkes-50 px-6 text-center hover:bg-dinkes-100">
            <UploadCloud className="h-12 w-12 text-dinkes-700" />
            <span className="mt-4 text-base font-semibold text-slate-900">Pilih atau tarik file PDF DRH</span>
            <span className="mt-2 text-sm text-slate-500">Bisa pilih beberapa file `.pdf` dari DRH pegawai.jakarta.go.id sekaligus</span>
            <input
              className="sr-only"
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(event) => {
                setFiles(Array.from(event.target.files || []));
                setSelectedPreviewId("");
                setSaveError("");
                setSaveNotice("");
              }}
            />
          </label>

          {files.length ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="inline-flex items-center gap-2 font-medium text-slate-900">
                <FileText className="h-4 w-4 text-dinkes-700" />
                {formatCount(files.length)} file dipilih
              </div>
              <div className="mt-2 space-y-1 text-slate-600">
                {files.slice(0, 5).map((item) => (
                  <div key={`${item.name}-${item.size}`} className="flex items-center justify-between gap-3">
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 text-slate-500">{formatBytes(item.size)}</span>
                  </div>
                ))}
                {files.length > 5 ? <div className="text-slate-500">+ {formatCount(files.length - 5)} file lainnya</div> : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          ) : null}

          <button className="btn-primary mt-4 flex w-full items-center justify-center gap-2" type="submit" disabled={loading}>
            <UploadCloud className="h-4 w-4" />
            {loading ? `Parsing ${importProgress}%` : files.length > 1 ? `Import ${formatCount(files.length)} PDF DRH` : "Import PDF DRH"}
          </button>

          {loading ? (
            <div className="mt-4 rounded-xl border border-dinkes-blue/20 bg-dinkes-50 p-4">
              <div className="flex items-center justify-between gap-3 text-sm font-semibold text-dinkes-navy">
                <span>Memetakan isi PDF DRH</span>
                <span>{importProgress}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-dinkes-blue transition-all duration-500" style={{ width: `${importProgress}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-dinkes-slate">Sistem sedang membaca halaman, mengekstrak tabel riwayat, dan menyiapkan preview data.</p>
            </div>
          ) : null}

          {shouldShowResultSummary ? (
            <div className={`mt-4 rounded-xl border p-4 text-sm ${result.batch && result.failedCount ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
              <div className="font-semibold">
                {result.batch
                  ? `Import selesai: ${formatCount(result.successCount)} berhasil, ${formatCount(result.failedCount)} gagal`
                  : `Import berhasil untuk ${result.namaPegawai || "-"}`}
              </div>
              {result.batch ? (
                <div className="mt-1">Total file diproses: {formatCount(result.totalFiles)}</div>
              ) : (
                <div className="mt-1">
                  NIP: {result.nip || "-"} | Pegawai {result.createdPegawai ? "dibuat baru" : "diperbarui"} | Halaman PDF:{" "}
                  {formatCount(result.parsedSummary.pages)}
                </div>
              )}
              {importedCounts ? (
                <div className="mt-2">
                  Pendidikan {formatCount(importedCounts.riwayat_pendidikan)}, keluarga {formatCount(importedCounts.keluarga)},
                  jabatan {formatCount(importedCounts.riwayat_jabatan)}, gaji pokok {formatCount(importedCounts.riwayat_gaji_pokok)},
                  pangkat {formatCount(importedCounts.riwayat_pangkat)}.
                </div>
              ) : null}
              {singlePreviewId ? (
                <button
                  className="btn-secondary mt-3 px-3 py-2"
                  type="button"
                  onClick={() => {
                    setSelectedPreviewId(singlePreviewId);
                    setSaveError("");
                    setSaveNotice("");
                  }}
                >
                  <Eye className="h-4 w-4" />
                  Lihat data lengkap
                </button>
              ) : null}
            </div>
          ) : null}
        </form>

        <div className="space-y-5">
          {loading ? <ImportSkeletonPreview progress={importProgress} /> : null}

          <div className="surface p-5">
            <h2 className="text-lg font-semibold text-slate-950">Ringkasan Hasil Import</h2>
            <DataTable
              rowKey="id"
              data={preview}
              columns={[
                { key: "bagian", header: "Bagian DRH", width: 260 },
                { key: "jumlah", header: "Jumlah", width: 140, render: (item) => (typeof item.jumlah === "number" ? formatCount(item.jumlah) : item.jumlah) },
                { key: "status", header: "Status", width: 200, render: (item) => <StatusBadge status={item.status} /> },
              ]}
            />
          </div>

          {batchRows.length ? (
            <div className="surface p-5">
              <h2 className="text-lg font-semibold text-slate-950">Hasil per File</h2>
              <DataTable
                rowKey="id"
                data={batchRows}
                columns={[
                  { key: "fileName", header: "File", width: 260, wrap: true },
                  { key: "nama", header: "Nama", width: 240, wrap: true },
                  { key: "nip", header: "NIP", width: 180 },
                  { key: "mode", header: "Pegawai", width: 130 },
                  { key: "status", header: "Status", width: 140, render: (item) => <StatusBadge status={item.status} /> },
                  { key: "message", header: "Keterangan", width: 360, wrap: true },
                ]}
                actions={(item) => item.canPreview ? (
                  <button
                    className="btn-secondary px-3 py-2"
                    type="button"
                    onClick={() => {
                      setSelectedPreviewId(item.id);
                      setSaveError("");
                      setSaveNotice("");
                    }}
                  >
                    <Eye className="h-4 w-4" />
                    Lihat data
                  </button>
                ) : (
                  <span className="text-xs font-medium text-slate-400">-</span>
                )}
              />
            </div>
          ) : null}

          <ParsedPreviewDetail
            item={selectedPreview}
            onCellChange={handlePreviewCellChange}
            onSave={handleSavePreview}
            saving={Boolean(selectedPreviewId && savingPreviewId === selectedPreviewId)}
            saveError={saveError}
            saveNotice={saveNotice}
          />

          {result?.parsedSummary?.pegawai && !result.batch && !selectedPreview ? (
            <div className="surface p-5">
              <h2 className="text-lg font-semibold text-slate-950">Data Diri Terbaca</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nama</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">{result.parsedSummary.pegawai.nama_lengkap || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">NRK / NIP</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">
                    {(result.parsedSummary.pegawai.nrk || "-") + " / " + (result.parsedSummary.pegawai.nip || "-")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jabatan</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">{result.parsedSummary.pegawai.jabatan || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unit Kerja</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">{result.parsedSummary.pegawai.unit_kerja || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telepon / HP</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">
                    {(result.parsedSummary.pegawai.no_telepon || "-") + " / " + (result.parsedSummary.pegawai.no_hp || "-")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">{result.parsedSummary.pegawai.email || "-"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
