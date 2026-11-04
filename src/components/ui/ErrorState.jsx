import { AlertCircle, RefreshCw } from "lucide-react";

export default function ErrorState({
  title = "Data belum berhasil dimuat",
  description = "Terjadi kendala saat mengambil data. Silakan coba lagi.",
  actionLabel = "Coba lagi",
  onRetry
}) {
  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-rose-800" role="alert">
      <AlertCircle className="mx-auto h-10 w-10 text-rose-600" aria-hidden="true" />
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-rose-700">{description}</p>
      {onRetry ? (
        <button className="btn-secondary mt-4 border-rose-200 text-rose-700 hover:bg-white" type="button" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
