import { NextResponse, type NextRequest } from "next/server";

function contentSecurityPolicy(nonce: string) {
  const scriptSources =
    process.env.NODE_ENV === "development"
      ? `'self' 'unsafe-eval' 'nonce-${nonce}'`
      : `'self' 'nonce-${nonce}'`;

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(process.env.NODE_ENV === "development"
      ? []
      : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function withSecurityHeaders(
  response: NextResponse,
  csp: string,
) {
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const requiresAuth =
    pathname === "/memo" ||
    pathname.startsWith("/memo/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  if (requiresAuth) {
    const hasAuthCookie =
      request.cookies.has("access_token") ||
      request.cookies.has("refresh_token");

    if (!hasAuthCookie) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL("/signin", request.url)),
        csp,
      );
    }
  }

  return withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    csp,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads|api|.*\\..*).*)",
  ],
};
