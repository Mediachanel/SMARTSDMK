"use client";

import { useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  ShieldCheck,
  UserRound,
} from "lucide-react";

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success)
    throw new Error(payload?.message || "Permintaan gagal diproses.");
  return payload;
}

export default function CpnsLoginPage() {
  const [mode, setMode] = useState("login");
  const [nrk, setNrk] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [otp, setOtp] = useState("");
  const [activationToken, setActivationToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ type: "", text: "" });

  function reset(nextMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmation("");
    setOtp("");
    setActivationToken("");
    setNotice({ type: "", text: "" });
  }
  async function submitLogin(event) {
    event.preventDefault();
    setBusy(true);
    setNotice({ type: "", text: "" });
    try {
      await post("/api/auth/cpns/login", { nrk, password });
      window.location.href = "/usulan/cpns-pns";
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }
  async function requestOtp(event) {
    event.preventDefault();
    setBusy(true);
    setNotice({ type: "", text: "" });
    try {
      const result = await post("/api/auth/cpns/request-otp", { nrk });
      setMaskedEmail(result.data.maskedEmail);
      setMode("otp");
      setNotice({ type: "success", text: result.message });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }
  async function verifyOtp(event) {
    event.preventDefault();
    setBusy(true);
    setNotice({ type: "", text: "" });
    try {
      const result = await post("/api/auth/cpns/verify-otp", { nrk, otp });
      setActivationToken(result.data.activationToken);
      setMode("password");
      setNotice({
        type: "success",
        text: "Email berhasil diverifikasi. Buat password baru.",
      });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }
  async function activate(event) {
    event.preventDefault();
    setBusy(true);
    setNotice({ type: "", text: "" });
    try {
      const result = await post("/api/auth/cpns/activate", {
        nrk,
        activationToken,
        password,
        confirmation,
      });
      reset("login");
      setNotice({ type: "success", text: result.message });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "login"
      ? "Login CPNS"
      : mode === "activate"
        ? "Aktivasi Email"
        : mode === "otp"
          ? "Verifikasi OTP"
          : "Buat Password";
  const subtitle =
    mode === "login"
      ? "Masuk khusus layanan pengusulan CPNS menjadi PNS"
      : mode === "activate"
        ? "Kode OTP dikirim ke email pada data pegawai"
        : mode === "otp"
          ? `Masukkan kode yang dikirim ke ${maskedEmail}`
          : "Gunakan password yang kuat dan mudah Anda ingat";
  const inputClass =
    "block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pl-11 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#071b45] px-4 py-6 sm:py-10">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/gedung-dinkes-login-main-angle.png')",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#03152f]/90 via-[#06295c]/82 to-[#073b7a]/78"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[30rem] w-[30rem] rounded-full bg-cyan-400/15 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/20 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.4)] lg:grid-cols-[1fr_1.08fr]">
        <section className="relative hidden overflow-hidden bg-[#06295c] p-10 text-center text-white lg:flex lg:flex-col lg:items-center lg:justify-between">
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: "url('/gedung-dinkes-login-cpns-pns.png')",
            }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#06295c]/82 via-[#073b7a]/72 to-[#03152f]/90"
            aria-hidden="true"
          />
          <div className="absolute right-8 top-8 flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/10 text-center text-[10px] font-black uppercase tracking-widest text-white/80">
            <span>
              ASN
              <br />
              DKI
              <br />
              Jakarta
            </span>
          </div>
          <div className="relative z-10 flex flex-col items-center rounded-3xl border border-white/20 bg-[#031b3d]/72 px-7 py-6 shadow-2xl shadow-[#03152f]/40 backdrop-blur-md">
            <div className="mb-8 inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
              <Building2 className="h-7 w-7" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100">
                  Pemerintah Provinsi DKI Jakarta
                </p>
                <p className="text-sm font-extrabold">Dinas Kesehatan</p>
              </div>
            </div>
            <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">
              <Sparkles className="h-4 w-4" />
              SMART SDMK
            </p>
            <h1 className="mt-4 max-w-md text-center text-4xl font-black leading-[1.08] drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)]">
              Langkah Baru Menuju PNS
            </h1>
            <p className="mt-5 max-w-md text-center text-base font-medium leading-7 text-blue-50 drop-shadow-[0_1px_5px_rgba(0,0,0,0.75)]">
              Layanan digital pengusulan CPNS menjadi PNS yang aman, transparan,
              dan terintegrasi.
            </p>
            <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-300/15 px-4 py-2 text-xs font-bold text-amber-100">
              <BadgeCheck className="h-4 w-4" />
              Melayani dengan integritas
            </div>
          </div>
          <div className="relative z-10 mb-24 space-y-3 rounded-2xl border border-white/15 bg-slate-950/25 p-5 text-sm text-blue-50 backdrop-blur-sm">
            <p className="flex items-center justify-center gap-2 text-center">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
              Reset password dibantu oleh admin pengelola
            </p>
            <p className="flex items-center justify-center gap-2 text-center">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
              Password disimpan dalam bentuk terenkripsi
            </p>
            <p className="flex items-center justify-center gap-2 text-center">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
              Hubungi admin jika akun belum aktif atau lupa password
            </p>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 text-white/15">
            <svg
              viewBox="0 0 700 150"
              className="h-full w-full"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M0 150V104h45V75h34v29h31V58h42v46h28V82h36v22h37V66h30v38h42V86h20V38h8V14h9v24h8v48h25V70h44v34h25V55h40v49h29V78h37v26h31V61h45v43h54v46z"
              />
              <path
                fill="currentColor"
                d="M329 104h46V72h-11V42h-6V12h-7V42h-6v30h-16z"
              />
            </svg>
          </div>
        </section>
        <section className="relative flex items-center bg-gradient-to-b from-white to-slate-50 p-6 sm:p-10 lg:p-14">
          <div className="w-full">
            <div className="mb-7 rounded-2xl bg-gradient-to-r from-blue-800 to-cyan-600 p-4 text-center text-white shadow-lg lg:hidden">
              <p className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                <Building2 className="h-4 w-4" />
                Dinas Kesehatan Provinsi DKI Jakarta
              </p>
              <p className="mt-2 text-lg font-black">
                Pengusulan CPNS Menjadi PNS
              </p>
            </div>
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                {mode === "login" ? <LockKeyhole /> : <ShieldCheck />}
              </div>
              <h2 className="text-2xl font-black text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {subtitle}
              </p>
            </div>
            {notice.text ? (
              <div
                role="alert"
                className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
              >
                {notice.text}
              </div>
            ) : null}
            {mode === "login" ? (
              <form className="space-y-4" onSubmit={submitLogin}>
                <Field icon={<UserRound />} label="NRK">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="Masukkan NRK"
                    value={nrk}
                    onChange={(e) => setNrk(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </Field>
                <Field icon={<KeyRound />} label="Password">
                  <div className="relative">
                    <input
                      className={inputClass}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Masukkan password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      className="absolute right-3 top-3 text-slate-400"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </Field>
                <Submit busy={busy}>Masuk ke Pengusulan</Submit>
                <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-sm font-semibold leading-6 text-blue-800">
                  Aktivasi akun atau lupa password? Silakan hubungi Admin UKPD atau administrator SMART SDMK.
                </p>
              </form>
            ) : null}
            {mode === "activate" ? (
              <form className="space-y-4" onSubmit={requestOtp}>
                <Field icon={<UserRound />} label="NRK CPNS">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="Masukkan NRK"
                    value={nrk}
                    onChange={(e) => setNrk(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </Field>
                <Submit busy={busy}>Kirim OTP Email</Submit>
                <Back onClick={() => reset("login")} />
              </form>
            ) : null}
            {mode === "otp" ? (
              <form className="space-y-4" onSubmit={verifyOtp}>
                <Field icon={<ShieldCheck />} label="Kode OTP 6 digit">
                  <input
                    className={`${inputClass} text-center text-xl font-black tracking-[0.35em]`}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    required
                  />
                </Field>
                <Submit busy={busy}>Verifikasi OTP</Submit>
                <button
                  className="w-full py-2 text-sm font-bold text-blue-700"
                  type="button"
                  onClick={() => reset("activate")}
                >
                  Kirim ulang OTP
                </button>
              </form>
            ) : null}
            {mode === "password" ? (
              <form className="space-y-4" onSubmit={activate}>
                <Field icon={<KeyRound />} label="Password baru">
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Minimal 10 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <Field icon={<ShieldCheck />} label="Konfirmasi password">
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Ketik ulang password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    required
                  />
                </Field>
                <p className="text-xs leading-5 text-slate-500">
                  Gunakan minimal 10 karakter dengan huruf besar, huruf kecil,
                  dan angka.
                </p>
                <Submit busy={busy}>Simpan Password</Submit>
              </form>
            ) : null}
            <div className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-center text-xs font-semibold text-emerald-800">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Untuk reset password, silakan hubungi admin pengelola
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ icon, label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-slate-700">
        {label}
      </span>
      <div className="relative">
        <span className="absolute left-3.5 top-3.5 z-10 text-slate-400 [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
        {children}
      </div>
    </label>
  );
}
function Submit({ busy, children }) {
  return (
    <button
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:opacity-60"
      disabled={busy}
      type="submit"
    >
      {busy ? (
        <LoaderCircle className="h-5 w-5 animate-spin" />
      ) : (
        <LockKeyhole className="h-5 w-5" />
      )}
      {children}
    </button>
  );
}
function Back({ onClick }) {
  return (
    <button
      className="w-full py-2 text-sm font-bold text-slate-500 hover:text-slate-800"
      type="button"
      onClick={onClick}
    >
      Kembali ke login
    </button>
  );
}
