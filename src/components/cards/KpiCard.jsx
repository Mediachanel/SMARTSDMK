export default function KpiCard({ title, value, percentage, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "bg-dinkes-50 text-dinkes-800",
    gold: "bg-govgold-100 text-govgold-700",
    green: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700"
  };

  return (
    <article className="surface min-h-[58px] min-w-[112px] snap-start p-2 transition hover:border-dinkes-200 sm:min-h-[86px] sm:min-w-0 sm:p-3">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="truncate text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-500 sm:line-clamp-2 sm:text-xs sm:leading-4">{title}</p>
          <strong className="mt-0.5 block font-display text-base font-extrabold tabular-nums text-slate-950 sm:mt-1 sm:text-2xl">{value}</strong>
          {percentage ? (
            <span className="mt-1 hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 sm:inline-flex">
              {percentage} dari total
            </span>
          ) : null}
        </div>
        {Icon ? (
          <span className={`hidden rounded-lg p-2 sm:inline-flex ${tones[tone]}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </article>
  );
}
