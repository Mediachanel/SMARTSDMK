import { z } from "zod";
import { requestCpnsOtp } from "@/lib/auth/cpnsActivation";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { fail, ok } from "@/lib/helpers/response";

const schema = z.object({
  nrk: z
    .string()
    .trim()
    .regex(/^\d{4,20}$/),
});

export async function POST(request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("NRK wajib diisi dengan benar.", 422);
  try {
    const result = await requestCpnsOtp(parsed.data.nrk);
    if (!result.ok) return fail(result.message, result.status);
    return ok(
      { maskedEmail: result.maskedEmail },
      `Kode OTP telah dikirim ke ${result.maskedEmail}.`,
    );
  } catch (error) {
    console.error("CPNS OTP request error:", error.message);
    return fail(
      "OTP email belum dapat dikirim. Coba kembali atau hubungi administrator.",
      503,
    );
  }
}
