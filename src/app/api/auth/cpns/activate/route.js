import { z } from "zod";
import { activateCpnsPassword } from "@/lib/auth/cpnsActivation";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { fail, ok } from "@/lib/helpers/response";

const schema = z
  .object({
    nrk: z
      .string()
      .trim()
      .regex(/^\d{4,20}$/),
    activationToken: z.string().length(64),
    password: z
      .string()
      .min(10)
      .max(72)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/\d/),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Konfirmasi password tidak sama.",
    path: ["confirmation"],
  });

export async function POST(request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return fail(
      "Password minimal 10 karakter dan harus mengandung huruf besar, huruf kecil, serta angka. Konfirmasi harus sama.",
      422,
    );
  try {
    const result = await activateCpnsPassword(
      parsed.data.nrk,
      parsed.data.activationToken,
      parsed.data.password,
    );
    if (!result.ok) return fail(result.message, result.status);
    return ok(null, "Password berhasil dibuat. Silakan login.");
  } catch (error) {
    console.error("CPNS activation error:", error.message);
    return fail("Aktivasi password sedang tidak tersedia.", 503);
  }
}
