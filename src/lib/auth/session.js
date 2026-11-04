import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { getJwtSecret, getSessionJwtClaims } from "@/lib/auth/sessionConfig";

const COOKIE_NAME = "sdm_session";

export async function signSession(user) {
  const { issuer, audience } = getSessionJwtClaims();
  return new SignJWT({
    id: user.id,
    id_pegawai: user.id_pegawai,
    username: user.username,
    nama: user.nama,
    nama_ukpd: user.nama_ukpd,
    role: user.role,
    wilayah: user.wilayah,
    auth_source: user.auth_source
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { issuer, audience } = getSessionJwtClaims();
    const { payload } = await jwtVerify(token, getJwtSecret(), { issuer, audience });
    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return verifySession(token);
}

export function sessionCookieName() {
  return COOKIE_NAME;
}
