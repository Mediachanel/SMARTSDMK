"use client";

import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { filterDesktopMenuByRole } from "@/data/menu/sidebarMenu";
import SidebarItem from "@/components/layout/SidebarItem";
import dinkesLogo from "@/Foto/Dinkes.png";

function getInitials(user) {
  const text = String(user?.nama_ukpd || user?.username || "SI").trim();
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function Sidebar({ user, collapsed, onToggle }) {
  const menu = filterDesktopMenuByRole(user?.role);

  return (
    <aside
      className={`hidden bg-dinkes-800 text-white transition-[width] duration-200 print:hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:flex-col ${collapsed ? "lg:w-16" : "lg:w-[260px]"}`}
    >
      <header
        className={`flex min-h-24 items-center gap-3 px-4 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}
      >
        <span
          className={`grid shrink-0 place-items-center overflow-hidden p-1 ${collapsed ? "h-11 w-11" : "h-14 w-14"}`}
        >
          <Image
            src={dinkesLogo}
            alt="Logo Dinas Kesehatan DKI Jakarta"
            className="h-full w-full object-contain"
            priority
          />
        </span>
        {!collapsed ? (
          <div className="hidden min-w-0 lg:block">
            <p className="font-display text-xl font-extrabold leading-tight text-govgold-300">
              SMART SDMK
            </p>
            <p className="truncate text-[11px] font-semibold tracking-wide text-white/75">
              Dinas Kesehatan DKI Jakarta
            </p>
          </div>
        ) : null}
      </header>
      <section
        className={`mx-3 flex items-center gap-3 border-y border-white/10 py-3 ${collapsed ? "lg:justify-center lg:px-0" : "px-1"}`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/12 text-[11px] font-bold text-white ring-1 ring-white/20">
          {getInitials(user)}
        </span>
        {!collapsed ? (
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-xs font-semibold uppercase text-white">
              {user?.nama_ukpd || user?.username || "Pengguna"}
            </p>
            <p className="truncate text-[11px] text-white/60">
              {user?.role || "-"}
            </p>
          </div>
        ) : null}
      </section>
      <nav
        className="flex-1 space-y-1 overflow-y-auto px-0 py-4"
        aria-label="Menu utama"
      >
        {menu.map((item) => (
          <SidebarItem key={item.label} item={item} collapsed={collapsed} />
        ))}
      </nav>
      <footer className="hidden border-t border-white/10 p-4 lg:block">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-2 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white focus-ring"
          onClick={onToggle}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
          {!collapsed ? "Sembunyikan" : null}
        </button>
      </footer>
    </aside>
  );
}
