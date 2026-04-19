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
  // Protect everything except the home page, login page, NextAuth API routes,
  // and static assets. The home page (/) is public; auth is required only when
  // a user actually tries to open a book.
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).+)",
  ],
};
