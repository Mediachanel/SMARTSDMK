export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f4ee] px-6 text-center">
      <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">404</p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">Halaman tidak ditemukan</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Halaman yang Anda buka tidak tersedia atau sedang dipindahkan. Kembali ke login atau dashboard untuk melanjutkan.
        </p>
      </div>
    </main>
  );
}
