"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BellRing, ClipboardCheck, KeyRound, Loader2, LogOut, Megaphone, ShieldCheck, X } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import MobileSidebar from "@/components/layout/MobileSidebar";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import AppFooter from "@/components/layout/AppFooter";
import { PASSWORD_POLICY_TEXT } from "@/lib/auth/passwordPolicy";

const EMPTY_PASSWORD_FORM = { currentPassword: "", newPassword: "", confirmPassword: "" };

function MandatoryPasswordModal({ rotation, onChanged, onLogout }) {
  const [form, setForm] = useState(EMPTY_PASSWORD_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        const details = Array.isArray(payload.errors) ? ` ${payload.errors.join(" ")}` : "";
        throw new Error(`${payload.message || "Password belum dapat diubah."}${details}`);
      }
      setForm(EMPTY_PASSWORD_FORM);
      onChanged();
    } catch (submitError) {
      setError(submitError.message || "Password belum dapat diubah.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[220] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm print:hidden" role="dialog" aria-modal="true" aria-labelledby="password-rotation-title">
      <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/30 bg-white shadow-[0_28px_80px_rgba(2,16,43,0.45)]">
        <header className="relative overflow-hidden bg-gradient-to-br from-[#082f49] via-[#0b4a7f] to-[#1263b8] px-6 pb-7 pt-6 text-white">
          <div className="absolute -right-12 -top-14 h-44 w-44 rounded-full bg-cyan-300/15" />
          <div className="absolute -bottom-16 left-20 h-32 w-32 rounded-full bg-blue-200/10" />
          <div className="relative flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/30"><ShieldCheck className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-100">Keamanan SMART SDMK</p>
              <h2 id="password-rotation-title" className="mt-1 text-xl font-extrabold text-white">Wajib Ganti Password</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-white">
                {rotation?.reason === "PASSWORD_EXPIRED" ? "Password Anda telah melewati masa berlaku tiga bulan." : "Akun ini belum pernah mengganti password default."} Silakan buat password baru untuk melanjutkan.
              </p>
            </div>
          </div>
        </header>
        <form className="grid gap-4 bg-white p-6" onSubmit={submit}>
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><KeyRound className="h-4 w-4 text-blue-600" />Ketentuan Password Baru</div>
          <ul className="grid gap-1.5 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs font-medium leading-5 text-slate-700">
            {PASSWORD_POLICY_TEXT.map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <label className="grid gap-2"><span className="label">Password Lama</span><input className="input" required type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))} /></label>
          <label className="grid gap-2"><span className="label">Password Baru</span><input className="input" required type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))} /></label>
          <label className="grid gap-2"><span className="label">Konfirmasi Password Baru</span><input className="input" required type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
          {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{error}</p> : null}
          <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-100 pt-4">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Simpan Password Baru</button>
            <button type="button" className="btn-secondary" onClick={onLogout}><LogOut className="h-4 w-4" />Keluar</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function AppShell({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showPetaAnnouncement, setShowPetaAnnouncement] = useState(true);
  const [showCpnsVerificationNotice, setShowCpnsVerificationNotice] = useState(false);
  const loggedOutRef = useRef(false);

  async function logout({ redirect = true, keepalive = false } = {}) {
    if (loggedOutRef.current) return;
    loggedOutRef.current = true;
    window.sessionStorage.removeItem("cpns-verification-login-notice");

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        keepalive,
      });
    } catch {}

    if (redirect) {
      router.replace(user?.role === "CPNS" ? "/usulan_cpns_to_pns" : "/login");
      router.refresh();
    }
  }

  useEffect(() => {
    setShowPetaAnnouncement(
      window.localStorage.getItem("dismiss-peta-jabatan-announcement-v2") !==
        "1",
    );
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((payload) => {
        if (!payload.success) {
          loggedOutRef.current = true;
          router.replace(
            window.location.pathname.startsWith("/usulan/cpns-pns")
              ? "/usulan_cpns_to_pns"
              : "/login",
          );
          return;
        }
        setUser(payload.data);
        const verification = payload.data.cpnsVerificationNotification;
        if (verification?.pending > 0 && window.sessionStorage.getItem("cpns-verification-login-notice") !== "dismissed") {
          setShowCpnsVerificationNotice(true);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f9fa] px-4">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
          <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 space-y-3">
            <div className="h-3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen min-w-0 bg-[#f8f9fa] print:bg-white">
      <Sidebar
        user={user}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      />
      <MobileSidebar
        user={user}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div
        className={`min-w-0 transition-[padding] duration-200 print:pl-0 ${collapsed ? "lg:pl-16" : "lg:pl-[260px]"}`}
      >
        <Topbar
          user={user}
          onOpenMenu={() => setMobileOpen(true)}
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((value) => !value)}
        />
        <main className="min-w-0 max-w-full px-3 pb-28 pt-3 print:p-0 sm:px-5 sm:pt-5 lg:h-[calc(100vh-4rem)] lg:overflow-auto lg:px-6 lg:pb-3">
          {children}
          <AppFooter />
        </main>
      </div>
      <MobileBottomNav user={user} />
      {user?.passwordRotation?.required ? (
        <MandatoryPasswordModal
          rotation={user.passwordRotation}
          onChanged={() => setUser((current) => ({ ...current, passwordRotation: { ...current.passwordRotation, required: false, reason: "PASSWORD_CHANGED" } }))}
          onLogout={() => logout()}
        />
      ) : null}
      {showCpnsVerificationNotice && !user?.passwordRotation?.required ? (
        <div className="fixed inset-0 z-[210] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm print:hidden" role="dialog" aria-modal="true" aria-labelledby="cpns-verification-notice-title">
          <section className="w-full max-w-md overflow-hidden rounded-3xl border border-white/30 bg-white shadow-[0_28px_80px_rgba(2,16,43,0.4)]">
            <header className="relative overflow-hidden bg-gradient-to-br from-[#082f49] via-[#0b4a7f] to-[#1263b8] px-6 pb-8 pt-6 text-white">
              <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-300/15" />
              <div className="absolute -bottom-16 left-16 h-32 w-32 rounded-full bg-blue-300/10" />
              <div className="relative flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><BellRing className="h-6 w-6" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-100">Notifikasi Tugas</p>
                  <h2 id="cpns-verification-notice-title" className="mt-1 text-xl font-extrabold leading-tight">Verifikasi Usulan CPNS</h2>
                  <p className="mt-2 text-sm font-medium leading-5 text-white">Ada berkas yang memerlukan tindak lanjut Admin UKPD.</p>
                </div>
              </div>
            </header>
            <div className="relative -mt-4 rounded-t-3xl bg-white px-6 pb-6 pt-5">
              <div className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-4">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-blue-600 text-3xl font-black text-white shadow-lg shadow-blue-200">{user.cpnsVerificationNotification.pending}</span>
                <div>
                  <p className="text-sm font-extrabold text-slate-900">Usulan menunggu verifikasi</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Periksa kelengkapan dan validitas dokumen agar proses pengangkatan tidak tertunda.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-2.5">
                <Link href={user.cpnsVerificationNotification.href} className="btn-primary justify-center py-3" onClick={() => { window.sessionStorage.setItem("cpns-verification-login-notice", "dismissed"); setShowCpnsVerificationNotice(false); }}><ClipboardCheck className="h-4 w-4" />Periksa Usulan Sekarang</Link>
                <button type="button" className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" onClick={() => { window.sessionStorage.setItem("cpns-verification-login-notice", "dismissed"); setShowCpnsVerificationNotice(false); }}>Ingatkan Nanti</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {showPetaAnnouncement && user?.role !== "CPNS" ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-[2px] print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="peta-announcement-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              window.localStorage.setItem(
                "dismiss-peta-jabatan-announcement-v2",
                "1",
              );
              setShowPetaAnnouncement(false);
            }
          }}
        >
          <section className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-2xl">
            <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-dinkes-800 text-white">
                <Megaphone className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="peta-announcement-title"
                  className="font-display text-base font-bold text-slate-950"
                >
                  SMART SDMK
                </h2>
                <p className="text-xs font-semibold text-emerald-700">
                  Pengumuman Kepegawaian
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Tutup pengumuman"
                onClick={() => {
                  window.localStorage.setItem(
                    "dismiss-peta-jabatan-announcement-v2",
                    "1",
                  );
                  setShowPetaAnnouncement(false);
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3">
              <Image
                src="/pengumuman-integrasi-peta-jabatan.png"
                alt="Infografis integrasi Data Pegawai dengan Verval dan Peta Jabatan"
                width={1024}
                height={1536}
                className="h-auto w-full rounded-lg border border-slate-200 bg-white"
                priority
              />
            </div>
            <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white p-3">
              <Link
                className="btn-primary min-h-10 px-3 py-2 text-xs"
                href="/peta-jabatan/data"
                onClick={() => setShowPetaAnnouncement(false)}
              >
                Buka Verval Jabatan
              </Link>
              <Link
                className="btn-secondary min-h-10 px-3 py-2 text-xs"
                href="/peta-jabatan"
                onClick={() => setShowPetaAnnouncement(false)}
              >
                Lihat Peta Jabatan
              </Link>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
