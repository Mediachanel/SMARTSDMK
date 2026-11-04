import { ROLES } from "@/lib/constants/roles";

function normalizeText(value) {
  return String(value || "").trim();
}

export async function validateUkpdWriteScope(pool, user, namaUkpd) {
  const ukpdName = normalizeText(namaUkpd);
  if (!ukpdName) {
    return { allowed: false, message: "Nama UKPD wajib diisi." };
  }

  if (user.role === ROLES.SUPER_ADMIN) {
    return { allowed: true };
  }

  if (user.role === ROLES.ADMIN_UKPD) {
    return {
      allowed: ukpdName === user.nama_ukpd,
      message: "Admin UKPD hanya dapat menyimpan data UKPD sendiri."
    };
  }

  if (user.role === ROLES.ADMIN_WILAYAH) {
    const [rows] = await pool.query(
      "SELECT `wilayah` FROM `ukpd` WHERE `nama_ukpd` = ? LIMIT 1",
      [ukpdName]
    );
    return {
      allowed: rows[0]?.wilayah === user.wilayah,
      message: "Admin Wilayah hanya dapat menyimpan data UKPD di wilayah sendiri."
    };
  }

  return { allowed: false, message: "Role tidak diizinkan mengubah data UKPD." };
}
