import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    backendToken: string;
    backendUser: {
      id: number;
      email: string;
      name: string;
      picture: string;
      hasGeminiKey: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    backendUser?: unknown;
  }
}
