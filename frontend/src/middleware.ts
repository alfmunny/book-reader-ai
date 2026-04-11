import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  // Redirect unauthenticated users to /login
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
