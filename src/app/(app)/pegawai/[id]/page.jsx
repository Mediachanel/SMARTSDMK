"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BriefcaseBusiness,
  ChevronDown,
  Download,
  Edit,
  FileText,
  X,
  MapPin,
  Phone,
  Search,
} from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import ErrorState from "@/components/ui/ErrorState";
import { normalizePangkatGolonganOption } from "@/lib/pegawaiReferenceOptions";

const tabs = [
  { id: "overview", label: "Ringkasan" },
  { id: "employment", label: "Kepegawaian" },
  { id: "contact", label: "Kontak & Alamat" },
  { id: "family", label: "Keluarga" },
  { id: "history", label: "Riwayat" }
];

async function readApiPayload(response) {
  const raw = await response.text();
  if (!raw) throw new Error("Respons API kosong.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(raw.slice(0, 200) || "Respons API tidak valid.");
  }
}

function filenamePart(value, fallback = "pegawai") {
  return String(value || fallback)
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function dataUrlBytes(dataUrl) {
  const [, base64 = ""] = String(dataUrl || "").split(",");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function createPdfFromJpegs(images) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  function addBytes(bytes) {
    chunks.push(bytes);
    length += bytes.length;
  }

  function addText(text) {
    addBytes(encoder.encode(text));
  }

  function addObject(id, body) {
    offsets[id] = length;
    addText(`${id} 0 obj\n${body}\nendobj\n`);
  }

  function addStreamObject(id, dictionary, bytes) {
    offsets[id] = length;
    addText(`${id} 0 obj\n${dictionary}\nstream\n`);
    addBytes(bytes);
    addText("\nendstream\nendobj\n");
  }

  addText("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const kids = images.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, `<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>`);

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const draw = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index} Do\nQ\n`;
    const drawBytes = encoder.encode(draw);
    addObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    addStreamObject(imageId, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`, image.bytes);
    addStreamObject(contentId, `<< /Length ${drawBytes.length} >>`, drawBytes);
  });

  const xrefOffset = length;
  addText(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < offsets.length; id += 1) {
    addText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  addText(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return concatBytes(chunks);
}

async function previewProfilePdf(element, filename) {
  if (!element) throw new Error("Dokumen PDF belum siap.");
  const preview = window.open("", "_blank");
  if (!preview) {
    throw new Error("Popup preview PDF diblokir browser. Izinkan popup untuk membuka tab preview.");
  }
  const safeTitle = filename.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  preview.document.write(`<!doctype html><html><head><title>${safeTitle}</title><style>body{margin:0;display:grid;min-height:100vh;place-items:center;background:#0f172a;color:white;font:14px Arial,sans-serif}</style></head><body>Menyiapkan preview PDF...</body></html>`);
  preview.document.close();
  const pages = Array.from(element.querySelectorAll(".print-drh-page"));
  if (!pages.length) throw new Error("Halaman PDF tidak ditemukan.");
  if (document.fonts?.ready) await document.fonts.ready;
  const html2canvasModule = await import("html2canvas");
  const html2canvas = html2canvasModule.default || html2canvasModule;
  const images = [];
  const previews = [];
  for (const page of pages) {
    const canvas = await html2canvas(page, {
      backgroundColor: "#ffffff",
      scale: 3,
      useCORS: true,
      allowTaint: true,
      logging: false
    });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
    previews.push(dataUrl);
    images.push({
      width: canvas.width,
      height: canvas.height,
      bytes: dataUrlBytes(dataUrl)
    });
  }
  const pdfBytes = createPdfFromJpegs(images);
  const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
  preview.document.open();
  preview.document.write(`<!doctype html>
    <html>
      <head>
        <title>${safeTitle}</title>
        <style>
          html, body { height: 100%; margin: 0; background: #0f172a; font-family: Arial, sans-serif; }
          .toolbar { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 56px; padding: 10px 14px; background: #ffffff; border-bottom: 1px solid #cbd5e1; }
          .toolbar strong { color: #0f172a; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .toolbar a { border-radius: 8px; background: #0b4a7f; color: #ffffff; padding: 9px 14px; text-decoration: none; font-size: 13px; font-weight: 700; }
          main { box-sizing: border-box; height: calc(100% - 56px); overflow: auto; padding: 24px; }
          img { display: block; width: min(100%, 794px); height: auto; margin: 0 auto 24px; background: white; box-shadow: 0 16px 40px rgba(0,0,0,.35); }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <strong>${safeTitle}</strong>
          <a href="${url}" download="${safeTitle}">Download PDF</a>
        </div>
        <main>${previews.map((previewUrl, index) => `<img src="${previewUrl}" alt="Halaman ${index + 1}">`).join("")}</main>
      </body>
    </html>`);
  preview.document.close();
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "" && String(value).trim() !== "-";
}

function valueOrDash(value) {
  return hasValue(value) ? value : "-";
}

function formatPangkatGolongan(value) {
  const normalized = normalizePangkatGolonganOption(value);
  return valueOrDash(normalized || value);
}

function fullNameWithTitle(pegawai) {
  return [pegawai.gelar_depan, pegawai.nama, pegawai.gelar_belakang].filter(hasValue).join(" ");
}

function initials(name) {
  const words = String(name || "P")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words[0]?.[0] || "P") + (words[1]?.[0] || "");
}

function ProfileAvatar({ pegawai, className = "", onOpenPhoto = null }) {
  const photoUrl = pegawai?.foto_profil_url || "";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  const baseClassName = [
    "grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-dinkes-700 text-2xl font-extrabold uppercase text-white shadow-sm ring-1 ring-white/80 sm:h-24 sm:w-24 sm:text-3xl",
    className
  ].filter(Boolean).join(" ");

  if (photoUrl && !failed) {
    return (
      <button
        type="button"
        className={`${baseClassName} cursor-zoom-in transition hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-dinkes-100`}
        onClick={onOpenPhoto}
        aria-label="Lihat foto profil"
        title="Lihat foto profil"
      >
        <img
          src={photoUrl}
          alt={`Foto profil ${fullNameWithTitle(pegawai) || pegawai?.nama || "pegawai"}`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </button>
    );
  }

  return (
    <div className={baseClassName}>
      {initials(pegawai?.nama)}
    </div>
  );
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function buildLocalDate(year, month, day) {
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (!isValidDate(date)) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text || text === "0" || text === "0000-00-00") return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return buildLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return buildLocalDate(Number(slash[3]), Number(slash[2]), Number(slash[1]));
  const date = new Date(text);
  return isValidDate(date) ? date : null;
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("id-ID").format(number) : valueOrDash(value);
}

function formatDrhDate(value) {
  const date = parseDate(value);
  if (!date) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function durationFrom(value) {
  const date = parseDate(value);
  if (!date) return "-";
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  let months = now.getMonth() - date.getMonth();
  if (now.getDate() < date.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0) return `${Math.max(months, 0)} bulan`;
  return `${years} tahun ${months} bulan`;
}

function normalizeJenisRiwayat(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "pendidikan_terakhir" ? "formal" : normalized;
}

function normalizeSearch(value) {
  return String(value || "").toLowerCase().trim();
}

function relationText(items) {
  return items.filter(hasValue).join(" | ");
}

function filterFilledItems(items) {
  return items.filter((item) => hasValue(item.value));
}

function fieldText(value) {
  if (!hasValue(value)) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}

function hasRealName(value) {
  return hasValue(value) && String(value).trim() !== "0";
}

function LinkValue({ type, value }) {
  if (!hasValue(value)) return null;
  if (type === "email") {
    return <a className="font-semibold text-dinkes-700 hover:text-dinkes-900" href={`mailto:${value}`}>{value}</a>;
  }
  if (type === "phone") {
    const clean = String(value).replace(/[^\d+]/g, "");
    return <a className="font-semibold text-dinkes-700 hover:text-dinkes-900" href={`tel:${clean}`}>{value}</a>;
  }
  return value;
}

function InfoGrid({ items, columns = "lg:grid-cols-2" }) {
  const visibleItems = filterFilledItems(items);
  if (!visibleItems.length) return null;

  return (
    <dl className={`grid gap-2 sm:grid-cols-2 ${columns}`}>
      {visibleItems.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</dt>
          <dd className="mt-1 break-words text-xs font-semibold leading-5 text-slate-950 xl:text-sm">
            {item.type ? <LinkValue type={item.type} value={item.value} /> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SectionCard({ id, title, description, children }) {
  if (!children) return null;
  return (
    <section id={id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-etpp sm:p-4">
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 hidden text-sm leading-6 text-slate-600 lg:block">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyTabState({ label = "Belum ada data" }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
      {label}
    </div>
  );
}

function TabsNavigation({ activeTab, onChange }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-etpp">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={[
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition",
                active ? "bg-dinkes-700 text-white shadow-sm" : "text-slate-600 hover:bg-dinkes-50 hover:text-dinkes-800"
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PhotoPreviewModal({ pegawai, open, onClose }) {
  if (!open || !pegawai?.foto_profil_url) return null;
  const name = fullNameWithTitle(pegawai) || pegawai.nama || "Pegawai";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm print:hidden" role="dialog" aria-modal="true" aria-label="Preview foto profil" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-slate-950">{name}</h2>
            <p className="text-sm text-slate-500">Foto profil pegawai</p>
          </div>
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50" onClick={onClose} aria-label="Tutup preview foto">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-hidden rounded-xl bg-slate-100">
          <img src={pegawai.foto_profil_url} alt={`Foto profil ${name}`} className="max-h-[72vh] w-full object-contain" />
        </div>
      </div>
    </div>
  );
}

function ProfileSummary({ pegawai, computed, onDownloadPdf, pdfBusy, onOpenPhoto }) {
  const name = fullNameWithTitle(pegawai);
  const summaryItems = [
    { label: "UKPD", value: pegawai.nama_ukpd, icon: MapPin },
    { label: "Pangkat/Gol.", value: formatPangkatGolongan(pegawai.pangkat_golongan), icon: FileText },
    { label: "Masa Kerja", value: computed.masaKerja, icon: BriefcaseBusiness },
    { label: "Kontak", value: pegawai.email || pegawai.no_hp_pegawai, icon: Phone }
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-etpp">
      <div className="border-b border-slate-100 bg-gradient-to-br from-dinkes-50 via-white to-slate-50 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <ProfileAvatar pegawai={pegawai} onOpenPhoto={onOpenPhoto} />
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={pegawai.kondisi || "Tidak Diketahui"} />
                <StatusBadge status={pegawai.jenis_pegawai} />
              </div>
              <h1 className="mt-1 break-words text-xl font-extrabold tracking-normal text-slate-950 lg:text-2xl">{name}</h1>
              <p className="mt-0.5 line-clamp-1 text-sm font-semibold leading-5 text-slate-600">{computed.jabatan}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{valueOrDash(pegawai.nip)} | {valueOrDash(pegawai.nrk)}</p>
            </div>
          </div>
          <div className="flex gap-2 print:hidden sm:flex-wrap sm:justify-end">
            <Link className="btn-primary flex-1 px-3 sm:flex-none" href={`/pegawai/${pegawai.id_pegawai}/edit`}>
              <Edit className="h-4 w-4" />
              Edit
            </Link>
            <button className="btn-secondary min-w-11 px-3 sm:min-w-0" type="button" onClick={onDownloadPdf} disabled={pdfBusy} aria-label="Download PDF profil" title="Download PDF">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{pdfBusy ? "Menyiapkan..." : "PDF"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
        {filterFilledItems(summaryItems).map((item) => (
          <div key={item.label} className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-dinkes-700 ring-1 ring-slate-200">
              <item.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="mt-1 line-clamp-2 text-xs font-extrabold leading-5 text-slate-950 xl:text-sm">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompactListTable({ columns, data, rowKey = "id" }) {
  if (!data?.length) return null;
  return (
    <div>
      <div className="grid gap-3 md:hidden">
        {data.map((row, index) => (
          <article key={row[rowKey] || `${rowKey}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-950">
              {columns[1]?.render ? columns[1].render(row, index) : valueOrDash(row[columns[1]?.key] || row[columns[0]?.key])}
            </h3>
            <dl className="mt-3 grid gap-2">
              {columns.map((column) => (
                <div key={column.key} className="grid grid-cols-[92px_1fr] gap-3 border-t border-slate-100 pt-2 text-sm">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{column.header}</dt>
                  <dd className="min-w-0 break-words text-right font-semibold text-slate-700">
                    {column.render ? column.render(row, index) : valueOrDash(row[column.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <div className="table-scroll hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
        <table className="w-full min-w-[720px] table-fixed border-collapse">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="table-th uppercase" scope="col">{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data.map((row, index) => (
              <tr key={row[rowKey] || `${rowKey}-${index}`} className="hover:bg-dinkes-50/40">
                {columns.map((column) => (
                  <td key={column.key} className="table-td whitespace-normal text-slate-700">
                    {column.render ? column.render(row, index) : valueOrDash(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryAccordion({ title, description, columns, data }) {
  if (!data?.length) return null;
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-etpp">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
        <div>
          <h3 className="text-base font-bold text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-dinkes-50 px-3 py-1 text-xs font-bold text-dinkes-700">{data.length} data</span>
          <ChevronDown className="h-5 w-5 text-slate-500 transition group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t border-slate-200 p-4">
        <CompactListTable columns={columns} data={data} />
      </div>
    </details>
  );
}

function buildKeluargaRows(pegawai) {
  if (Array.isArray(pegawai?.keluarga) && pegawai.keluarga.length) {
    return pegawai.keluarga.map((item, index) => ({
      id: item.id || `keluarga-${index}`,
      hubungan: item.hubungan,
      hubungan_detail: item.hubungan_detail,
      nama: item.nama,
      jenis_kelamin: item.jenis_kelamin,
      tempat_tanggal_lahir: relationText([item.tempat_lahir, formatDate(item.tanggal_lahir)]),
      status_tunjangan: item.status_tunjangan,
      pekerjaan: item.pekerjaan,
      kontak: relationText([item.no_tlp, item.email])
    })).filter((item) => hasRealName(item.nama));
  }

  const rows = [];
  if (pegawai?.pasangan?.status_punya === "Ya" && hasValue(pegawai.pasangan.nama)) {
    rows.push({
      id: pegawai.pasangan.id || "pasangan-main",
      hubungan: "Pasangan",
      hubungan_detail: "Pasangan",
      nama: pegawai.pasangan.nama,
      jenis_kelamin: "",
      tempat_tanggal_lahir: "",
      status_tunjangan: "",
      pekerjaan: pegawai.pasangan.pekerjaan,
      kontak: relationText([pegawai.pasangan.no_tlp, pegawai.pasangan.email])
    });
  }

  if (Array.isArray(pegawai?.anak)) {
    pegawai.anak.forEach((item, index) => {
      if (!hasRealName(item.nama)) return;
      rows.push({
        id: item.id || `anak-${index}`,
        hubungan: "Anak",
        hubungan_detail: `Anak ${index + 1}`,
        nama: item.nama,
        jenis_kelamin: item.jenis_kelamin,
        tempat_tanggal_lahir: relationText([item.tempat_lahir, formatDate(item.tanggal_lahir)]),
        status_tunjangan: "",
        pekerjaan: item.pekerjaan,
        kontak: ""
      });
    });
  }

  return rows;
}

const keluargaColumns = [
  { key: "hubungan", header: "Hubungan" },
  { key: "nama", header: "Nama", render: (item) => <span className="font-bold text-slate-950">{valueOrDash(item.nama)}</span> },
  { key: "jenis_kelamin", header: "Jenis Kelamin" },
  { key: "tempat_tanggal_lahir", header: "Tempat / Tgl Lahir" },
  { key: "status_tunjangan", header: "Tunjangan" },
  { key: "pekerjaan", header: "Pekerjaan" },
  { key: "kontak", header: "Kontak" }
];

const pendidikanColumns = [
  { key: "jenis_riwayat", header: "Jenis" },
  { key: "jenjang_pendidikan", header: "Jenjang" },
  { key: "program_studi", header: "Program Studi" },
  { key: "nama_institusi", header: "Institusi", render: (item) => valueOrDash(item.nama_institusi || item.nama_universitas) },
  { key: "tanggal_ijazah", header: "Tgl Ijazah", render: (item) => formatDate(item.tanggal_ijazah) },
  { key: "tahun_lulus", header: "Tahun" }
];

const jabatanColumns = [
  { key: "tmt_jabatan", header: "TMT", render: (item) => formatDate(item.tmt_jabatan) },
  { key: "nama_jabatan_menpan", header: "Jabatan", render: (item) => valueOrDash(item.nama_jabatan_menpan || item.nama_jabatan_orb) },
  { key: "nama_ukpd", header: "UKPD" },
  { key: "pangkat_golongan", header: "Pangkat/Gol.", render: (item) => formatPangkatGolongan(item.pangkat_golongan) },
  { key: "nomor_sk", header: "No SK" },
  { key: "tanggal_sk", header: "Tgl SK", render: (item) => formatDate(item.tanggal_sk) }
];

const pltPlhColumns = [
  { key: "jenis_penugasan", header: "Jenis" },
  { key: "ukpd_tujuan", header: "UKPD PLT/PLH" },
  { key: "jabatan_tujuan", header: "Jabatan PLT/PLH", render: (item) => valueOrDash(item.jabatan_tujuan) },
  { key: "jabatan_saat_ini", header: "Jabatan Saat Ini", render: (item) => valueOrDash(item.jabatan_saat_ini) },
  { key: "pangkat_golongan", header: "Pangkat/Gol.", render: (item) => formatPangkatGolongan(item.pangkat_golongan) },
  { key: "mulai_penugasan", header: "Mulai", render: (item) => formatDate(item.mulai_penugasan) },
  { key: "selesai_penugasan", header: "Selesai", render: (item) => formatDate(item.selesai_penugasan) }
];

const gajiColumns = [
  { key: "tmt_gaji", header: "TMT", render: (item) => formatDate(item.tmt_gaji) },
  { key: "pangkat_golongan", header: "Pangkat/Gol.", render: (item) => formatPangkatGolongan(item.pangkat_golongan) },
  { key: "gaji_pokok", header: "Gaji Pokok", render: (item) => formatNumber(item.gaji_pokok) },
  { key: "nomor_sk", header: "No SK" }
];

const pangkatColumns = [
  { key: "tmt_pangkat", header: "TMT", render: (item) => formatDate(item.tmt_pangkat) },
  { key: "pangkat_golongan", header: "Pangkat/Gol.", render: (item) => formatPangkatGolongan(item.pangkat_golongan) },
  { key: "lokasi", header: "Lokasi" },
  { key: "nomor_sk", header: "No SK" },
  { key: "tanggal_sk", header: "Tgl SK", render: (item) => formatDate(item.tanggal_sk) }
];

const penghargaanColumns = [
  { key: "nama_penghargaan", header: "Penghargaan" },
  { key: "asal_penghargaan", header: "Asal" },
  { key: "tanggal_sk", header: "Tanggal", render: (item) => formatDate(item.tanggal_sk) },
  { key: "keterangan", header: "Keterangan" }
];

const skpColumns = [
  { key: "tahun", header: "Tahun" },
  { key: "nilai_skp", header: "Nilai SKP" },
  { key: "nilai_perilaku", header: "Nilai Perilaku" },
  { key: "nilai_prestasi", header: "Nilai Prestasi" }
];

const hukumanColumns = [
  { key: "tanggal_mulai", header: "Tgl Mulai", render: (item) => formatDate(item.tanggal_mulai) },
  { key: "tanggal_akhir", header: "Tgl Akhir", render: (item) => formatDate(item.tanggal_akhir) },
  { key: "hukuman_disiplin", header: "Hukuman" },
  { key: "nomor_sk", header: "No SK" },
  { key: "keterangan", header: "Keterangan" }
];

const prestasiColumns = [
  { key: "kategori", header: "Kategori" },
  { key: "jenjang_pendidikan", header: "Jenjang" },
  { key: "prestasi", header: "Prestasi" }
];

const narasumberColumns = [
  { key: "kegiatan", header: "Kegiatan" },
  { key: "judul_materi", header: "Judul Materi" },
  { key: "lembaga_penyelenggara", header: "Penyelenggara" }
];

const kegiatanStrategisColumns = [
  { key: "kegiatan", header: "Kegiatan" },
  { key: "tahun_anggaran", header: "Tahun" },
  { key: "jumlah_anggaran", header: "Anggaran", render: (item) => formatNumber(item.jumlah_anggaran) },
  { key: "kedudukan_dalam_kegiatan", header: "Kedudukan" }
];

const keberhasilanColumns = [
  { key: "jabatan", header: "Jabatan" },
  { key: "tahun", header: "Tahun" },
  { key: "keberhasilan", header: "Keberhasilan" },
  { key: "kendala_yang_dihadapi", header: "Kendala" },
  { key: "solusi_yang_dilakukan", header: "Solusi" }
];

function getHistoryYear(row) {
  const values = [
    row.tahun,
    row.tahun_lulus,
    row.tahun_anggaran,
    row.tmt_jabatan,
    row.tmt_pangkat,
    row.tmt_gaji,
    row.tanggal_sk,
    row.tanggal_ijazah,
    row.tanggal_mulai,
    row.mulai_penugasan,
    row.selesai_penugasan
  ];
  const match = values.map(fieldText).join(" ").match(/\b(19|20)\d{2}\b/);
  return match?.[0] || "";
}

function printValue(value) {
  if (typeof value === "object") return "-";
  return hasValue(value) ? value : "-";
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function formatPrintNumber(value) {
  return hasValue(value) ? formatNumber(value) : "-";
}

function joinPrintParts(values, separator = " / ") {
  return values.filter(hasValue).join(separator);
}

function fullNameWithTitleForPrint(pegawai) {
  const name = [pegawai.gelar_depan, pegawai.nama].filter(hasValue).join(" ");
  if (hasValue(pegawai.gelar_belakang)) return `${name}, ${pegawai.gelar_belakang}`;
  return name;
}

function formatPrintBirth(pegawai) {
  return joinPrintParts([pegawai.tempat_lahir, formatDrhDate(pegawai.tanggal_lahir)]);
}

function formatPrintPhone(pegawai) {
  const telephone = pegawai.no_telepon || pegawai.no_telp || pegawai.telepon;
  const hp = pegawai.no_hp_pegawai || pegawai.no_hp;
  if (hasValue(telephone) || hasValue(hp)) return `${hasValue(telephone) ? telephone : ""} / ${hasValue(hp) ? hp : ""}`;
  return "-";
}

function formatPrintAddress(pegawai) {
  const addressRow = pegawai.alamat?.domisili || pegawai.alamat?.ktp || null;
  if (addressRow) {
    const lines = [
      addressRow.jalan,
      addressRow.kelurahan ? `KELURAHAN ${addressRow.kelurahan}` : "",
      addressRow.kecamatan ? `KECAMATAN ${addressRow.kecamatan}` : "",
      joinPrintParts([addressRow.kota_kabupaten, addressRow.provinsi], " - ")
    ].filter(hasValue);
    if (lines.length) return lines.join("\n");
  }
  return pegawai.alamat_domisili || pegawai.alamat_ktp || "-";
}

function formatPrintTtl(row) {
  const place = row.tempat_lahir ? `${row.tempat_lahir},` : "";
  return joinPrintParts([place, formatDrhDate(row.tanggal_lahir)], "\n");
}

function printRowNumber(_row, index) {
  return index + 1;
}

function getPrintJabatanRows(rows, type) {
  const items = arrayValue(rows);
  if (type === "fungsional") {
    return items.filter((item) => normalizeJenisRiwayat(item.jenis_jabatan) === "fungsional");
  }
  return items.filter((item) => normalizeJenisRiwayat(item.jenis_jabatan) !== "fungsional");
}

function getPrintPrestasiRows(rows, type) {
  return arrayValue(rows).filter((item) => normalizeJenisRiwayat(item.kategori) === type);
}

function PrintHeader() {
  return (
    <header className="print-drh-header">
      <img className="print-drh-logo" src="/dinkes.png" alt="Logo Dinas Kesehatan Provinsi DKI Jakarta" />
      <div className="print-drh-heading">
        <p className="print-drh-agency">DINAS KESEHATAN PROVINSI DKI JAKARTA</p>
        <p className="print-drh-address">Jl. Kesehatan No. 10, Petojo Selatan, Kecamatan Gambir, Kota Jakarta Pusat, DKI Jakarta 10160</p>
        <p className="print-drh-contact">Telp. 021-3451338 | Email: dinkes@jakarta.go.id</p>
        <p className="print-drh-title">Daftar Riwayat Hidup</p>
      </div>
      <div aria-hidden="true" />
    </header>
  );
}

function PrintFooter({ pegawai, computed }) {
  const printedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const name = fullNameWithTitleForPrint(pegawai) || computed?.nama || "Pegawai";

  return (
    <footer className="print-drh-footer">
      <span>{printedAt}</span>
      <span>Daftar Riwayat Hidup - {name}</span>
    </footer>
  );
}

function PrintPage({ children, breakBefore = false, pegawai, computed }) {
  return (
    <section className={`print-drh-page ${breakBefore ? "print-break-before" : ""}`}>
      <PrintHeader />
      {children}
      <PrintFooter pegawai={pegawai} computed={computed} />
    </section>
  );
}

function PrintSection({ title, children }) {
  return (
    <section className="print-drh-section">
      <h2 className="print-drh-section-title">{title}</h2>
      {children}
    </section>
  );
}

function PrintTable({ columns, rows }) {
  const dataRows = arrayValue(rows);
  return (
    <table className="print-drh-table">
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={column.width ? { width: column.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dataRows.length ? dataRows.map((row, index) => (
          <tr key={row.id || row.source_key || `${columns[0]?.key}-${index}`}>
            {columns.map((column) => (
              <td key={column.key} className={column.align === "center" ? "print-drh-center" : ""}>
                <span className="print-drh-cell-preline">
                  {printValue(column.render ? column.render(row, index) : row[column.key])}
                </span>
              </td>
            ))}
          </tr>
        )) : (
          <tr>
            <td className="print-drh-empty" colSpan={columns.length}>Tidak ada data</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function PrintDataDiri({ pegawai, computed }) {
  const items = [
    { label: "NAMA", value: fullNameWithTitleForPrint(pegawai) || computed.nama },
    { label: "NRK / NIP", value: joinPrintParts([pegawai.nrk, pegawai.nip]) },
    { label: "TEMPAT / TGL LAHIR", value: formatPrintBirth(pegawai) },
    { label: "AGAMA", value: pegawai.agama },
    { label: "JENIS KELAMIN", value: pegawai.jenis_kelamin },
    { label: "STATUS PERNIKAHAN", value: pegawai.status_pernikahan || pegawai.status_perkawinan },
    { label: "JABATAN", value: computed.jabatan },
    { label: "UNIT KERJA", value: pegawai.nama_ukpd },
    { label: "NO. TELEPON / HP", value: formatPrintPhone(pegawai) },
    { label: "EMAIL", value: pegawai.email },
    { label: "ALAMAT", value: formatPrintAddress(pegawai) }
  ];

  return (
    <PrintSection title="DATA DIRI">
      <div className="print-drh-data-body">
        <dl className="print-drh-data">
          {items.map((item) => (
            <div className="print-drh-data-row" key={item.label}>
              <dt>{item.label}</dt>
              <dd>:</dd>
              <dd className="print-drh-cell-preline">{printValue(item.value)}</dd>
            </div>
          ))}
        </dl>
        {pegawai?.foto_profil_url ? (
          <div className="print-drh-data-photo-wrap">
            <img className="print-drh-data-photo" src={pegawai.foto_profil_url} alt="" />
          </div>
        ) : null}
      </div>
    </PrintSection>
  );
}

const pendidikanFormalPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "jenjang_pendidikan", header: "PENDIDIKAN", width: "16%", align: "center" },
  { key: "program_studi", header: "JURUSAN", width: "18%" },
  { key: "tanggal_ijazah", header: "TGL IJAZAH", width: "13%", align: "center", render: (row) => formatDrhDate(row.tanggal_ijazah) },
  { key: "nama_institusi", header: "SEKOLAH/UNIVERSITAS", render: (row) => row.nama_institusi || row.nama_universitas },
  { key: "kota_institusi", header: "KOTA", width: "18%", align: "center" }
];

const pendidikanNonFormalPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "tanggal_ijazah", header: "TGL IJAZAH", width: "17%", align: "center", render: (row) => formatDrhDate(row.tanggal_ijazah) },
  { key: "nama_institusi", header: "SEKOLAH", render: (row) => row.nama_institusi || row.nama_universitas },
  { key: "kota_institusi", header: "KOTA", width: "18%", align: "center" }
];

const keluargaPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "hubungan_detail", header: "HUBUNGAN", width: "16%", render: (row) => row.hubungan_detail || row.hubungan },
  { key: "nama", header: "NAMA", width: "22%" },
  { key: "ttl", header: "TTL", width: "14%", render: formatPrintTtl },
  { key: "jenis_kelamin", header: "JK", width: "10%", align: "center" },
  { key: "status_tunjangan", header: "TUNJANGAN", width: "12%" },
  { key: "pekerjaan", header: "PEKERJAAN" }
];

const jabatanPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "tmt_jabatan", header: "TMT", width: "10%", align: "center", render: (row) => formatDrhDate(row.tmt_jabatan) },
  { key: "lokasi", header: "LOKASI", width: "23%" },
  { key: "nama_jabatan_menpan", header: "JABATAN", render: (row) => row.nama_jabatan_menpan || row.nama_jabatan_orb },
  { key: "pangkat_golongan", header: "PANGKAT/GOL", width: "13%", render: (row) => formatPangkatGolongan(row.pangkat_golongan) },
  { key: "eselon", header: "ESL", width: "5.5%", align: "center" },
  { key: "nomor_sk", header: "NO.SK", width: "13%" },
  { key: "tanggal_sk", header: "TGL.SK", width: "9.5%", align: "center", render: (row) => formatDrhDate(row.tanggal_sk) }
];

const pltPlhPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "jenis_penugasan", header: "JENIS", width: "8%", align: "center" },
  { key: "ukpd_tujuan", header: "UKPD PLT/PLH", width: "23%" },
  { key: "jabatan_tujuan", header: "JABATAN PLT/PLH" },
  { key: "pangkat_golongan", header: "PANGKAT/GOL", width: "13%", render: (row) => formatPangkatGolongan(row.pangkat_golongan) },
  { key: "mulai_penugasan", header: "MULAI", width: "10%", align: "center", render: (row) => formatDrhDate(row.mulai_penugasan) },
  { key: "selesai_penugasan", header: "SELESAI", width: "10%", align: "center", render: (row) => formatDrhDate(row.selesai_penugasan) }
];

const gajiPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "tmt_gaji", header: "TMT", width: "14%", align: "center", render: (row) => formatDrhDate(row.tmt_gaji) },
  { key: "pangkat_golongan", header: "PANGKAT/GOL", width: "28%", render: (row) => formatPangkatGolongan(row.pangkat_golongan) },
  { key: "gaji_pokok", header: "GAJI", width: "18%", render: (row) => formatPrintNumber(row.gaji_pokok) },
  { key: "nomor_sk", header: "NO.SK", width: "19%" },
  { key: "tanggal_sk", header: "TGL.SK", width: "16.5%", align: "center", render: (row) => formatDrhDate(row.tanggal_sk) }
];

const pangkatPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "tmt_pangkat", header: "TMT", width: "11%", align: "center", render: (row) => formatDrhDate(row.tmt_pangkat) },
  { key: "pangkat_golongan", header: "PANGKAT/GOL", width: "16%", render: (row) => formatPangkatGolongan(row.pangkat_golongan) },
  { key: "lokasi", header: "LOKASI" },
  { key: "nomor_sk", header: "NO.SK", width: "17%" },
  { key: "tanggal_sk", header: "TGL.SK", width: "11%", align: "center", render: (row) => formatDrhDate(row.tanggal_sk) }
];

const penghargaanPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "nama_penghargaan", header: "NAMA PENGHARGAAN", width: "38%" },
  { key: "asal_penghargaan", header: "ASAL PENGHARGAAN" },
  { key: "nomor_sk", header: "NO.SK", width: "17%" },
  { key: "tanggal_sk", header: "TGL.SK", width: "11%", align: "center", render: (row) => formatDrhDate(row.tanggal_sk) }
];

const skpPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "tahun", header: "TAHUN", width: "12%", align: "center" },
  { key: "nilai_skp", header: "NILAI SKP", width: "14%", align: "center" },
  { key: "nilai_perilaku", header: "NILAI PERILAKU", width: "14%", align: "center" },
  { key: "nilai_prestasi", header: "NILAI PRESTASI", width: "17%", align: "center" },
  { key: "keterangan_prestasi", header: "KETERANGAN PRESTASI", render: (row) => row.keterangan_prestasi || row.keterangan }
];

const hukumanPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "tanggal_mulai", header: "TGMULAI", width: "12%", align: "center", render: (row) => formatDrhDate(row.tanggal_mulai) },
  { key: "tanggal_akhir", header: "TGAKHIR", width: "12%", align: "center", render: (row) => formatDrhDate(row.tanggal_akhir) },
  { key: "hukuman_disiplin", header: "HUKUMAN DISIPLIN", width: "27%" },
  { key: "nomor_sk", header: "NO.SK", width: "15%" },
  { key: "tanggal_sk", header: "TGL.SK", width: "12%", align: "center", render: (row) => formatDrhDate(row.tanggal_sk) },
  { key: "keterangan", header: "KETERANGAN" }
];

const prestasiPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "jenjang_pendidikan", header: "JENJANG PENDIDIKAN", width: "34%" },
  { key: "prestasi", header: "PRESTASI YANG PERNAH DIRAIH" }
];

const narasumberPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "kegiatan", header: "KEGIATAN", width: "24%" },
  { key: "judul_materi", header: "JUDUL MATERI YANG DIBAWAKAN", width: "38%" },
  { key: "lembaga_penyelenggara", header: "LEMBAGA PENYELENGGARA" }
];

const kegiatanStrategisPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "kegiatan", header: "KEGIATAN", width: "35%" },
  { key: "tahun_anggaran", header: "TAHUN ANGGARAN", width: "16%", align: "center" },
  { key: "jumlah_anggaran", header: "JUMLAH ANGGARAN", width: "17%", render: (row) => formatPrintNumber(row.jumlah_anggaran) },
  { key: "kedudukan_dalam_kegiatan", header: "KEDUDUKAN DALAM KEGIATAN" }
];

const keberhasilanPrintColumns = [
  { key: "no", header: "NO", width: "4.5%", align: "center", render: printRowNumber },
  { key: "jabatan", header: "JABATAN", width: "16%" },
  { key: "tahun", header: "TAHUN", width: "11%", align: "center" },
  { key: "keberhasilan", header: "KEBERHASILAN", width: "20%" },
  { key: "kendala_yang_dihadapi", header: "KENDALA YANG DIHADAPI", width: "24%" },
  { key: "solusi_yang_dilakukan", header: "SOLUSI YANG DILAKUKAN" }
];

function PrintSupportSection({ number, title, note, columns, rows }) {
  return (
    <section className="print-drh-support-section">
      <h3>{number}. {title}</h3>
      {note ? <p className="print-drh-note">({note})</p> : null}
      <PrintTable columns={columns} rows={rows} />
    </section>
  );
}

function PrintProfileDocument({ pegawai, computed }) {
  const structuralRows = getPrintJabatanRows(pegawai.riwayat_jabatan, "struktural");
  const functionalRows = getPrintJabatanRows(pegawai.riwayat_jabatan, "fungsional");
  const formalPrestasiRows = getPrintPrestasiRows(pegawai.riwayat_prestasi_pendidikan, "formal");
  const nonFormalPrestasiRows = getPrintPrestasiRows(pegawai.riwayat_prestasi_pendidikan, "non_formal");

  return (
    <article className="print-profile" aria-label="Dokumen cetak profil pegawai">
      <PrintPage pegawai={pegawai} computed={computed}>
        <PrintDataDiri pegawai={pegawai} computed={computed} />
        <PrintSection title="RIWAYAT PENDIDIKAN FORMAL">
          <PrintTable columns={pendidikanFormalPrintColumns} rows={computed.riwayatPendidikanFormal} />
        </PrintSection>
        <PrintSection title="RIWAYAT PENDIDIKAN NON FORMAL">
          <PrintTable columns={pendidikanNonFormalPrintColumns} rows={computed.riwayatPendidikanNonFormal} />
        </PrintSection>
      </PrintPage>

      <PrintPage breakBefore pegawai={pegawai} computed={computed}>
        <PrintSection title="RIWAYAT KELUARGA">
          <PrintTable columns={keluargaPrintColumns} rows={arrayValue(pegawai.keluarga).length ? pegawai.keluarga : computed.keluargaRows} />
        </PrintSection>
        <PrintSection title="RIWAYAT JABATAN STRUKTURAL">
          <PrintTable columns={jabatanPrintColumns} rows={structuralRows} />
        </PrintSection>
        <PrintSection title="RIWAYAT JABATAN FUNGSIONAL">
          <PrintTable columns={jabatanPrintColumns} rows={functionalRows} />
        </PrintSection>
        <PrintSection title="RIWAYAT PLT/PLH">
          <PrintTable columns={pltPlhPrintColumns} rows={pegawai.riwayat_plt_plh} />
        </PrintSection>
      </PrintPage>

      <PrintPage breakBefore pegawai={pegawai} computed={computed}>
        <PrintSection title="RIWAYAT GAJI POKOK">
          <PrintTable columns={gajiPrintColumns} rows={pegawai.riwayat_gaji_pokok} />
        </PrintSection>
        <PrintSection title="RIWAYAT PANGKAT">
          <PrintTable columns={pangkatPrintColumns} rows={pegawai.riwayat_pangkat} />
        </PrintSection>
        <PrintSection title="RIWAYAT PENGHARGAAN">
          <PrintTable columns={penghargaanPrintColumns} rows={pegawai.riwayat_penghargaan} />
        </PrintSection>
        <PrintSection title="RIWAYAT SKP">
          <PrintTable columns={skpPrintColumns} rows={pegawai.riwayat_skp} />
        </PrintSection>
        <PrintSection title="RIWAYAT HUKUMAN DISIPLIN">
          <PrintTable columns={hukumanPrintColumns} rows={pegawai.riwayat_hukuman_disiplin} />
        </PrintSection>
      </PrintPage>

      <PrintPage breakBefore pegawai={pegawai} computed={computed}>
        <section className="print-drh-support">
          <h2>INFORMASI PENDUKUNG :</h2>
          <PrintSupportSection
            number="1"
            title="Prestasi pendidikan formal"
            note="prestasi sebelum menjadi CPNS sampai dengan sekarang"
            columns={prestasiPrintColumns}
            rows={formalPrestasiRows}
          />
          <PrintSupportSection
            number="2"
            title="Prestasi pendidikan non formal"
            note="prestasi sebelum menjadi CPNS sampai dengan sekarang"
            columns={prestasiPrintColumns}
            rows={nonFormalPrestasiRows}
          />
          <PrintSupportSection
            number="3"
            title="Pengalaman sebagai narasumber"
            note="narasumber untuk tingkat nasional dan internasional"
            columns={narasumberPrintColumns}
            rows={pegawai.riwayat_narasumber}
          />
          <PrintSupportSection
            number="4"
            title="Keberhasilan dalam mengelola kegiatan strategis dan jumlah anggaran yang dikelola"
            note="keberhasilan dari CPNS sampai dengan sekarang"
            columns={kegiatanStrategisPrintColumns}
            rows={pegawai.riwayat_kegiatan_strategis}
          />
          <PrintSupportSection
            number="5"
            title="Keberhasilan yang telah dicapai"
            note="keberhasilan sebelum menjadi CPNS sampai dengan sekarang"
            columns={keberhasilanPrintColumns}
            rows={pegawai.riwayat_keberhasilan}
          />
        </section>
      </PrintPage>
    </article>
  );
}

function filterHistoryRows(rows, query, year) {
  const q = normalizeSearch(query);
  return (rows || []).filter((row) => {
    const textMatch = !q || normalizeSearch(Object.values(row).join(" ")).includes(q);
    const yearMatch = !year || getHistoryYear(row) === year;
    return textMatch && yearMatch;
  });
}

function historyConfig(pegawai, computed, query, year) {
  return [
    {
      title: "Riwayat Pendidikan Formal",
      description: "Pendidikan formal yang tersimpan.",
      columns: pendidikanColumns,
      data: filterHistoryRows(computed.riwayatPendidikanFormal, query, year)
    },
    {
      title: "Riwayat Pendidikan Non Formal",
      description: "Pelatihan atau pendidikan non formal.",
      columns: pendidikanColumns,
      data: filterHistoryRows(computed.riwayatPendidikanNonFormal, query, year)
    },
    { title: "Riwayat Jabatan", description: "Perubahan jabatan dan unit kerja.", columns: jabatanColumns, data: filterHistoryRows(pegawai.riwayat_jabatan, query, year) },
    { title: "Riwayat PLT/PLH", description: "Penugasan PLT dan PLH yang tercatat.", columns: pltPlhColumns, data: filterHistoryRows(pegawai.riwayat_plt_plh, query, year) },
    { title: "Riwayat Pangkat", description: "Pangkat dan golongan.", columns: pangkatColumns, data: filterHistoryRows(pegawai.riwayat_pangkat, query, year) },
    { title: "Riwayat Gaji Pokok", description: "Perubahan gaji pokok.", columns: gajiColumns, data: filterHistoryRows(pegawai.riwayat_gaji_pokok, query, year) },
    { title: "Riwayat SKP", description: "Nilai SKP tahunan.", columns: skpColumns, data: filterHistoryRows(pegawai.riwayat_skp, query, year) },
    { title: "Riwayat Penghargaan", description: "Penghargaan pegawai.", columns: penghargaanColumns, data: filterHistoryRows(pegawai.riwayat_penghargaan, query, year) },
    { title: "Riwayat Hukuman Disiplin", description: "Catatan disiplin bila ada.", columns: hukumanColumns, data: filterHistoryRows(pegawai.riwayat_hukuman_disiplin, query, year) },
    { title: "Prestasi Pendidikan", description: "Prestasi terkait pendidikan.", columns: prestasiColumns, data: filterHistoryRows(pegawai.riwayat_prestasi_pendidikan, query, year) },
    { title: "Pengalaman Narasumber", description: "Kegiatan sebagai narasumber.", columns: narasumberColumns, data: filterHistoryRows(pegawai.riwayat_narasumber, query, year) },
    { title: "Kegiatan Strategis", description: "Kegiatan strategis dan anggaran.", columns: kegiatanStrategisColumns, data: filterHistoryRows(pegawai.riwayat_kegiatan_strategis, query, year) },
    { title: "Keberhasilan", description: "Capaian kerja penting.", columns: keberhasilanColumns, data: filterHistoryRows(pegawai.riwayat_keberhasilan, query, year) }
  ];
}

export default function DetailPegawaiPage() {
  const routeParams = useParams();
  const pegawaiId = routeParams?.id;
  const [pegawai, setPegawai] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const [historyActivated, setHistoryActivated] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyYear, setHistoryYear] = useState("");
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfExportRef = useRef(null);

  useEffect(() => {
    if (!pegawaiId) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    async function loadPegawai() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/pegawai/${pegawaiId}`, { cache: "no-store", signal: controller.signal });
        const payload = await readApiPayload(response);
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Data pegawai tidak dapat dimuat.");
        }
        if (!cancelled) setPegawai(payload.data);
      } catch (loadError) {
        if (!cancelled) {
          setPegawai(null);
          setError(loadError.name === "AbortError" ? "Memuat detail pegawai terlalu lama. Silakan muat ulang halaman." : (loadError.message || "Terjadi kesalahan saat memuat data pegawai."));
        }
      } finally {
        if (!cancelled) setLoading(false);
        clearTimeout(timeout);
      }
    }

    loadPegawai();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [pegawaiId, refreshKey]);

  function changeTab(tabId) {
    setActiveTab(tabId);
    if (tabId === "history") setHistoryActivated(true);
  }

  const computed = useMemo(() => {
    if (!pegawai) return null;
    const riwayatPendidikan = Array.isArray(pegawai.riwayat_pendidikan) ? pegawai.riwayat_pendidikan : [];
    const latestRiwayatPangkat = Array.isArray(pegawai.riwayat_pangkat) && pegawai.riwayat_pangkat.length ? pegawai.riwayat_pangkat[0] : null;
    const historyRows = [
      ...riwayatPendidikan,
      ...(pegawai.riwayat_jabatan || []),
      ...(pegawai.riwayat_plt_plh || []),
      ...(pegawai.riwayat_gaji_pokok || []),
      ...(pegawai.riwayat_pangkat || []),
      ...(pegawai.riwayat_penghargaan || []),
      ...(pegawai.riwayat_skp || []),
      ...(pegawai.riwayat_hukuman_disiplin || []),
      ...(pegawai.riwayat_prestasi_pendidikan || []),
      ...(pegawai.riwayat_narasumber || []),
      ...(pegawai.riwayat_kegiatan_strategis || []),
      ...(pegawai.riwayat_keberhasilan || [])
    ];

    return {
      nama: fullNameWithTitle(pegawai),
      tempatTanggalLahir: relationText([pegawai.tempat_lahir, formatDate(pegawai.tanggal_lahir)]),
      umur: durationFrom(pegawai.tanggal_lahir),
      masaKerja: durationFrom(pegawai.tmt_kerja_ukpd),
      tmtKerja: relationText([formatDate(pegawai.tmt_kerja_ukpd), durationFrom(pegawai.tmt_kerja_ukpd)]),
      jabatan: pegawai.nama_jabatan_menpan || pegawai.nama_jabatan_orb || "-",
      tmtPangkatTerbaru: latestRiwayatPangkat?.tmt_pangkat || pegawai.tmt_pangkat_terakhir || null,
      keluargaRows: buildKeluargaRows(pegawai),
      riwayatPendidikanFormal: riwayatPendidikan.filter((item) => normalizeJenisRiwayat(item.jenis_riwayat) === "formal"),
      riwayatPendidikanNonFormal: riwayatPendidikan.filter((item) => normalizeJenisRiwayat(item.jenis_riwayat) === "non_formal"),
      totalRiwayat: historyRows.length,
      historyYears: [...new Set(historyRows.map(getHistoryYear).filter(Boolean))].sort((a, b) => Number(b) - Number(a))
    };
  }, [pegawai]);

  const visibleHistory = useMemo(() => {
    if (!pegawai || !computed || !historyActivated) return [];
    return historyConfig(pegawai, computed, historyQuery, historyYear).filter((section) => section.data?.length);
  }, [computed, historyActivated, historyQuery, historyYear, pegawai]);

  async function previewPdfProfile() {
    if (pdfBusy || !pegawai) return;
    setPdfBusy(true);
    try {
      const name = filenamePart(fullNameWithTitle(pegawai) || pegawai.nama || pegawai.nip);
      await previewProfilePdf(pdfExportRef.current, `profil-pegawai-${name}.pdf`);
    } catch (pdfError) {
      window.alert(pdfError?.message || "Preview PDF profil pegawai belum berhasil dibuat.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-500">Memuat detail pegawai...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => setRefreshKey((value) => value + 1)} />;
  }

  if (!pegawai || !computed) return <EmptyTabState />;

  return (
    <>
      <div className="space-y-3 print:hidden">
        <ProfileSummary pegawai={pegawai} computed={computed} onDownloadPdf={previewPdfProfile} pdfBusy={pdfBusy} onOpenPhoto={() => setPhotoPreviewOpen(true)} />
        <TabsNavigation activeTab={activeTab} onChange={changeTab} />

        <div>
        <main className="space-y-3">
          {activeTab === "overview" ? (
            <SectionCard id="summary" title="Profil Pegawai" description="Data inti pegawai dalam satu tampilan.">
              <InfoGrid
                columns="lg:grid-cols-4 2xl:grid-cols-6"
                items={[
                  { label: "Jabatan", value: computed.jabatan },
                  { label: "UKPD", value: pegawai.nama_ukpd },
                  { label: "Total Riwayat", value: formatNumber(computed.totalRiwayat) },
                  { label: "NRK", value: pegawai.nrk },
                  { label: "NIP", value: pegawai.nip },
                  { label: "Jenis Kelamin", value: pegawai.jenis_kelamin },
                  { label: "Tempat / Tanggal Lahir", value: computed.tempatTanggalLahir },
                  { label: "Umur", value: computed.umur },
                  { label: "Agama", value: pegawai.agama },
                  { label: "Email", value: pegawai.email, type: "email" },
                  { label: "No. HP", value: pegawai.no_hp_pegawai, type: "phone" },
                  { label: "Wilayah", value: pegawai.wilayah }
                ]}
              />
            </SectionCard>
          ) : null}

          {activeTab === "employment" ? (
            <>
              <SectionCard id="employment-status" title="Status Kepegawaian" description="Status kerja dan masa kerja.">
                <InfoGrid
                  items={[
                    { label: "Jenis Pegawai", value: pegawai.jenis_pegawai },
                    { label: "Kondisi", value: pegawai.kondisi },
                    { label: "Tanggal Efektif Kondisi", value: formatDate(pegawai.tanggal_kondisi) },
                    { label: "Jenis Kontrak", value: pegawai.jenis_kontrak },
                    { label: "TMT Kerja UKPD", value: computed.tmtKerja },
                    { label: "UKPD", value: pegawai.nama_ukpd },
                    { label: "Wilayah", value: pegawai.wilayah }
                  ]}
                />
              </SectionCard>

              <SectionCard id="employment-position" title="Jabatan & Pangkat" description="Posisi aktif dan pangkat terakhir.">
                <InfoGrid
                  items={[
                    { label: "Jabatan Pergub 1 Tahun 2017", value: pegawai.nama_jabatan_orb },
                    { label: "Jabatan Kepmenpan 11", value: pegawai.nama_jabatan_menpan },
                    { label: "Status Rumpun", value: pegawai.status_rumpun },
                    { label: "Atasan Langsung", value: pegawai.struktur_atasan_langsung },
                    { label: "Pangkat / Golongan", value: formatPangkatGolongan(pegawai.pangkat_golongan) },
                    { label: "TMT Pangkat", value: formatDate(computed.tmtPangkatTerbaru) }
                  ]}
                />
              </SectionCard>

              <SectionCard id="employment-education" title="Pendidikan Terakhir" description="Informasi pendidikan yang melekat pada profil aktif.">
                <InfoGrid
                  items={[
                    { label: "Jenjang", value: pegawai.jenjang_pendidikan },
                    { label: "Program Studi", value: pegawai.program_studi },
                    { label: "Universitas / Institusi", value: pegawai.nama_universitas }
                  ]}
                />
              </SectionCard>
            </>
          ) : null}

          {activeTab === "contact" ? (
            <>
              <SectionCard id="contact-main" title="Kontak" description="Email dan nomor yang dapat dihubungi.">
                <InfoGrid
                  items={[
                    { label: "Email", value: pegawai.email, type: "email" },
                    { label: "No. HP", value: pegawai.no_hp_pegawai, type: "phone" },
                    { label: "No. BPJS", value: pegawai.no_bpjs }
                  ]}
                />
              </SectionCard>
              <SectionCard id="address-main" title="Alamat" description="Alamat KTP dan domisili yang tercatat.">
                <InfoGrid
                  columns="lg:grid-cols-2"
                  items={[
                    { label: "Alamat KTP", value: pegawai.alamat_ktp },
                    { label: "Alamat Domisili", value: pegawai.alamat_domisili }
                  ]}
                />
              </SectionCard>
            </>
          ) : null}

          {activeTab === "family" ? (
            <SectionCard id="family-main" title="Keluarga" description="Anggota keluarga yang tercatat pada profil pegawai.">
              {computed.keluargaRows.length ? <CompactListTable columns={keluargaColumns} data={computed.keluargaRows} /> : <EmptyTabState />}
            </SectionCard>
          ) : null}

          {activeTab === "history" ? (
            <section className="space-y-4" id="history-list">
              <div id="history-filter" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
                    <input
                      className="input pl-10"
                      value={historyQuery}
                      onChange={(event) => setHistoryQuery(event.target.value)}
                      placeholder="Cari riwayat jabatan, pendidikan, SK, penghargaan..."
                    />
                  </label>
                  <select className="input" value={historyYear} onChange={(event) => setHistoryYear(event.target.value)}>
                    <option value="">Semua tahun</option>
                    {computed.historyYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>

              {visibleHistory.length ? (
                visibleHistory.map((section) => (
                  <HistoryAccordion
                    key={section.title}
                    title={section.title}
                    description={section.description}
                    columns={section.columns}
                    data={section.data}
                  />
                ))
              ) : (
                <EmptyTabState />
              )}
            </section>
          ) : null}
        </main>
      </div>
      </div>
      <PhotoPreviewModal pegawai={pegawai} open={photoPreviewOpen} onClose={() => setPhotoPreviewOpen(false)} />
      <div ref={pdfExportRef} className="pdf-export-root" aria-hidden="true">
        <PrintProfileDocument pegawai={pegawai} computed={computed} />
      </div>
    </>
  );
}
