export const CHECKLIST_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;
export const CHECKLIST_DOCUMENT_MAX_MB = CHECKLIST_DOCUMENT_MAX_BYTES / (1024 * 1024);

export const MUTASI_CHECKLIST_LABELS = {
  surat_pengantar: "Surat pengantar",
  sk_cpns_pns: "SK CPNS/PNS",
  sk_pangkat_terakhir: "SK pangkat terakhir",
  sk_jabatan: "SK jabatan",
  dp3_skp: "DP3 / SKP",
  ijazah: "Ijazah",
  kta_karpeg: "KTA / Karpeg",
  surat_lolos_butuh: "Surat lolos butuh",
  surat_lolos_lepas: "Surat lolos lepas",
  lainnya: "Lampiran lainnya"
};

export const PUTUS_JF_CHECKLIST_LABELS = {
  surat_pengantar: "Surat pengantar",
  surat_usulan: "Surat usulan putus/pembebasan JF",
  sk_jabatan_fungsional: "SK jabatan fungsional",
  pak_terakhir: "PAK / angka kredit terakhir",
  sk_pangkat_terakhir: "SK pangkat terakhir",
  skp_terakhir: "SKP terakhir",
  surat_pernyataan: "Surat pernyataan / alasan pemutusan",
  analisis_kebutuhan: "Analisis kebutuhan organisasi",
  draft_surat: "Draft surat putus JF",
  lainnya: "Lampiran lainnya"
};

export const USULAN_CHECKLIST_LABELS = {
  mutasi: MUTASI_CHECKLIST_LABELS,
  "putus-jf": PUTUS_JF_CHECKLIST_LABELS
};

export function getChecklistLabels(type) {
  return USULAN_CHECKLIST_LABELS[type] || {};
}

export function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function parseChecklist(value, labels) {
  const parsed = parseJsonObject(value);
  return Object.fromEntries(Object.keys(labels).map((key) => [key, Boolean(parsed?.[key])]));
}

export function getDocumentUrl(type, id, key) {
  const params = new URLSearchParams({
    type,
    id: String(id || ""),
    key
  });
  return `/api/usulan/dokumen?${params.toString()}`;
}

export function normalizeChecklistDocument(document, type, id, key) {
  if (!document || typeof document !== "object") return null;
  return {
    key,
    name: document.name || "dokumen.pdf",
    size: Number(document.size || 0),
    uploaded_at: document.uploaded_at || "",
    uploaded_by: document.uploaded_by || "",
    url: document.url || getDocumentUrl(type, id, key)
  };
}

export function parseChecklistDocuments(value, labels, type, id) {
  const parsed = parseJsonObject(value);
  return Object.fromEntries(
    Object.keys(labels).map((key) => [key, normalizeChecklistDocument(parsed?.[key], type, id, key)])
  );
}

export function hasChecklistDocument(document) {
  return Boolean(document?.url || document?.name);
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
