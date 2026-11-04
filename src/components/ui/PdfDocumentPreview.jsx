"use client";

import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";

export default function PdfDocumentPreview({ url, title = "Dokumen PDF" }) {
  const [status, setStatus] = useState("loading");
  const viewerUrl = useMemo(() => {
    if (!url) return "";
    return `${url}#toolbar=0&navpanes=0&view=FitH`;
  }, [url]);

  return (
    <div className="relative h-full min-h-80 overflow-hidden rounded-lg bg-slate-200">
      {status === "loading" ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-800/90 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Memuat dokumen…
          </div>
        </div>
      ) : null}
      <iframe
        className="h-full min-h-80 w-full border-0 bg-white"
        onLoad={() => setStatus("ready")}
        src={viewerUrl}
        title={title}
      />
      <a
        className="absolute bottom-3 right-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white"
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        Buka penuh
      </a>
    </div>
  );
}
