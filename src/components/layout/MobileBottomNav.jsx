"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { filterMobileBottomMenuByRole } from "@/data/menu/sidebarMenu";

export default function MobileBottomNav({ user }) {
  const pathname = usePathname();
  const menu = filterMobileBottomMenuByRole(user?.role);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden print:hidden" aria-label="Navigasi bawah">
      <div className="grid grid-cols-5 gap-1">
        {menu.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-[11px] font-semibold transition focus-ring ${active ? "border-dinkes-100 bg-dinkes-50 text-dinkes-800" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
