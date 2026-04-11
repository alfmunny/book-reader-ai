import { auth } from "@/auth";
import { NextResponse, NextRequest } from "next/server";

// E2E test mode: bypass auth redirect when explicitly enabled via env var.
// Never set PLAYWRIGHT_TEST=1 in production.
const E2E_BYPASS = process.env.PLAYWRIGHT_TEST === "1";

export default E2E_BYPASS
  ? (_req: NextRequest) => NextResponse.next()
  : auth((req) => {
      if (!req.auth) {
        return NextResponse.redirect(new URL("/login", req.url));
      }
    });

export const config = {
  // Protect everything except the login page, NextAuth API routes, and static assets
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
