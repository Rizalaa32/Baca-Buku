import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  isAllowedEmail,
  serverAuthOptions,
  type ServerSessionWithToken,
} from "./config";

export class AuthHttpError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthHttpError";
    this.status = status;
  }
}

export interface AuthorizedContext {
  email: string;
  name: string | null;
  image: string | null;
  accessToken: string;
}

/**
 * Memastikan request berasal dari single-user yang terdaftar di ALLOWED_EMAIL
 * dan memiliki Google OAuth access_token yang masih valid.
 */
export async function requireAuthorizedSession(): Promise<AuthorizedContext> {
  const session = (await getServerSession(
    serverAuthOptions
  )) as ServerSessionWithToken | null;

  if (!session?.user?.email) {
    throw new AuthHttpError("Sesi login tidak ditemukan. Silakan masuk kembali.", 401);
  }

  if (!isAllowedEmail(session.user.email)) {
    throw new AuthHttpError("Akses ditolak: email tidak terdaftar dalam whitelist.", 403);
  }

  if (session.error === "RefreshAccessTokenError" || !session.accessToken) {
    throw new AuthHttpError(
      "Sesi Google Drive telah berakhir. Silakan login ulang untuk memperbarui izin.",
      401
    );
  }

  return {
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    accessToken: session.accessToken,
  };
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof AuthHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[API Error]", error);
  const message =
    error instanceof Error ? error.message : "Terjadi kesalahan internal pada server.";
  return NextResponse.json({ error: message }, { status: 500 });
}

