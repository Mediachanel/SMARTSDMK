import Link from "next/link";

export default function PageHeader({ title, description, breadcrumbs = [], action, compact = false, showBreadcrumb = true }) {
  return (
    <header className={`${compact ? "mb-0 gap-2 pb-2" : "mb-4 gap-3 pb-3"} flex flex-col border-b border-slate-200 lg:flex-row lg:items-end lg:justify-between`}>
      <div>
        {showBreadcrumb ? <nav className={`${compact ? "mb-0.5" : "mb-1.5"} text-sm font-medium text-slate-500`} aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link className="text-dinkes-800 hover:text-dinkes-700" href="/dashboard">Beranda</Link></li>
            {breadcrumbs.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className="text-slate-300">/</span>
                {item.href ? <Link className="hover:text-dinkes-700" href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
              </li>
            ))}
          </ol>
        </nav> : null}
        <h1 className={`app-heading text-xl ${compact ? "" : "sm:text-2xl"}`}>{title}</h1>
        {description ? <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-slate-600 sm:block">{description}</p> : null}
      </div>
      {action ? <div className="w-full lg:w-auto">{action}</div> : null}
    </header>
  );
}
