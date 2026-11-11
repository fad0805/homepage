import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hasAuthCookie =
    request.cookies.has("access_token") ||
    request.cookies.has("refresh_token");

  if (!hasAuthCookie) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/memo",
    "/memo/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
