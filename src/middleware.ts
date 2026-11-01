import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

function isWhitelisted(email?: string | null): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isLoginPage = pathname.startsWith("/login");

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Jika user sudah login dengan email valid dan membuka /login, arahkan ke Rak Buku
  if (isLoginPage) {
    if (token?.email && isWhitelisted(token.email)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Belum login
  if (!token?.email) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Login tapi email bukan ALLOWED_EMAIL
  if (!isWhitelisted(token.email)) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/login?error=AccessDenied", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Lindungi seluruh halaman & API kecuali:
     * - /api/auth/* (NextAuth endpoints)
     * - /_next/static & /_next/image
     * - file aset publik & PWA (manifest.json, sw.js, workbox-*.js, icons, favicon.ico)
     */
    "/((?!api/auth|_next/static|_next/image|icons|manifest\\.json|sw\\.js|workbox-.*|swe-worker-.*|favicon\\.ico).*)",
  ],
};

