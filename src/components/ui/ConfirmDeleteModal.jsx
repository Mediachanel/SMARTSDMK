"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export default function ConfirmDeleteModal({
  open,
  title,
  description,
  onCancel,
  onConfirm,
  loading,
  confirmLabel = "Hapus",
  cancelLabel = "Batal",
  loadingLabel,
  tone = "danger"
}) {
  const dialogRef = useRef(null);
  const previousActiveElementRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const isDanger = tone === "danger";
  const Icon = isDanger ? AlertTriangle : CheckCircle2;
  const iconClassName = isDanger ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600";
  const confirmClassName = isDanger
    ? "inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 focus-ring disabled:opacity-60"
    : "btn-primary disabled:opacity-60";

  useEffect(() => {
    if (!open) return undefined;

    previousActiveElementRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => {
      const target = dialogRef.current?.querySelector("[data-autofocus]") || dialogRef.current?.querySelector(focusableSelector);
      target?.focus();
    }, 0);

    function handleKeyDown(event) {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onCancel?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(focusableSelector) || []);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElementRef.current?.focus?.();
    };
  }, [loading, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid items-end bg-slate-950/40 px-3 pb-3 sm:place-items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel?.();
      }}
    >
      <article
        ref={dialogRef}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`rounded-lg p-2 ${iconClassName}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <button type="button" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 focus-ring disabled:opacity-50" onClick={onCancel} aria-label="Tutup modal" disabled={loading}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <p id={descriptionId} className="mt-4 text-sm leading-6 text-slate-600">{description}</p>
        <footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={loading} data-autofocus>{cancelLabel}</button>
          <button type="button" className={confirmClassName} onClick={onConfirm} disabled={loading}>
            {loading ? (loadingLabel || `${confirmLabel}...`) : confirmLabel}
          </button>
        </footer>
      </article>
    </div>
  );
}
