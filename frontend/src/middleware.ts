import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  // E2E test mode: bypass auth redirect when explicitly enabled via env var.
  // Never set PLAYWRIGHT_TEST=1 in production. This lives inside the auth()
  // wrapper (not a ternary on the default export) so hot-reload behaves.
  if (process.env.PLAYWRIGHT_TEST === "1") {
    return NextResponse.next();
  }
  // Redirect unauthenticated users to /login
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  // Only protect pages that are meaningless or dangerous without an identity:
  // profile settings, admin panel, and the pending-approval holding page.
  // Reading and importing public-domain books requires no login.
  matcher: [
    "/(profile|admin|pending)(.*)",
  ],
};
