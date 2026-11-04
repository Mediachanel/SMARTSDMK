export function canonicalUkpd(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\bPS\b/g, "PASAR")
    .replace(/\bPUKESMAS\b/g, "PUSKESMAS")
    .replace(/\bRUMAH SAKIT UMUM DAERAH\b|\bRSUD\b/g, "")
    .replace(/\bSUKU DINAS KESEHATAN\b|\bSUDINKES\b/g, "")
    .replace(/\bPUSAT KESEHATAN MASYARAKAT\b|\bPUSKESMAS\b/g, "")
    .replace(/\bKOTA ADMINISTRASI\b|\bKABUPATEN ADMINISTRASI\b|\bKECAMATAN\b/g, "")
    .replace(/\bKEP\.?\b/g, "KEPULAUAN")
    .replace(/\bPULO GADUNG\b/g, "PULOGADUNG")
    .replace(/\bKRAMAT JATI\b/g, "KRAMATJATI")
    .replace(/\bPERAPATAN\b/g, "PRAPATAN")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
