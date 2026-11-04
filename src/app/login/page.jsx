"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  Camera,
  ClipboardList,
  Eye,
  EyeOff,
  Fingerprint,
  IdCard,
  Landmark,
  Loader2,
  LockKeyhole,
  Menu,
  ScanFace,
  ShieldCheck,
  X,
  UserRound,
  UsersRound,
} from "lucide-react";
import dinkesLogo from "@/Foto/Dinkes.png";
import {
  isWebAuthnAvailable,
  requestOptionsFromJSON,
  serializePublicKeyCredential,
} from "@/lib/auth/webauthnClient";

const SERVICE_FEATURES = [
  {
    title: "Data Pegawai",
    description: "Profil dan riwayat pegawai",
    icon: UsersRound,
  },
  { title: "Usulan", description: "Mutasi dan putus JF", icon: ClipboardList },
  { title: "DUK", description: "Urutan kepangkatan", icon: IdCard },
  { title: "Passkey", description: "Login perangkat aman", icon: ShieldCheck },
];

const MOBILE_SERVICE_ACTIONS = [
  { title: "Pegawai", description: "Profil pegawai", icon: UsersRound },
  { title: "Usulan", description: "Mutasi & JF", icon: ClipboardList },
  { title: "DUK", description: "Urutan kerja", icon: IdCard },
];

const BIOMETRIC_OPTIONS = [
  {
    label: "Finger",
    kind: "fingerprint",
    method: "sidik jari",
    icon: Fingerprint,
  },
  { label: "Face", kind: "face", method: "pengenalan wajah", icon: ScanFace },
];

const FACE_SCAN_TIMEOUT_MS = 10_000;

function safeNextPath(value) {
  const raw = String(value || "").trim();
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("/\\")
  )
    return "/dashboard";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "/dashboard";

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/dashboard";
  } catch {
    return "/dashboard";
  }
}

function JakartaSilhouette({ compact = false }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden ${compact ? "h-32" : "h-48"}`}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 bottom-0 h-10 bg-white/10" />
      <div className="absolute bottom-8 left-[4%] h-14 w-12 rounded-t-md bg-white/10" />
      <div className="absolute bottom-8 left-[18%] h-20 w-10 rounded-t-lg bg-white/10" />
      <div className="absolute bottom-8 left-[29%] h-12 w-16 rounded-t-md bg-white/10" />
      <div className="absolute bottom-8 right-[26%] h-16 w-12 rounded-t-md bg-white/10" />
      <div className="absolute bottom-8 right-[11%] h-24 w-11 rounded-t-lg bg-white/10" />
      <div className="absolute bottom-8 right-[3%] h-14 w-14 rounded-t-md bg-white/10" />
      <div className="absolute bottom-8 left-1/2 h-28 w-20 -translate-x-1/2">
        <span className="absolute left-1/2 top-0 h-8 w-1.5 -translate-x-1/2 rounded-full bg-amber-200/90 shadow-[0_0_18px_rgba(254,240,138,0.55)]" />
        <span className="absolute left-1/2 top-7 h-16 w-3 -translate-x-1/2 rounded-t-full bg-white/30" />
        <span className="absolute bottom-3 left-1/2 h-8 w-10 -translate-x-1/2 rounded-t-[28px] bg-white/25" />
        <span className="absolute bottom-0 left-1/2 h-5 w-20 -translate-x-1/2 rounded-t-xl bg-white/20" />
      </div>
    </div>
  );
}

function LoginCard() {
  const router = useRouter();
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const desktopUsernameRef = useRef(null);
  const desktopPasswordRef = useRef(null);
  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const faceDetectorTimerRef = useRef(null);
  const faceLoginTimerRef = useRef(null);
  const faceLoginStartedRef = useRef(false);
  const [form, setForm] = useState({ username: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({
    username: "",
    password: "",
  });
  const [formError, setFormError] = useState("");
  const [biometricNotice, setBiometricNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState("");
  const [faceDialog, setFaceDialog] = useState({
    open: false,
    status: "idle",
    message: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUser, setRememberUser] = useState(false);

  function persistRememberedUser(username) {
    if (typeof window === "undefined") return;

    try {
      if (rememberUser) {
        window.localStorage.setItem("sidata:rememberUser", "1");
        window.localStorage.setItem("sidata:username", username);
        return;
      }

      window.localStorage.removeItem("sidata:rememberUser");
      window.localStorage.removeItem("sidata:username");
    } catch {
      // Local storage can be unavailable in private or managed browser modes.
    }
  }

  function updateRememberUser(checked) {
    setRememberUser(checked);
    if (checked || typeof window === "undefined") return;

    try {
      window.localStorage.removeItem("sidata:rememberUser");
      window.localStorage.removeItem("sidata:username");
    } catch {
      // Ignore storage failures; login should keep working.
    }
  }

  function showLoginNotice(message) {
    setFormError("");
    setBiometricNotice(message);
  }

  function focusLoginField(field) {
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;
    const ref =
      field === "username"
        ? isDesktop
          ? desktopUsernameRef
          : usernameRef
        : isDesktop
          ? desktopPasswordRef
          : passwordRef;
    ref.current?.focus();
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function focusFirstError(nextErrors) {
    if (nextErrors.username) {
      focusLoginField("username");
      return;
    }
    if (nextErrors.password) {
      focusLoginField("password");
    }
  }

  function validateBeforeSubmit() {
    const nextErrors = {
      username: form.username.trim()
        ? ""
        : "Username / UKPD ID wajib diisi.",
      password: form.password ? "" : "Password wajib diisi.",
    };
    setFieldErrors(nextErrors);
    setFormError("");
    const hasError = Boolean(nextErrors.username || nextErrors.password);
    if (hasError) {
      focusFirstError(nextErrors);
    }
    return !hasError;
  }

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    if (!validateBeforeSubmit()) return;

    setLoading(true);
    setFormError("");
    setBiometricNotice("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        const message =
          response.status === 401 || response.status === 422
            ? "Username atau password tidak sesuai."
            : "Login belum berhasil. Silakan coba lagi.";
        setFormError(message);
        setFieldErrors((current) => ({
          ...current,
          username: current.username || "Username atau password tidak sesuai.",
          password: current.password || "Username atau password tidak sesuai.",
        }));
        focusLoginField("username");
        return;
      }
      const nextPath =
        payload.data?.role === "CPNS"
          ? "/usulan/cpns-pns"
          : typeof window !== "undefined"
            ? safeNextPath(
                new URLSearchParams(window.location.search).get("next"),
              )
            : "/dashboard";
      persistRememberedUser(form.username.trim());
      router.replace(nextPath);
    } catch {
      setFormError("Login belum berhasil. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setFormError("");
    setBiometricNotice("");
  }

  function stopFaceCamera() {
    if (faceDetectorTimerRef.current) {
      window.clearInterval(faceDetectorTimerRef.current);
      faceDetectorTimerRef.current = null;
    }
    if (faceLoginTimerRef.current) {
      window.clearTimeout(faceLoginTimerRef.current);
      faceLoginTimerRef.current = null;
    }
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((track) => track.stop());
      faceStreamRef.current = null;
    }
    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = null;
    }
  }

  function closeFaceDialog() {
    stopFaceCamera();
    faceLoginStartedRef.current = false;
    setFaceDialog({ open: false, status: "idle", message: "" });
  }

  function continueFacePasskey() {
    stopFaceCamera();
    setFaceDialog({ open: false, status: "idle", message: "" });
    requestPasskeyLogin("pengenalan wajah");
  }

  function beginFaceDetection() {
    faceLoginStartedRef.current = false;

    if (typeof window === "undefined" || !("FaceDetector" in window)) {
      setFaceDialog({
        open: true,
        status: "fallback",
        message:
          "Kamera sudah aktif, tetapi browser ini belum mendukung deteksi wajah otomatis. Lanjutkan dengan passkey perangkat.",
      });
      return;
    }

    const detector = new window.FaceDetector({
      fastMode: true,
      maxDetectedFaces: 1,
    });
    const startedAt = Date.now();

    faceDetectorTimerRef.current = window.setInterval(async () => {
      const video = faceVideoRef.current;
      if (!video || video.readyState < 2 || faceLoginStartedRef.current) return;

      try {
        const faces = await detector.detect(video);
        if (faces.length > 0) {
          faceLoginStartedRef.current = true;
          setFaceDialog({
            open: true,
            status: "detected",
            message:
              "Wajah terdeteksi. Melanjutkan verifikasi passkey perangkat...",
          });
          faceLoginTimerRef.current = window.setTimeout(() => {
            faceLoginTimerRef.current = null;
            continueFacePasskey();
          }, 650);
          return;
        }

        if (Date.now() - startedAt > FACE_SCAN_TIMEOUT_MS) {
          if (faceDetectorTimerRef.current) {
            window.clearInterval(faceDetectorTimerRef.current);
            faceDetectorTimerRef.current = null;
          }
          setFaceDialog({
            open: true,
            status: "fallback",
            message:
              "Wajah belum terbaca jelas. Pastikan wajah menghadap kamera, atau lanjutkan dengan passkey perangkat.",
          });
        }
      } catch {
        if (faceDetectorTimerRef.current) {
          window.clearInterval(faceDetectorTimerRef.current);
          faceDetectorTimerRef.current = null;
        }
        setFaceDialog({
          open: true,
          status: "fallback",
          message:
            "Deteksi wajah otomatis tidak tersedia di browser ini. Lanjutkan dengan passkey perangkat.",
        });
      }
    }, 600);
  }

  function requestFaceLogin() {
    if (loading || passkeyLoading || faceDialog.open) return;

    setFieldErrors({ username: "", password: "" });
    setFormError("");

    if (!isWebAuthnAvailable()) {
      setBiometricNotice(
        "Perangkat atau browser ini belum mendukung passkey biometrik. Gunakan Chrome/Edge/Safari terbaru di HTTPS atau localhost.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setBiometricNotice(
        "Browser ini belum mengizinkan akses kamera untuk Face Recognition.",
      );
      return;
    }

    const username = form.username.trim();
    if (!username) {
      setBiometricNotice("Isi Username / UKPD ID dulu, lalu pilih Face.");
      focusLoginField("username");
      return;
    }

    setBiometricNotice("");
    setFaceDialog({
      open: true,
      status: "starting",
      message: "Membuka kamera depan untuk membaca wajah...",
    });
  }

  async function requestPasskeyLogin(method) {
    if (loading || passkeyLoading) return;

    setFieldErrors({ username: "", password: "" });
    setFormError("");

    if (!isWebAuthnAvailable()) {
      setBiometricNotice(
        `Perangkat atau browser ini belum mendukung login ${method}. Gunakan username dan password resmi.`,
      );
      return;
    }

    const username = form.username.trim();
    if (!username) {
      setBiometricNotice(
        "Isi Username / UKPD ID dulu, lalu pilih Finger atau Face.",
      );
      focusLoginField("username");
      return;
    }

    setPasskeyLoading(method);
    setBiometricNotice("");

    try {
      const optionsResponse = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const optionsPayload = await optionsResponse.json();
      if (!optionsResponse.ok || !optionsPayload.success) {
        throw new Error(
          optionsPayload.message || "Login passkey belum dapat dimulai.",
        );
      }

      const credential = await navigator.credentials.get({
        publicKey: requestOptionsFromJSON(optionsPayload.data.options),
      });
      const verifyResponse = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: serializePublicKeyCredential(credential),
        }),
      });
      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyPayload.success) {
        throw new Error(
          verifyPayload.message || "Login passkey belum berhasil.",
        );
      }

      const nextPath =
        typeof window !== "undefined"
          ? safeNextPath(
              new URLSearchParams(window.location.search).get("next"),
            )
          : "/dashboard";
      persistRememberedUser(username);
      router.replace(nextPath);
    } catch (error) {
      const cancelled = error?.name === "NotAllowedError";
      setBiometricNotice(
        cancelled
          ? "Verifikasi biometrik dibatalkan."
          : error.message || "Login passkey belum berhasil.",
      );
    } finally {
      setPasskeyLoading("");
    }
  }

  function requestBiometricLogin(option) {
    if (option.kind === "face") {
      requestFaceLogin();
      return;
    }
    requestPasskeyLogin(option.method);
  }

  useEffect(() => {
    if (!faceDialog.open || faceDialog.status !== "starting") return undefined;

    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        faceStreamRef.current = stream;
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          await faceVideoRef.current.play().catch(() => {});
        }

        setFaceDialog({
          open: true,
          status: "scanning",
          message: "Arahkan wajah ke kamera. Sistem sedang mencari wajah...",
        });
        beginFaceDetection();
      } catch (error) {
        const denied =
          error?.name === "NotAllowedError" ||
          error?.name === "PermissionDeniedError";
        setFaceDialog({
          open: true,
          status: "error",
          message: denied
            ? "Akses kamera ditolak. Izinkan kamera dari browser, atau lanjutkan dengan passkey perangkat."
            : "Kamera belum dapat dibuka. Lanjutkan dengan passkey perangkat atau gunakan username dan password.",
        });
      }
    }

    startCamera();

    return () => {
      cancelled = true;
    };
  }, [faceDialog.open, faceDialog.status]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const shouldRemember =
        window.localStorage.getItem("sidata:rememberUser") === "1";
      const savedUsername =
        window.localStorage.getItem("sidata:username") || "";
      setRememberUser(shouldRemember);
      if (shouldRemember && savedUsername) {
        setForm((current) =>
          current.username ? current : { ...current, username: savedUsername },
        );
      }
    } catch {
      // Keep the form usable even when storage access is blocked.
    }
  }, []);

  useEffect(() => {
    return () => {
      stopFaceCamera();
    };
  }, []);

  return (
    <aside
      aria-label="Form masuk SMART SDMK"
      className="relative flex min-h-screen w-full min-w-0 justify-center overflow-x-hidden bg-[#f8f9fa] px-0 text-slate-900 sm:min-h-[720px] sm:items-center sm:px-6 sm:py-8 lg:h-full lg:min-h-0 lg:items-stretch lg:overflow-visible lg:bg-transparent lg:px-0 lg:py-0"
    >
      <form
        aria-labelledby="login-heading"
        className="relative flex min-h-screen w-full max-w-[430px] flex-col overflow-hidden border-slate-200 bg-white sm:min-h-[720px] sm:rounded-lg sm:border lg:hidden"
        onSubmit={submit}
        noValidate
      >
        <section className="relative overflow-hidden bg-dinkes-800 px-5 pb-16 pt-5 text-white">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-sm">
                <Image
                  src={dinkesLogo}
                  alt="Logo Dinas Kesehatan DKI Jakarta"
                  className="h-full w-full object-contain"
                  priority
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold leading-tight text-white">
                  SMART SDMK
                </p>
                <p className="truncate text-[11px] font-semibold text-white/75">
                  Dinkes DKI Jakarta
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  showLoginNotice(
                    "Notifikasi akan tampil setelah Anda berhasil masuk.",
                  )
                }
                className="relative grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/20 focus-ring"
                aria-label="Notifikasi"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-emerald-300 ring-2 ring-[#0f6fa8]" />
              </button>
              <button
                type="button"
                onClick={() =>
                  showLoginNotice(
                    "Menu utama tersedia setelah Anda berhasil masuk.",
                  )
                }
                className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/20 focus-ring"
                aria-label="Buka menu"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="relative z-10 mt-8 max-w-[280px]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">
              Selamat datang
            </p>
            <h2
              id="login-heading"
              className="mt-3 text-3xl font-extrabold leading-tight tracking-normal text-white"
            >
              Masuk ke SMART SDMK Mobile
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-white/80">
              Akses data pegawai, usulan, dan DUK layanan kepegawaian.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white backdrop-blur">
              <Landmark className="h-4 w-4 text-amber-200" aria-hidden="true" />
              Jakarta - Monas
            </div>
          </div>
          <JakartaSilhouette compact />
        </section>

        <section className="relative z-10 -mt-10 flex flex-1 flex-col rounded-t-lg bg-white px-5 pb-6 pt-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-dinkes-800">
                  Akun resmi
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  Gunakan UKPD ID Anda
                </p>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-dinkes-50 text-dinkes-800">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>

            <a
              href="/usulan_cpns_to_pns"
              className="mb-4 block rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-extrabold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100"
            >
              CPNS Formasi 2024? Masuk melalui Portal CPNS →
            </a>

            <div className="space-y-3">
              <label htmlFor="username" className="block">
                <span className="sr-only">Username / UKPD ID</span>
                <span className="relative block">
                  <UserRound
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-dinkes-700"
                    aria-hidden="true"
                  />
                  <input
                    id="username"
                    ref={usernameRef}
                    name="username"
                    className={`h-12 w-full rounded-lg border px-12 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 ${fieldErrors.username ? "border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-100" : "border-slate-300 bg-white focus:border-dinkes-800 focus:ring-dinkes-100"}`}
                    value={form.username}
                    onChange={(event) =>
                      updateField("username", event.target.value)
                    }
                    autoComplete="username"
                    placeholder="Username / UKPD ID"
                    aria-invalid={Boolean(fieldErrors.username)}
                    aria-describedby={
                      fieldErrors.username ? "username-error" : undefined
                    }
                  />
                </span>
                {fieldErrors.username ? (
                  <p
                    id="username-error"
                    className="mt-2 text-sm font-medium text-amber-700"
                  >
                    {fieldErrors.username}
                  </p>
                ) : null}
              </label>

              <label htmlFor="password" className="block">
                <span className="sr-only">Password</span>
                <span className="relative block">
                  <ShieldCheck
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-dinkes-700"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    ref={passwordRef}
                    name="password"
                    className={`h-12 w-full rounded-lg border px-12 pr-14 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 ${fieldErrors.password ? "border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-100" : "border-slate-300 bg-white focus:border-dinkes-800 focus:ring-dinkes-100"}`}
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) =>
                      updateField("password", event.target.value)
                    }
                    autoComplete="current-password"
                    placeholder="Password"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={
                      fieldErrors.password ? "password-error" : undefined
                    }
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-800 focus-ring"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword
                        ? "Sembunyikan password"
                        : "Tampilkan password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                </span>
                {fieldErrors.password ? (
                  <p
                    id="password-error"
                    className="mt-2 text-sm font-medium text-amber-700"
                  >
                    {fieldErrors.password}
                  </p>
                ) : null}
              </label>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={rememberUser}
                  onChange={(event) => updateRememberUser(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-dinkes-800 focus:ring-dinkes-200"
                />
                <span className="truncate">Simpan User ID</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  showLoginNotice(
                    "Untuk reset password, hubungi admin Kepegawaian UKPD atau administrator SMART SDMK.",
                  )
                }
                className="shrink-0 text-[11px] font-bold text-dinkes-800 hover:text-dinkes-700 min-[380px]:text-xs"
              >
                <span className="hidden min-[400px]:inline">
                  Lupa password?
                </span>
                <span className="min-[400px]:hidden">Lupa?</span>
              </button>
            </div>

            <button
              className="btn-primary mt-5 h-12 w-full text-sm font-extrabold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Memproses...
                </>
              ) : (
                "Masuk"
              )}
            </button>

            <div className="mt-4 grid grid-cols-2 gap-2 min-[380px]:gap-3">
              {BIOMETRIC_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  disabled={loading || Boolean(passkeyLoading)}
                  onClick={() => requestBiometricLogin(option)}
                  className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-cyan-100 bg-white text-sm font-bold text-cyan-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {passkeyLoading === option.method ? (
                    <Loader2
                      className="h-5 w-5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <option.icon className="h-5 w-5" aria-hidden="true" />
                  )}
                  {option.label}
                </button>
              ))}
            </div>

            {biometricNotice ? (
              <p
                role="status"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800"
              >
                {biometricNotice}
              </p>
            ) : null}
            {formError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"
              >
                {formError}
              </p>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold text-slate-800">
                Menu cepat
              </p>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700">
                Mobile
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MOBILE_SERVICE_ACTIONS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() =>
                    showLoginNotice(
                      "Silakan masuk terlebih dahulu untuk membuka layanan ini.",
                    )
                  }
                  className="min-w-0 rounded-2xl bg-white px-2 py-3 text-center shadow-sm ring-1 ring-cyan-100 transition hover:-translate-y-0.5 hover:ring-emerald-200 focus-ring"
                >
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="mt-2 block truncate text-[11px] font-extrabold text-slate-800">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex items-center justify-center pt-6">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-dinkes-600 to-emerald-500 text-sm font-extrabold text-white shadow-[0_16px_34px_rgba(14,116,144,0.28)] ring-4 ring-white">
              SI
            </span>
          </div>
        </section>
      </form>

      <form
        aria-labelledby="login-heading-desktop"
        className="hidden w-full max-w-[520px] rounded-lg border border-slate-200 bg-white p-6 lg:block lg:min-h-full lg:pt-10 xl:p-7 xl:pt-10"
        onSubmit={submit}
        noValidate
      >
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-lg bg-dinkes-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-dinkes-800 ring-1 ring-dinkes-100">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            Portal Login
          </span>
          <span className="absolute right-0 top-0 grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-white p-2 ring-1 ring-slate-200">
            <Image
              src={dinkesLogo}
              alt="Logo Dinas Kesehatan DKI Jakarta"
              className="h-full w-full object-contain"
              priority
            />
          </span>
          <h2
            id="login-heading-desktop"
            className="mx-auto mt-4 max-w-sm text-center text-3xl font-extrabold leading-tight tracking-normal text-slate-900"
          >
            SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta
          </h2>
          <a
            href="/usulan_cpns_to_pns"
            className="mx-auto mt-4 block max-w-sm rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-extrabold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100"
          >
            CPNS Formasi 2024? Masuk melalui Portal CPNS →
          </a>
        </div>

        <div className="mt-6 grid gap-4">
          <label htmlFor="desktop-username" className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Username / UKPD ID
            </span>
            <span className="relative block">
              <UserRound
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-dinkes-700"
                aria-hidden="true"
              />
              <input
                id="desktop-username"
                ref={desktopUsernameRef}
                name="username"
                className={`h-12 w-full rounded-lg border px-12 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 ${fieldErrors.username ? "border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-100" : "border-slate-300 bg-white focus:border-dinkes-800 focus:ring-dinkes-100"}`}
                value={form.username}
                onChange={(event) =>
                  updateField("username", event.target.value)
                }
                autoComplete="username"
                placeholder="Masukkan Username / UKPD ID"
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby={
                  fieldErrors.username ? "desktop-username-error" : undefined
                }
              />
            </span>
            {fieldErrors.username ? (
              <p
                id="desktop-username-error"
                className="mt-2 text-sm font-medium text-amber-700"
              >
                {fieldErrors.username}
              </p>
            ) : null}
          </label>

          <label htmlFor="desktop-password" className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Password
            </span>
            <span className="relative block">
              <ShieldCheck
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-dinkes-700"
                aria-hidden="true"
              />
              <input
                id="desktop-password"
                ref={desktopPasswordRef}
                name="password"
                className={`h-12 w-full rounded-lg border px-12 pr-14 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 ${fieldErrors.password ? "border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-100" : "border-slate-300 bg-white focus:border-dinkes-800 focus:ring-dinkes-100"}`}
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) =>
                  updateField("password", event.target.value)
                }
                autoComplete="current-password"
                placeholder="Masukkan password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={
                  fieldErrors.password ? "desktop-password-error" : undefined
                }
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-800 focus-ring"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={
                  showPassword ? "Sembunyikan password" : "Tampilkan password"
                }
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </span>
            {fieldErrors.password ? (
              <p
                id="desktop-password-error"
                className="mt-2 text-sm font-medium text-amber-700"
              >
                {fieldErrors.password}
              </p>
            ) : null}
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-500">
            <input
              type="checkbox"
              checked={rememberUser}
              onChange={(event) => updateRememberUser(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-dinkes-800 focus:ring-dinkes-200"
            />
            <span className="truncate">Simpan User ID</span>
          </label>
          <button
            type="button"
            onClick={() =>
              showLoginNotice(
                "Untuk reset password, hubungi admin Kepegawaian UKPD atau administrator SMART SDMK.",
              )
            }
            className="shrink-0 text-sm font-bold text-dinkes-800 hover:text-dinkes-700"
          >
            Lupa password?
          </button>
        </div>

        <button
          className="btn-primary mt-5 h-12 w-full text-sm font-extrabold"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Memproses...
            </>
          ) : (
            "Masuk"
          )}
        </button>

        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-center font-extrabold text-slate-900">
                Login Biometrik
              </p>
              <p className="mt-1 text-center text-xs leading-5 text-slate-600"></p>
            </div>
            <Fingerprint
              className="h-5 w-5 shrink-0 text-dinkes-800"
              aria-hidden="true"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {BIOMETRIC_OPTIONS.map((option) => (
              <button
                key={`desktop-${option.label}`}
                type="button"
                disabled={loading || Boolean(passkeyLoading)}
                onClick={() => requestBiometricLogin(option)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-bold text-dinkes-800 transition hover:border-dinkes-300 hover:bg-dinkes-50 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passkeyLoading === option.method ? (
                  <Loader2
                    className="h-5 w-5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <option.icon className="h-5 w-5" aria-hidden="true" />
                )}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {biometricNotice ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800"
          >
            {biometricNotice}
          </p>
        ) : null}
        {formError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"
          >
            {formError}
          </p>
        ) : null}
      </form>

      {faceDialog.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            aria-label="Tutup Face Recognition"
            onClick={closeFaceDialog}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="face-login-title"
            className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_90px_rgba(15,23,42,0.35)] ring-1 ring-white/70"
          >
            <div className="flex items-center justify-between gap-4 border-b border-cyan-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <ScanFace className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2
                    id="face-login-title"
                    className="truncate text-base font-extrabold text-slate-900"
                  >
                    Face Recognition
                  </h2>
                  <p className="truncate text-xs font-semibold text-slate-500">
                    SMART SDMK Dinkes DKI Jakarta
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeFaceDialog}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-ring"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] bg-slate-950">
                <video
                  ref={faceVideoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                <div className="pointer-events-none absolute inset-6 rounded-[28px] border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.18)]" />
                <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-extrabold text-cyan-800 shadow-sm">
                  {faceDialog.status === "starting" ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Camera className="h-4 w-4" aria-hidden="true" />
                  )}
                  {faceDialog.status === "detected"
                    ? "Terdeteksi"
                    : "Kamera aktif"}
                </div>
                {faceDialog.status === "starting" ? (
                  <div className="absolute inset-0 grid place-items-center bg-slate-950/35 text-white">
                    <Loader2
                      className="h-9 w-9 animate-spin"
                      aria-hidden="true"
                    />
                  </div>
                ) : null}
              </div>

              <p
                className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold leading-6 ${faceDialog.status === "error" || faceDialog.status === "fallback" ? "border border-amber-200 bg-amber-50 text-amber-800" : "border border-cyan-100 bg-cyan-50 text-cyan-900"}`}
              >
                {faceDialog.message}
              </p>

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeFaceDialog}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 focus-ring"
                >
                  Batal
                </button>
                {faceDialog.status === "fallback" ||
                faceDialog.status === "error" ? (
                  <button
                    type="button"
                    onClick={continueFacePasskey}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-dinkes-600 via-cyan-600 to-emerald-500 px-4 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(14,116,144,0.25)] transition hover:brightness-95 focus-ring"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Lanjutkan Passkey
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

    </aside>
  );
}

function LoginShell() {
  const timestamp = useMemo(() => {
    return new Intl.DateTimeFormat("id-ID", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date());
  }, []);

  return (
    <>
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-dinkes-600 focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>

      <div className="min-h-screen overflow-x-hidden bg-[#f8f9fa] text-slate-900">
        <header className="hidden border-b border-slate-200 bg-white/95 backdrop-blur sm:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-slate-200">
                <Image
                  src={dinkesLogo}
                  alt="Logo Dinas Kesehatan DKI Jakarta"
                  className="h-full w-full object-contain"
                  priority
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold tracking-wide text-slate-800 sm:text-base">
                  SMART SDMK
                </p>
                <p className="truncate text-xs font-semibold text-slate-600 sm:text-sm">
                  Dinas Kesehatan Provinsi DKI Jakarta
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-lg bg-dinkes-50 px-4 py-2 text-xs font-bold text-dinkes-800 ring-1 ring-dinkes-100 sm:flex">
              <span
                className="h-2.5 w-2.5 rounded-full bg-dinkes-800"
                aria-hidden="true"
              />
              {timestamp}
            </div>
          </div>
        </header>

        <main
          id="konten-utama"
          className="mx-auto grid min-h-screen w-full max-w-7xl lg:min-h-[calc(100vh-69px)] lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.78fr)] lg:items-center lg:gap-6 lg:px-8 lg:py-6 xl:gap-8"
        >
          <section
            className="relative hidden overflow-hidden rounded-lg bg-dinkes-800 p-10 text-white lg:flex lg:h-[calc(100vh-117px)] lg:min-h-[560px] lg:max-h-[680px] lg:flex-col lg:justify-between"
            aria-labelledby="hero-heading"
          >
            <div className="relative z-10 max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white/80 backdrop-blur">
                <Landmark
                  className="h-4 w-4 text-amber-200"
                  aria-hidden="true"
                />
                Jakarta digital service
              </span>
              <h1
                id="hero-heading"
                className="mt-7 max-w-3xl text-5xl font-extrabold leading-tight tracking-normal text-white"
              >
                SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta
              </h1>
              <p className="mt-4 max-w-xl text-base font-medium leading-7 text-white/80">
                Portal terpadu untuk pengelolaan data pegawai, layanan usulan,
                DUK, dan informasi kepegawaian Dinas Kesehatan Provinsi DKI
                Jakarta.
              </p>
            </div>

            <div className="relative z-10 max-w-2xl">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-extrabold text-white">
                  Layanan utama setelah login
                </p>
                <span className="rounded-full bg-govgold-300 px-3 py-1 text-xs font-extrabold text-slate-900">
                  Internal
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {SERVICE_FEATURES.map((item) => (
                  <div
                    key={item.title}
                    className="flex min-h-[82px] items-start gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 text-left backdrop-blur"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-amber-100">
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold leading-5 text-white">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-white/75">
                        {item.description}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <JakartaSilhouette />
          </section>

          <section className="flex min-h-screen w-full items-stretch justify-center lg:h-[calc(100vh-117px)] lg:min-h-[560px] lg:max-h-[680px]">
            <LoginCard />
          </section>
        </main>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-[#f5f5f5]">
          <CalendarClock
            className="h-8 w-8 animate-pulse text-dinkes-600"
            aria-hidden="true"
          />
        </main>
      }
    >
      <LoginShell />
    </Suspense>
  );
}
