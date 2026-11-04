import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth/session";
import { validateSameOrigin } from "@/lib/auth/requestGuards";
import { getSessionCookieOptions } from "@/lib/auth/sessionConfig";

export async function POST(request) {
  const originError = validateSameOrigin(request);
  if (originError) return originError;

  const response = NextResponse.json({ success: true, message: "Logout berhasil", data: null });
  response.cookies.set(sessionCookieName(), "", getSessionCookieOptions({ maxAge: 0 }));
  return response;
}
