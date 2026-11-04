"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PegawaiForm from "@/components/forms/PegawaiForm";
import PageHeader from "@/components/layout/PageHeader";
import ErrorState from "@/components/ui/ErrorState";

async function readApiPayload(response) {
  const raw = await response.text();
  if (!raw) {
    throw new Error("Respons API kosong.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(raw.slice(0, 200) || "Respons API tidak valid.");
  }
}

export default function EditPegawaiPage() {
  const routeParams = useParams();
  const pegawaiId = routeParams?.id;
  const [pegawai, setPegawai] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!pegawaiId) return;

    let cancelled = false;

    async function loadPegawai() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/pegawai/${pegawaiId}`, { cache: "no-store" });
        const payload = await readApiPayload(response);
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Data pegawai tidak dapat dimuat.");
        }
        if (!cancelled) setPegawai(payload.data);
      } catch (loadError) {
        if (!cancelled) {
          setPegawai(null);
          setError(loadError.message || "Terjadi kesalahan saat memuat data pegawai.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPegawai();
    return () => {
      cancelled = true;
    };
  }, [pegawaiId, refreshKey]);

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white" />;

  if (error) {
    return (
      <>
        <PageHeader title="Edit Pegawai" description="Gagal memuat data" breadcrumbs={[{ label: "Data Pegawai", href: "/pegawai" }, { label: "Edit" }]} />
        <ErrorState description={error} onRetry={() => setRefreshKey((value) => value + 1)} />
      </>
    );
  }

  if (!pegawai) {
    return (
      <>
        <PageHeader title="Edit Pegawai" description="Data tidak ditemukan" breadcrumbs={[{ label: "Data Pegawai", href: "/pegawai" }, { label: "Edit" }]} />
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
          Data pegawai belum tersedia.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Edit Pegawai" description={pegawai.nama} breadcrumbs={[{ label: "Data Pegawai", href: "/pegawai" }, { label: "Edit" }]} />
      <PegawaiForm initialData={pegawai} mode="edit" />
    </>
  );
}
