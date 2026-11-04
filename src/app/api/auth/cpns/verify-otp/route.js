import { z } from "zod";
import { verifyCpnsOtp } from "@/lib/auth/cpnsActivation";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { fail, ok } from "@/lib/helpers/response";

const schema = z.object({
  nrk: z
    .string()
    .trim()
    .regex(/^\d{4,20}$/),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export async function POST(request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return fail("NRK dan kode OTP enam digit wajib diisi.", 422);
  try {
    const result = await verifyCpnsOtp(parsed.data.nrk, parsed.data.otp);
    if (!result.ok) return fail(result.message, result.status);
    return ok({ activationToken: result.token }, "OTP berhasil diverifikasi.");
  } catch (error) {
    console.error("CPNS OTP verify error:", error.message);
    return fail("Verifikasi OTP sedang tidak tersedia.", 503);
  }
}
