"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

export default function SidebarItem({
  item,
  collapsed,
  onNavigate,
  drawer = false,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const Icon = item.icon;
  const active = item.href
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : item.children?.some((child) => pathname.startsWith(child.href));
  const [open, setOpen] = useState(Boolean(active));

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (item.children?.length) {
    return (
      <div>
        <button
          type="button"
          className={`flex min-h-11 w-full items-center border-l-4 text-left text-[13px] font-semibold leading-tight transition focus-ring ${drawer ? "gap-3 px-4 py-2.5" : "md:justify-center md:px-2 md:py-2.5 lg:justify-start"} ${collapsed ? "lg:justify-center lg:px-2 lg:py-2.5" : drawer ? "" : "lg:gap-3 lg:px-4 lg:py-2.5"} ${active ? "border-govgold-300 bg-dinkes-600 text-white" : "border-transparent text-white/78 hover:bg-white/10 hover:text-white"}`}
          title={collapsed ? item.label : undefined}
          aria-expanded={!collapsed && open}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed ? (
            <span
              className={`${drawer ? "block" : "hidden lg:block"} min-w-0 flex-1`}
            >
              {item.label}
            </span>
          ) : null}
          {!collapsed ? (
            <ChevronDown
              className={`${drawer ? "block" : "hidden lg:block"} h-4 w-4 transition ${open ? "rotate-180" : ""} ${active ? "text-white/80" : "text-white/55"}`}
              aria-hidden="true"
            />
          ) : null}
        </button>
        {!collapsed && open ? (
          <div
            className={`my-1 space-y-1 bg-white/10 py-2 pl-3 pr-2 ${drawer ? "block" : "hidden lg:block"}`}
          >
            {item.children.map((child) => (
              <SidebarItem
                key={child.href}
                item={child}
                collapsed={false}
                onNavigate={onNavigate}
                drawer={drawer}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed ? (
        <span className={drawer ? "" : "hidden lg:inline"}>{item.label}</span>
      ) : null}
    </>
  );

  if (item.action === "logout") {
    return (
      <button
        className={`flex min-h-11 w-full items-center border-l-4 border-transparent text-left text-[13px] font-medium leading-tight text-white/78 transition hover:bg-white/10 hover:text-white focus-ring ${drawer ? "gap-3 px-4 py-2.5" : "md:justify-center md:px-2 md:py-2.5 lg:justify-start"} ${collapsed ? "lg:justify-center lg:px-2 lg:py-2.5" : drawer ? "" : "lg:gap-3 lg:px-4 lg:py-2.5"}`}
        type="button"
        title={collapsed ? item.label : undefined}
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace(
            pathname.startsWith("/usulan/cpns-pns")
              ? "/usulan_cpns_to_pns"
              : "/login",
          );
          router.refresh();
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      onClick={onNavigate}
      href={item.href}
      target={item.newTab ? "_blank" : undefined}
      rel={item.newTab ? "noreferrer" : undefined}
      title={collapsed ? item.label : undefined}
      className={`flex min-h-11 items-center border-l-4 text-[13px] font-medium leading-tight transition focus-ring ${drawer ? "gap-3 px-4 py-2.5" : "md:justify-center md:px-2 md:py-2.5 lg:justify-start"} ${collapsed ? "lg:justify-center lg:px-2 lg:py-2.5" : drawer ? "" : "lg:gap-3 lg:px-4 lg:py-2.5"} ${active ? "border-govgold-300 bg-dinkes-600 text-white" : "border-transparent text-white/78 hover:bg-white/10 hover:text-white"}`}
    >
      {content}
    </Link>
  );
}
