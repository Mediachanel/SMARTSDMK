"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  LogOut,
  Loader2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";

function primaryPosition(item) {
  return (
    item.nama_jabatan_menpan || item.nama_jabatan_orb || item.jabatan || "-"
  );
}

function getInitials(user) {
  const text = String(user?.nama_ukpd || user?.username || "SI").trim();
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatToday() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function breadcrumbFromPath(pathname) {
  const segments = String(pathname || "/dashboard")
    .split("/")
    .filter(Boolean);
  const last = segments[segments.length - 1] || "dashboard";
  return last
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function Topbar({
  user,
  onOpenMenu,
  collapsed,
  onToggleSidebar,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef(null);
  const mobileSearchRef = useRef(null);
  const accountRef = useRef(null);
  const trimmedQuery = query.trim();
  const resultListId = "topbar-search-results";

  useEffect(() => {
    function handlePointerDown(event) {
      const insideDesktopSearch = searchRef.current?.contains(event.target);
      const insideMobileSearch = mobileSearchRef.current?.contains(
        event.target,
      );
      if (!insideDesktopSearch && !insideMobileSearch) setOpen(false);
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setErrorMessage("");
      setActiveIndex(-1);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setErrorMessage("");
      fetch(`/api/pegawai?q=${encodeURIComponent(trimmedQuery)}&pageSize=6`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((payload) => {
          if (!payload?.success)
            throw new Error(payload?.message || "Pencarian gagal dimuat.");
          setResults(payload.data?.rows || []);
          setOpen(true);
          setActiveIndex(-1);
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          setResults([]);
          setErrorMessage(error.message || "Pencarian gagal dimuat.");
          setOpen(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  function closeSearch() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setErrorMessage("");
    closeSearch();
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (!open || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(results.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter") {
      const target = results[activeIndex >= 0 ? activeIndex : 0];
      if (target?.id_pegawai) {
        closeSearch();
        router.push(`/pegawai/${target.id_pegawai}`);
      }
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace(user?.role === "CPNS" ? "/usulan_cpns_to_pns" : "/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-5 lg:justify-between">
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-dinkes-800 hover:bg-slate-100 focus-ring lg:hidden"
          onClick={onOpenMenu}
          aria-label="Buka menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <button
            className="hidden rounded-lg border border-slate-200 bg-white p-2.5 text-dinkes-800 hover:bg-slate-100 focus-ring lg:inline-flex"
            onClick={onToggleSidebar}
            aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
          <nav
            className="hidden min-w-0 items-center gap-2 text-sm font-medium lg:flex"
            aria-label="Breadcrumb"
          >
            <Link
              className="text-dinkes-800 hover:text-dinkes-700"
              href="/dashboard"
            >
              Beranda
            </Link>
            <span className="text-slate-300">/</span>
            <span className="truncate text-slate-600">
              {breadcrumbFromPath(pathname)}
            </span>
          </nav>
          <div
            className="relative ml-auto hidden min-w-0 w-full max-w-xl lg:block"
            ref={searchRef}
          >
            <label className="sr-only" htmlFor="topbar-search-input">
              Pencarian cepat
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="topbar-search-input"
              className="input h-10 rounded-full border-slate-300 bg-slate-50 py-2 pl-9 pr-10"
              placeholder="Cari data pegawai atau UKPD..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                if (trimmedQuery.length >= 2) setOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              aria-autocomplete="list"
              aria-controls={resultListId}
              aria-expanded={open}
              aria-activedescendant={
                activeIndex >= 0
                  ? `${resultListId}-${results[activeIndex]?.id_pegawai}`
                  : undefined
              }
            />
            {loading ? (
              <Loader2
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
                aria-hidden="true"
              />
            ) : query ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-ring"
                onClick={clearSearch}
                aria-label="Bersihkan pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            {open && trimmedQuery.length >= 2 ? (
              <div
                id={resultListId}
                className="absolute left-0 top-full mt-2 w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft"
                role="listbox"
              >
                {errorMessage ? (
                  <div className="px-4 py-3 text-sm text-rose-700">
                    {errorMessage}
                  </div>
                ) : results.length ? (
                  <div className="max-h-80 overflow-y-auto py-2">
                    {results.map((item, index) => {
                      const active = index === activeIndex;
                      return (
                        <Link
                          key={item.id_pegawai}
                          id={`${resultListId}-${item.id_pegawai}`}
                          href={`/pegawai/${item.id_pegawai}`}
                          className={`block px-4 py-3 text-sm transition ${active ? "bg-dinkes-50 text-dinkes-900" : "text-slate-700 hover:bg-slate-50"}`}
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={closeSearch}
                        >
                          <span className="block font-semibold text-slate-950">
                            {item.nama || "-"}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {item.nip || "Tanpa NIP"} | {primaryPosition(item)}{" "}
                            | {item.nama_ukpd || "-"}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : loading ? (
                  <div className="px-4 py-3 text-sm text-slate-500">
                    Memuat hasil pencarian...
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-slate-500">
                    Data tidak ditemukan.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className="relative min-w-0 flex-1 lg:hidden"
          ref={mobileSearchRef}
        >
          <label className="sr-only" htmlFor="mobile-topbar-search-input">
            Pencarian cepat
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="mobile-topbar-search-input"
            className="input h-10 rounded-full border-slate-300 bg-slate-50 py-2 pl-9 pr-8 text-sm"
            placeholder="Cari pegawai..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (trimmedQuery.length >= 2) setOpen(true);
            }}
            onKeyDown={handleSearchKeyDown}
            aria-autocomplete="list"
            aria-controls={`${resultListId}-mobile`}
            aria-expanded={open}
          />
          {query ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-ring"
              onClick={clearSearch}
              aria-label="Bersihkan pencarian"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          {open && trimmedQuery.length >= 2 ? (
            <div
              id={`${resultListId}-mobile`}
              className="absolute inset-x-0 top-full mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-soft"
              role="listbox"
            >
              {errorMessage ? (
                <div className="px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </div>
              ) : results.length ? (
                results.map((item, index) => {
                  const active = index === activeIndex;
                  return (
                    <Link
                      key={item.id_pegawai}
                      href={`/pegawai/${item.id_pegawai}`}
                      className={`block px-4 py-3 text-sm transition ${active ? "bg-dinkes-50 text-dinkes-900" : "text-slate-700 hover:bg-slate-50"}`}
                      role="option"
                      aria-selected={active}
                      onClick={closeSearch}
                    >
                      <span className="block font-semibold text-slate-950">
                        {item.nama || "-"}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {item.nip || "Tanpa NIP"} | {primaryPosition(item)} |{" "}
                        {item.nama_ukpd || "-"}
                      </span>
                    </Link>
                  );
                })
              ) : loading ? (
                <div className="px-4 py-3 text-sm text-slate-500">
                  Memuat hasil pencarian...
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500">
                  Data tidak ditemukan.
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:gap-4">
          <span className="hidden text-sm font-medium text-slate-500 lg:inline">
            {formatToday()}
          </span>
          <span
            className="hidden h-8 w-px bg-[#e5e7eb] lg:block"
            aria-hidden="true"
          />
          <button
            className="relative hidden rounded-full p-2 text-slate-700 hover:bg-slate-100 focus-ring sm:inline-flex"
            type="button"
            aria-label="Notifikasi"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-600" />
          </button>
          <Link
            className="hidden rounded-full p-2 text-slate-700 hover:bg-slate-100 focus-ring sm:inline-flex"
            href="/profil"
            aria-label="Pengaturan"
          >
            <Settings className="h-5 w-5" />
          </Link>
          <span
            className="hidden h-8 w-px bg-[#e5e7eb] lg:block"
            aria-hidden="true"
          />
          <div className="hidden min-w-0 max-w-40 text-right lg:block xl:max-w-56">
            <p className="truncate text-sm font-bold leading-tight text-slate-900">
              {user?.username || "Admin Dinas"}
            </p>
            <p className="truncate text-xs font-medium uppercase text-slate-500">
              {user?.role || "Dinas Kesehatan"}
            </p>
          </div>
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full bg-dinkes-800 text-sm font-bold text-white ring-2 ring-white focus-ring"
              onClick={() => setAccountOpen((value) => !value)}
              aria-label="Buka pengaturan pengguna"
              aria-expanded={accountOpen}
            >
              {getInitials(user)}
            </button>
            {accountOpen ? (
              <section className="absolute right-0 top-full mt-3 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
                <header className="bg-dinkes-800 px-5 py-4 text-white">
                  <p className="text-base font-semibold">Pengaturan</p>
                  <p className="mt-1 truncate text-xs font-medium text-white/80">
                    {user?.nama_ukpd || user?.username || "Pengguna"}
                  </p>
                </header>
                <div className="border-b border-slate-100 px-5 py-3">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {user?.nama_ukpd || user?.username || "Pengguna"}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {user?.role || "-"}
                  </p>
                </div>
                <Link
                  className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  href="/profil"
                  onClick={() => setAccountOpen(false)}
                >
                  <UserRound className="h-4 w-4" />
                  Pengaturan Akun
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Keluar
                </button>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
