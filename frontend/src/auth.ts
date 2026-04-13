import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Apple from "next-auth/providers/apple";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? process.env.AUTH_GITHUB_SECRET,
    }),
    Apple({
      clientId: process.env.AUTH_APPLE_ID ?? "",
      clientSecret: process.env.AUTH_APPLE_SECRET ?? "",
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Only runs on initial sign-in when account is present
      if (account) {
        try {
          let res: Response;
          if (account.provider === "google" && account.id_token) {
            res = await fetch(`${API}/auth/google`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id_token: account.id_token }),
            });
          } else if (account.provider === "github") {
            const ghProfile = profile as { id?: number; login?: string; avatar_url?: string; email?: string; name?: string } | undefined;
            res = await fetch(`${API}/auth/github`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                github_id: String(ghProfile?.id ?? account.providerAccountId),
                email: ghProfile?.email ?? token.email ?? "",
                name: ghProfile?.name ?? ghProfile?.login ?? "",
                picture: ghProfile?.avatar_url ?? "",
              }),
            });
          } else if (account.provider === "apple" && account.id_token) {
            const appleProfile = profile as { name?: { firstName?: string; lastName?: string } } | undefined;
            const name = [appleProfile?.name?.firstName, appleProfile?.name?.lastName]
              .filter(Boolean)
              .join(" ");
            res = await fetch(`${API}/auth/apple`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id_token: account.id_token, name }),
            });
          } else {
            return token;
          }
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
