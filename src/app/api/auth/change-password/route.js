import { z } from "zod";
import { requireAuth } from "@/lib/auth/requireAuth";
import { changeCurrentUserPassword } from "@/lib/auth/accountPasswords";
import { PASSWORD_POLICY_TEXT } from "@/lib/auth/passwordPolicy";
import { writeAuditLog } from "@/lib/security/auditLog";
import { fail, ok } from "@/lib/helpers/response";

const schema = z.object({
  currentPassword: z.string().min(1, "Password lama wajib diisi."),
  newPassword: z.string().min(1, "Password baru wajib diisi."),
  confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi.")
});

export async function POST(request) {
  const { user, error } = await requireAuth([], request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Payload ubah password tidak valid.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Payload ubah password tidak valid.", 422, parsed.error.flatten());
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return fail("Konfirmasi password baru tidak sama.", 422);
  }

  try {
    const result = await changeCurrentUserPassword({
      user,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword
    });
    if (!result.ok) {
      return fail(result.message, result.status || 400, result.errors || null);
    }

    await writeAuditLog({
      request,
      user,
      action: "auth.password.change",
      entityType: result.record.table,
      entityId: result.record.id,
      metadata: { username: result.record.username, namaUkpd: result.record.namaUkpd }
    });

    return ok({ policy: PASSWORD_POLICY_TEXT }, "Password berhasil diubah.");
  } catch (err) {
    console.error("Change password error:", err.message);
    return fail("Password belum dapat diubah. Coba lagi atau hubungi administrator.", 500);
  }
}
