export default function ProfileSectionCard({ title, items = [] }) {
  return (
    <article className="surface p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{item.value || "-"}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
