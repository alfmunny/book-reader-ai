import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account }) {
      // Only runs on initial sign-in when account is present
      if (account?.id_token) {
        try {
          const res = await fetch(`${API}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_token: account.id_token }),
          });
          if (res.ok) {
            const data = await res.json();
            token.backendToken = data.token;
            token.backendUser = data.user;
          }
        } catch {
          // Backend unreachable — token will be missing, user hits auth error
        }
      }
      return token;
    },
    session({ session, token }) {
      session.backendToken = token.backendToken as string;
      session.backendUser = token.backendUser as {
        id: number;
        email: string;
        name: string;
        picture: string;
        hasGeminiKey: boolean;
      };
      return session;
    },
  },
});
