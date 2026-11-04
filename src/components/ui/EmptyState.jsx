import { Inbox } from "lucide-react";

export default function EmptyState({ title = "Data belum tersedia", description = "Belum ada data yang sesuai dengan filter saat ini." }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <Inbox className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
      <h2 className="mt-4 text-base font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </section>
  );
}
