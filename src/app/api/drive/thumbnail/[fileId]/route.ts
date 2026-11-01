import { NextResponse, type NextRequest } from "next/server";
import {
  handleRouteError,
  requireAuthorizedSession,
} from "@/lib/auth/session";
import {
  DriveApiError,
  getVerifiedDriveBookMetadata,
} from "@/lib/drive/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    fileId: string;
  };
}

/**
 * Proxy cover/thumbnail buku dari Google Drive agar tidak terkendala CORS/403 di browser
 * dan dapat di-cache secara privat oleh browser.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accessToken } = await requireAuthorizedSession();
    const { fileId } = params;

    const metadata = await getVerifiedDriveBookMetadata(accessToken, fileId);
    if (!metadata.rawThumbnailLink) {
      return new NextResponse(null, { status: 404 });
    }

    const thumbResponse = await fetch(metadata.rawThumbnailLink, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!thumbResponse.ok || !thumbResponse.body) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(thumbResponse.body, {
      status: 200,
      headers: {
        "Content-Type":
          thumbResponse.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    if (error instanceof DriveApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return handleRouteError(error);
  }
}

