import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret, getSessionJwtClaims } from "@/lib/auth/sessionConfig";

const protectedRoutes = [
  "/dashboard",
  "/pegawai",
  "/pejabat",
  "/surat-masuk",
  "/peta-jabatan",
  "/history",
  "/usulan",
  "/import-pegawai",
  "/import-drh",
  "/duk",
  "/profil",
];
const protectedDocumentPattern = /\.(?:csv|doc|docx|pdf|xls|xlsx|zip)$/i;
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const cpnsApiRoutes = [
  "/api/usulan/cpns-pns",
  "/api/auth/cpns",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/health",
];
const roleRules = {
  "/pejabat": ["SUPER_ADMIN"],
  "/surat-masuk": ["SUPER_ADMIN"],
  "/import-pegawai": ["SUPER_ADMIN", "ADMIN_UKPD"],
  "/import-drh": ["SUPER_ADMIN", "ADMIN_UKPD"],
  "/usulan/cpns-pns": ["SUPER_ADMIN", "ADMIN_UKPD", "CPNS"],
  "/usulan": ["SUPER_ADMIN", "ADMIN_WILAYAH", "ADMIN_UKPD"],
};

function matchesRoute(pathname, route) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function getAllowedOrigins(request) {
  const origins = new Set([request.nextUrl.origin]);
  for (const value of [process.env.APP_ORIGIN, process.env.ALLOWED_ORIGINS]) {
    String(value || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .forEach((origin) => origins.add(origin));
  }
  return origins;
}

function getRequestOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function validateApiCsrf(request) {
  if (request.nextUrl.pathname.startsWith("/api/surat-masuk/automation/")) return null;
  if (
    !request.nextUrl.pathname.startsWith("/api/") ||
    safeMethods.has(request.method)
  )
    return null;
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin && process.env.NODE_ENV !== "production") return null;
  if (getAllowedOrigins(request).has(requestOrigin)) return null;
  return NextResponse.json(
    {
      success: false,
      message: "Permintaan ditolak karena origin tidak valid.",
      errors: null,
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function verify(token) {
  try {
    const { issuer, audience } = getSessionJwtClaims();
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer,
      audience,
    });
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const csrfError = validateApiCsrf(request);
  if (csrfError) return csrfError;

  if (pathname.startsWith("/api/")) {
    const token = request.cookies.get("sdm_session")?.value;
    const user = token ? await verify(token) : null;
    if (
      user?.role === "CPNS" &&
      !cpnsApiRoutes.some((route) => pathname.startsWith(route))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Anda tidak memiliki akses ke fitur ini.",
          errors: null,
        },
        { status: 403, headers: { "Cache-Control": "no-store, private" } },
      );
    }
  }

  const needsAuth =
    protectedRoutes.some((route) => matchesRoute(pathname, route)) ||
    protectedDocumentPattern.test(pathname);
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get("sdm_session")?.value;
  const user = await verify(token);
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/usulan/cpns-pns")
      ? "/usulan_cpns_to_pns"
      : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user.role === "CPNS" && !pathname.startsWith("/usulan/cpns-pns")) {
    const url = request.nextUrl.clone();
    url.pathname = "/usulan/cpns-pns";
    return NextResponse.redirect(url);
  }

  const rule = Object.entries(roleRules).find(([route]) =>
    matchesRoute(pathname, route),
  );
  if (rule && !rule[1].includes(user.role)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
