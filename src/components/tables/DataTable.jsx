import EmptyState from "@/components/ui/EmptyState";

export default function DataTable({ columns, data, rowKey = "id", actions, actionWidth = 260, fitToWidth = false, compact = false, fillHeight = false, startNumber = 1, showNumber = false }) {
  if (!data?.length) return <EmptyState />;

  const numberWidth = 64;
  const columnWidths = columns.map((column, index) => column.width || (index === 0 ? 220 : 170));
  const firstColumnLeft = showNumber ? numberWidth : 0;
  const tableMinWidth = columnWidths.reduce((total, width) => total + width, 0)
    + (showNumber ? numberWidth : 0)
    + (actions ? actionWidth : 0);

  return (
    <section className={`min-w-0 space-y-3 md:space-y-0 ${fillHeight ? "md:flex md:min-h-0 md:flex-1 md:flex-col" : ""}`}>
      <div className="grid gap-3 md:hidden">
        {data.map((item, index) => (
          <article key={item[rowKey]} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {showNumber ? <p className="mb-1 text-xs font-semibold text-slate-400">#{startNumber + index}</p> : null}
                <h3 className="truncate text-base font-bold text-dinkes-navy">
                  {columns[0]?.render ? columns[0].render(item, index) : item[columns[0]?.key]}
                </h3>
              </div>
              {actions ? <div className="shrink-0">{actions(item)}</div> : null}
            </div>
            <dl className="mt-3 grid gap-2 text-sm">
              {columns.slice(1).map((column) => (
                <div key={column.key} className="grid grid-cols-[104px_1fr] gap-3 border-t border-slate-100 pt-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-dinkes-slate">{column.header}</dt>
                  <dd className="min-w-0 text-right font-medium text-slate-700">
                    <div className={column.wrap ? "break-words leading-5" : "truncate"}>
                      {column.render ? column.render(item, index) : (item[column.key] || "-")}
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <div className={`surface hidden w-full min-w-0 overflow-hidden md:block ${fillHeight ? "md:min-h-0 md:flex-1" : ""}`}>
        <div className={`${fitToWidth ? `w-full min-w-0 ${fillHeight ? "overflow-auto" : "overflow-hidden"}` : "table-scroll w-full min-w-0"} ${fillHeight ? "md:h-full md:min-h-0" : ""}`}>
          <table
            className={`w-full table-fixed border-collapse ${fitToWidth ? "" : "min-w-[var(--table-min-width)]"}`}
            style={fitToWidth ? undefined : { "--table-min-width": `${tableMinWidth}px` }}
          >
            <colgroup>
              {showNumber ? <col style={{ width: numberWidth }} /> : null}
              {columnWidths.map((width, index) => <col key={columns[index].key} style={{ width }} />)}
              {actions ? <col style={{ width: actionWidth }} /> : null}
            </colgroup>
            <thead>
              <tr>
                  {showNumber ? <th className={`table-th sticky left-0 z-30 border-r border-slate-200 bg-[#f3f4f6] text-center ${compact ? "px-2" : ""}`} scope="col">No</th> : null}
                {columns.map((column, index) => (
                  <th
                    key={column.key}
                    className={`table-th ${compact ? "px-2" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : ""} ${index === 0 ? "sticky z-30 border-r border-slate-200 bg-[#f3f4f6] shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]" : ""}`}
                    style={index === 0 ? { left: firstColumnLeft } : undefined}
                    scope="col"
                  >
                    <span className="block truncate" title={typeof column.header === "string" ? column.header : undefined}>{column.header}</span>
                  </th>
                ))}
                {actions ? <th className={`table-th sticky right-0 z-20 bg-[#f3f4f6] text-center ${compact ? "px-2" : ""}`} scope="col">Aksi</th> : null}
              </tr>
            </thead>
            <tbody className="bg-white">
              {data.map((item, index) => (
                <tr key={item[rowKey]} className="group odd:bg-white even:bg-slate-50/45 hover:bg-dinkes-50/70">
                  {showNumber ? <td className={`table-td sticky left-0 z-20 border-r border-slate-100 bg-white text-center group-hover:bg-dinkes-50/70 ${compact ? "px-2" : ""}`}>{startNumber + index}</td> : null}
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column.key}
                      className={`table-td ${compact ? "px-2" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : ""} ${columnIndex === 0 ? "sticky z-20 border-r border-slate-100 bg-white font-medium text-slate-900 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)] group-hover:bg-dinkes-50/70" : ""}`}
                      style={columnIndex === 0 ? { left: firstColumnLeft } : undefined}
                    >
                      <div className={column.wrap ? "whitespace-normal break-words leading-5" : "min-w-0 truncate"} title={!column.wrap && typeof item[column.key] === "string" ? item[column.key] : undefined}>
                        {column.render ? column.render(item, index) : item[column.key]}
                      </div>
                    </td>
                  ))}
                  {actions ? <td className={`table-td sticky right-0 z-10 bg-inherit text-center group-hover:bg-dinkes-50/70 ${compact ? "px-2" : ""}`}>{actions(item)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
