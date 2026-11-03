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

    // 1 & 2. Validasi folder/format DAN mulai unduh secara paralel (hemat 1 round-trip ke Drive).
    //    Stream hanya dikembalikan bila validasi lolos; bila gagal, unduhan dibatalkan.
    const rangeHeader = request.headers.get("range");
    const upstreamPromise = fetchDriveFileBinaryStream(
      accessToken,
      fileId,
      rangeHeader
    );
    upstreamPromise.catch(() => undefined);

    let metadata: Awaited<ReturnType<typeof getVerifiedDriveBookMetadata>>;
    try {
      metadata = await getVerifiedDriveBookMetadata(accessToken, fileId);
    } catch (validationError) {
      void upstreamPromise
        .then((res) => res.body?.cancel())
        .catch(() => undefined);
      throw validationError;
    }

    const upstream = await upstreamPromise;

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

