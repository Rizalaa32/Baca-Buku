import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

const GOOGLE_DRIVE_SCOPE = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export function isAllowedEmail(email?: string | null): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

async function refreshGoogleAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshAccessTokenError" };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
      cache: "no-store",
    });

    const refreshed = await response.json();

    if (!response.ok) {
      throw refreshed;
    }

    return {
      ...token,
      accessToken: refreshed.access_token as string,
      expiresAt: Math.floor(Date.now() / 1000) + Number(refreshed.expires_in ?? 3600),
      refreshToken: (refreshed.refresh_token as string | undefined) ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("[Auth] Gagal me-refresh Google access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 hari
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: GOOGLE_DRIVE_SCOPE,
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const candidateEmail = profile?.email ?? user?.email;
      if (!isAllowedEmail(candidateEmail)) {
        console.warn(`[Auth] Login ditolak untuk email di luar whitelist: ${candidateEmail}`);
        return "/login?error=AccessDenied";
      }
      return true;
    },

    async jwt({ token, account }) {
      // Login pertama kali: simpan access_token, refresh_token, dan waktu kedaluwarsa
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token ?? token.refreshToken,
          expiresAt:
            account.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
          error: undefined,
        };
      }

      // Perbarui token 60 detik sebelum benar-benar kedaluwarsa
      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (token.expiresAt && nowInSeconds < token.expiresAt - 60) {
        return token;
      }

      return refreshGoogleAccessToken(token);
    },

    async session({ session, token }) {
      // Jangan kirim accessToken ke browser demi keamanan;
      // token hanya dibaca di server melalui serverAuthOptions.
      return {
        ...session,
        error: token.error,
      };
    },
  },
};

export interface ServerSessionWithToken extends Session {
  accessToken?: string;
}

export const serverAuthOptions: NextAuthOptions = {
  ...authOptions,
  callbacks: {
    ...authOptions.callbacks,
    async session({ session, token }) {
      const serverSession: ServerSessionWithToken = {
        ...session,
        accessToken: token.accessToken,
        error: token.error,
      };
      return serverSession;
    },
  },
};

