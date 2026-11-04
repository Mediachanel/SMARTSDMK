"use client";

import { useEffect, useMemo, useState } from "react";
import { Fingerprint, KeyRound, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import RoleBadge from "@/components/ui/RoleBadge";
import { ROLES } from "@/lib/constants/roles";
import { PASSWORD_POLICY_TEXT } from "@/lib/auth/passwordPolicy";
import { creationOptionsFromJSON, isWebAuthnAvailable, serializePublicKeyCredential } from "@/lib/auth/webauthnClient";

const EMPTY_PASSWORD_FORM = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

function Modal({ title, description, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 print:hidden">
      <button type="button" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" aria-label="Tutup popup" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" className="relative w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)] ring-1 ring-slate-200">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="settings-modal-title" className="text-lg font-extrabold text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-ring" onClick={onClose} aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function PolicyList() {
  return (
    <ul className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      {PASSWORD_POLICY_TEXT.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-dinkes-700" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState(EMPTY_PASSWORD_FORM);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        const details = Array.isArray(payload.errors) ? ` ${payload.errors.join(" ")}` : "";
        throw new Error(`${payload.message || "Password belum dapat diubah."}${details}`);
      }
      setForm(EMPTY_PASSWORD_FORM);
      setMessage(payload.message || "Password berhasil diubah.");
    } catch (err) {
      setError(err.message || "Password belum dapat diubah.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Ubah Password" description="Update password akun yang sedang aktif." onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={submit}>
        <PolicyList />
        <label className="grid gap-2">
          <span className="label">Password Lama</span>
          <input className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => updateField("currentPassword", event.target.value)} />
        </label>
        <label className="grid gap-2">
          <span className="label">Password Baru</span>
          <input className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => updateField("newPassword", event.target.value)} />
        </label>
        <label className="grid gap-2">
          <span className="label">Konfirmasi Password Baru</span>
          <input className="input" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} />
        </label>
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p> : null}
        {error ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</p> : null}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Tutup</button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Simpan Password
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetUkpdPasswordModal({ targets, onClose, onReload }) {
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const filteredTargets = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return targets;
    return targets.filter((item) => [item.nama_ukpd, item.wilayah, item.ukpd_id].join(" ").toLowerCase().includes(text));
  }, [query, targets]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/password-reset/ukpd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ukpdId: selectedId })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        const details = Array.isArray(payload.errors) ? ` ${payload.errors.join(" ")}` : "";
        throw new Error(`${payload.message || "Password UKPD belum dapat direset."}${details}`);
      }
      setMessage(`${payload.data?.target?.nama_ukpd || "UKPD"} sudah direset ke password default sistem.`);
      setSelectedId("");
      onReload?.();
    } catch (err) {
      setError(err.message || "Password UKPD belum dapat direset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Reset Password UKPD" description="Khusus Super Admin. Password target akan dikembalikan ke nilai env UKPD_DEFAULT_PASSWORD." onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={submit}>
        <PolicyList />
        <label className="grid gap-2">
          <span className="label">Cari UKPD</span>
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ketik nama UKPD, wilayah, atau kode" />
        </label>
        <label className="grid gap-2">
          <span className="label">Pilih UKPD</span>
          <select className="input" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required>
            <option value="">Pilih UKPD</option>
            {filteredTargets.map((item) => (
              <option key={item.id_ukpd} value={item.id_ukpd}>
                {item.nama_ukpd} {item.wilayah ? `- ${item.wilayah}` : ""}
              </option>
            ))}
          </select>
        </label>
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p> : null}
        {error ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</p> : null}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Tutup</button>
          <button type="submit" className="btn-primary" disabled={loading || !selectedId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Reset Password
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetCpnsPasswordModal({ targets, onClose, onReload }) {
  const [selectedNrk, setSelectedNrk] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const filteredTargets = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return targets;
    return targets.filter((item) => [item.nrk, item.nama, item.nama_ukpd, item.wilayah].join(" ").toLowerCase().includes(text));
  }, [query, targets]);
  const selectedTarget = useMemo(() => targets.find((item) => item.nrk === selectedNrk) || null, [selectedNrk, targets]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/password-reset/cpns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nrk: selectedNrk })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        const details = Array.isArray(payload.errors) ? ` ${payload.errors.join(" ")}` : "";
        throw new Error(`${payload.message || "Password CPNS belum dapat direset."}${details}`);
      }
      setMessage(`${payload.data?.target?.nama || "CPNS"} sudah direset ke password default sistem.`);
      setSelectedNrk("");
      onReload?.();
    } catch (err) {
      setError(err.message || "Password CPNS belum dapat direset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Reset Password CPNS" description="Khusus Super Admin. Pilih NRK CPNS, pastikan nama pegawai sesuai, lalu reset ke password default sistem." onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={submit}>
        <PolicyList />
        <label className="grid gap-2">
          <span className="label">Cari CPNS</span>
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ketik NRK, nama, UKPD, atau wilayah" />
        </label>
        <label className="grid gap-2">
          <span className="label">Pilih NRK</span>
          <select className="input" value={selectedNrk} onChange={(event) => setSelectedNrk(event.target.value)} required>
            <option value="">Pilih NRK CPNS</option>
            {filteredTargets.map((item) => (
              <option key={item.id_pegawai} value={item.nrk}>
                {item.nrk} - {item.nama}
              </option>
            ))}
          </select>
        </label>
        {selectedTarget ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pegawai Terpilih</p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="label">Nama</dt><dd className="mt-1 font-semibold text-slate-900">{selectedTarget.nama || "-"}</dd></div>
              <div><dt className="label">NRK</dt><dd className="mt-1 font-semibold text-slate-900">{selectedTarget.nrk || "-"}</dd></div>
              <div><dt className="label">UKPD</dt><dd className="mt-1 text-slate-700">{selectedTarget.nama_ukpd || "-"}</dd></div>
              <div><dt className="label">Wilayah</dt><dd className="mt-1 text-slate-700">{selectedTarget.wilayah || "-"}</dd></div>
            </dl>
            <p className={`mt-3 inline-flex rounded-lg px-3 py-1 text-xs font-bold ${selectedTarget.activated ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
              {selectedTarget.activated ? "Akun CPNS sudah aktif" : "Belum aktivasi, reset akan membuat akun CPNS"}
            </p>
          </div>
        ) : null}
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p> : null}
        {error ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</p> : null}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Tutup</button>
          <button type="submit" className="btn-primary" disabled={loading || !selectedNrk}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Reset Password
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProfilPage() {
  const [user, setUser] = useState(null);
  const [passkeys, setPasskeys] = useState([]);
  const [resetTargets, setResetTargets] = useState([]);
  const [resetCpnsTargets, setResetCpnsTargets] = useState([]);
  const [activeModal, setActiveModal] = useState("");
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState("");
  const [passkeyError, setPasskeyError] = useState("");
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;

  async function loadPasskeys() {
    const response = await fetch("/api/auth/passkey/credentials", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok && payload.success) {
      setPasskeys(payload.data.passkeys || []);
    }
  }

  async function loadResetTargets() {
    const response = await fetch("/api/admin/password-reset/ukpd", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok && payload.success) {
      setResetTargets(payload.data?.rows || []);
    }
  }

  async function loadResetCpnsTargets() {
    const response = await fetch("/api/admin/password-reset/cpns", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok && payload.success) {
      setResetCpnsTargets(payload.data?.rows || []);
    }
  }

  useEffect(() => {
    async function loadProfile() {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const payload = await response.json();
      const nextUser = payload.data || null;
      setUser(nextUser);
      await loadPasskeys().catch(() => setPasskeys([]));
      if (nextUser?.role === ROLES.SUPER_ADMIN) {
        await Promise.all([
          loadResetTargets().catch(() => setResetTargets([])),
          loadResetCpnsTargets().catch(() => setResetCpnsTargets([]))
        ]);
      }
    }

    loadProfile();
  }, []);

  async function registerPasskey() {
    setPasskeyMessage("");
    setPasskeyError("");

    if (!isWebAuthnAvailable()) {
      setPasskeyError("Browser atau perangkat ini belum mendukung passkey. Gunakan Chrome/Edge/Safari terbaru di HTTPS atau localhost.");
      return;
    }

    setPasskeyLoading(true);
    try {
      const label = `Passkey ${new Date().toLocaleDateString("id-ID")}`;
      const optionsResponse = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label })
      });
      const optionsPayload = await optionsResponse.json();
      if (!optionsResponse.ok || !optionsPayload.success) {
        throw new Error(optionsPayload.message || "Pendaftaran passkey belum dapat dimulai.");
      }

      const credential = await navigator.credentials.create({
        publicKey: creationOptionsFromJSON(optionsPayload.data.options)
      });
      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: serializePublicKeyCredential(credential), label })
      });
      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyPayload.success) {
        throw new Error(verifyPayload.message || "Passkey belum dapat disimpan.");
      }

      setPasskeyMessage("Passkey berhasil didaftarkan.");
      await loadPasskeys();
    } catch (error) {
      setPasskeyError(error?.name === "NotAllowedError" ? "Pendaftaran passkey dibatalkan." : (error.message || "Pendaftaran passkey belum berhasil."));
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="Pengaturan" description="Kelola profil akun, passkey, dan password pengguna." breadcrumbs={[{ label: "Pengaturan" }]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-950">Profil Akun</h2>
              <p className="mt-1 text-sm text-slate-500">Informasi sesi pengguna yang sedang aktif.</p>
            </div>
            <RoleBadge role={user?.role} />
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><dt className="label">Username</dt><dd className="mt-1 text-sm text-slate-800">{user?.username || "-"}</dd></div>
            <div><dt className="label">UKPD</dt><dd className="mt-1 text-sm text-slate-800">{user?.nama_ukpd || "-"}</dd></div>
            <div><dt className="label">Wilayah</dt><dd className="mt-1 text-sm text-slate-800">{user?.wilayah || "-"}</dd></div>
            <div><dt className="label">Hak Akses</dt><dd className="mt-1 text-sm text-slate-800">{user?.role || "-"}</dd></div>
          </dl>
        </section>

        <aside className="grid gap-3">
          <button type="button" className="surface flex items-center gap-4 p-4 text-left transition hover:border-dinkes-300 hover:bg-dinkes-50 focus-ring" onClick={() => setActiveModal("change-password")}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-dinkes-50 text-dinkes-800">
              <KeyRound className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-extrabold text-slate-950">Ubah Password</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">Ganti password akun aktif.</span>
            </span>
          </button>
          {isSuperAdmin ? (
            <button type="button" className="surface flex items-center gap-4 p-4 text-left transition hover:border-dinkes-300 hover:bg-dinkes-50 focus-ring" onClick={() => setActiveModal("reset-password")}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-extrabold text-slate-950">Reset Password UKPD</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">Pilih UKPD dan reset ke default.</span>
              </span>
            </button>
          ) : null}
          {isSuperAdmin ? (
            <button type="button" className="surface flex items-center gap-4 p-4 text-left transition hover:border-dinkes-300 hover:bg-dinkes-50 focus-ring" onClick={() => setActiveModal("reset-cpns-password")}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-extrabold text-slate-950">Reset Password CPNS</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">Pilih NRK dan reset ke default.</span>
              </span>
            </button>
          ) : null}
        </aside>
      </div>

      <section className="surface mt-5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-cyan-50 text-cyan-700">
              <Fingerprint className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Login Biometrik</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Daftarkan passkey perangkat untuk login dengan Finger atau Face.</p>
            </div>
          </div>
          <button type="button" onClick={registerPasskey} disabled={passkeyLoading} className="btn-primary">
            {passkeyLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            Daftarkan Passkey
          </button>
        </div>

        {passkeyMessage ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{passkeyMessage}</p> : null}
        {passkeyError ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{passkeyError}</p> : null}

        <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Passkey Terdaftar</p>
          {passkeys.length ? (
            <div className="mt-3 grid gap-2">
              {passkeys.map((passkey) => (
                <div key={passkey.credential_id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-100">
                  <span className="font-semibold text-slate-800">{passkey.label}</span>
                  <span className="text-xs font-medium text-slate-500">{passkey.last_used_at ? `Dipakai ${passkey.last_used_at}` : `Dibuat ${passkey.created_at}`}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-500">Belum ada passkey. Setelah didaftarkan, tombol Finger/Face di halaman login akan aktif untuk akun ini.</p>
          )}
        </div>
      </section>

      {activeModal === "change-password" ? <ChangePasswordModal onClose={() => setActiveModal("")} /> : null}
      {activeModal === "reset-password" ? <ResetUkpdPasswordModal targets={resetTargets} onClose={() => setActiveModal("")} onReload={loadResetTargets} /> : null}
      {activeModal === "reset-cpns-password" ? <ResetCpnsPasswordModal targets={resetCpnsTargets} onClose={() => setActiveModal("")} onReload={loadResetCpnsTargets} /> : null}
    </>
  );
}
