import { z } from "zod";
import { requireAuth } from "@/lib/auth/requireAuth";
import { listCpnsPasswordTargets, resetCpnsPasswordToDefault } from "@/lib/auth/accountPasswords";
import { PASSWORD_POLICY_TEXT } from "@/lib/auth/passwordPolicy";
import { ROLES } from "@/lib/constants/roles";
import { writeAuditLog } from "@/lib/security/auditLog";
import { fail, ok } from "@/lib/helpers/response";

const resetSchema = z.object({
  nrk: z.string().trim().regex(/^\d{4,20}$/)
});

export async function GET(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  try {
    return ok({
      rows: await listCpnsPasswordTargets(),
      policy: PASSWORD_POLICY_TEXT,
      defaultEnv: process.env.CPNS_DEFAULT_PASSWORD ? "CPNS_DEFAULT_PASSWORD" : "UKPD_DEFAULT_PASSWORD"
    });
  } catch (err) {
    console.error("List CPNS password targets error:", err.message);
    return fail("Daftar CPNS belum dapat dimuat.", 500);
  }
}

export async function POST(request) {
  const { user, error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Payload reset password tidak valid.", 400);
  }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) return fail("NRK CPNS wajib dipilih.", 422, parsed.error.flatten());

  try {
    const result = await resetCpnsPasswordToDefault(parsed.data.nrk);
    if (!result.ok) return fail(result.message, result.status || 400, result.errors || null);

    await writeAuditLog({
      request,
      user,
      action: "admin.password.reset_default",
      entityType: "cpns",
      entityId: result.target.id_pegawai,
      metadata: {
        nrk: result.target.nrk,
        nama: result.target.nama,
        namaUkpd: result.target.nama_ukpd,
        defaultEnv: result.defaultEnv
      }
    });

    return ok({ target: result.target, defaultEnv: result.defaultEnv }, "Password CPNS berhasil direset ke default.");
  } catch (err) {
    console.error("Reset CPNS password error:", err.message);
    return fail("Password CPNS belum dapat direset.", 500);
  }
}
