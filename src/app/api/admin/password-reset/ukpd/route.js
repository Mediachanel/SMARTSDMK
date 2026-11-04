import { z } from "zod";
import { requireAuth } from "@/lib/auth/requireAuth";
import { listUkpdPasswordTargets, resetUkpdPasswordToDefault } from "@/lib/auth/accountPasswords";
import { PASSWORD_POLICY_TEXT } from "@/lib/auth/passwordPolicy";
import { ROLES } from "@/lib/constants/roles";
import { writeAuditLog } from "@/lib/security/auditLog";
import { fail, ok } from "@/lib/helpers/response";

const resetSchema = z.object({
  ukpdId: z.coerce.number().int().positive()
});

export async function GET(request) {
  const { error } = await requireAuth([ROLES.SUPER_ADMIN], request);
  if (error) return error;

  try {
    return ok({
      rows: await listUkpdPasswordTargets(),
      policy: PASSWORD_POLICY_TEXT,
      defaultEnv: "UKPD_DEFAULT_PASSWORD"
    });
  } catch (err) {
    console.error("List UKPD password targets error:", err.message);
    return fail("Daftar UKPD belum dapat dimuat.", 500);
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
  if (!parsed.success) return fail("UKPD wajib dipilih.", 422, parsed.error.flatten());

  try {
    const result = await resetUkpdPasswordToDefault(parsed.data.ukpdId);
    if (!result.ok) return fail(result.message, result.status || 400, result.errors || null);

    await writeAuditLog({
      request,
      user,
      action: "admin.password.reset_default",
      entityType: "ukpd",
      entityId: result.target.id_ukpd,
      metadata: { namaUkpd: result.target.nama_ukpd, defaultEnv: "UKPD_DEFAULT_PASSWORD" }
    });

    return ok({ target: result.target, defaultEnv: "UKPD_DEFAULT_PASSWORD" }, "Password UKPD berhasil direset ke default.");
  } catch (err) {
    console.error("Reset UKPD password error:", err.message);
    return fail("Password UKPD belum dapat direset.", 500);
  }
}
