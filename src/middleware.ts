import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware performs a *presence* check only (it cannot read the database).
 * Every page and route handler re-validates the session server-side; this is
 * purely a fast redirect for unauthenticated visitors.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("veltrix_session");
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/app") && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login"],
};
