"use client";

export default function FormSection({ title, description, children, tone = "default" }) {
  const toneClass = tone === "soft"
    ? "border-dinkes-100 bg-dinkes-50/35"
    : "border-slate-200 bg-white";

  return (
    <section className={`surface border ${toneClass} p-4 sm:p-5 lg:p-6`}>
      <div className="mb-5 flex flex-col gap-2 border-b border-slate-200 pb-4">
        <h3 className="font-display text-lg font-bold text-dinkes-900">{title}</h3>
        {description ? <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
