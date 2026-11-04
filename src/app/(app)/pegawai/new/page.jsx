import PageHeader from "@/components/layout/PageHeader";
import PegawaiForm from "@/components/forms/PegawaiForm";

export default function NewPegawaiPage() {
  return (
    <>
      <PageHeader title="Tambah Pegawai" description="Lengkapi data pegawai beserta alamat dan keluarga sesuai struktur database aktif." breadcrumbs={[{ label: "Data Pegawai", href: "/pegawai" }, { label: "Tambah" }]} />
      <PegawaiForm />
    </>
  );
}
