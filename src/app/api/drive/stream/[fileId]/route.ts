import { NextResponse, type NextRequest } from "next/server";
import {
  handleRouteError,
  requireAuthorizedSession,
} from "@/lib/auth/session";
import {
  DriveApiError,
  fetchDriveFileBinaryStream,
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
 * Streaming binary file buku (.epub / .pdf) langsung dari Google Drive ke browser.
 * Menggunakan Web ReadableStream passthrough (tanpa menyimpan ke disk / RAM Vercel)
 * serta meneruskan HTTP Range Header (206 Partial Content).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { accessToken } = await requireAuthorizedSession();
    const { fileId } = params;

    if (!fileId) {
      return NextResponse.json(
        { error: "Parameter fileId wajib diisi." },
        { status: 400 }
      );
    }

    // 1. Validasi bahwa file berada di GOOGLE_DRIVE_FOLDER_ID & berformat EPUB/PDF
    const metadata = await getVerifiedDriveBookMetadata(accessToken, fileId);

    // 2. Teruskan Range header bila browser / PDF.js meminta chunk parsial
    const rangeHeader = request.headers.get("range");
    const upstream = await fetchDriveFileBinaryStream(
      accessToken,
      fileId,
      rangeHeader
    );

    if (!upstream.body) {
      return NextResponse.json(
        { error: "Stream kosong dari Google Drive." },
        { status: 502 }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", metadata.mimeType);
    responseHeaders.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(metadata.rawFileName)}"`
    );
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("X-Drive-Modified-Time", metadata.modifiedTime);
    responseHeaders.set("X-Book-File-Type", metadata.fileType);

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) {
      responseHeaders.set("Content-Range", contentRange);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
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

