import { NextResponse, type NextRequest } from "next/server";
import {
  handleRouteError,
  requireAuthorizedSession,
} from "@/lib/auth/session";
import {
  DriveApiError,
  listBooksFromDriveFolder,
} from "@/lib/drive/client";
import { syncDriveBooksWithSupabase } from "@/lib/supabase/queries";
import type { LibraryBookItem } from "@/types/database";

export const dynamic = "force-dynamic";

function sortAndFilterBooks(
  books: LibraryBookItem[],
  fileTypeFilter: string | null,
  sortBy: string | null
): LibraryBookItem[] {
  let result = [...books];

  if (fileTypeFilter === "epub" || fileTypeFilter === "pdf") {
    result = result.filter((b) => b.fileType === fileTypeFilter);
  }

  if (sortBy === "title") {
    result.sort((a, b) => a.title.localeCompare(b.title, "id"));
  } else {
    // Default: Terakhir Dibaca (buku yang sedang dibaca tampil paling atas, diikuti modifiedTime)
    result.sort((a, b) => {
      const aRead = a.progress?.lastReadAt
        ? new Date(a.progress.lastReadAt).getTime()
        : 0;
      const bRead = b.progress?.lastReadAt
        ? new Date(b.progress.lastReadAt).getTime()
        : 0;

      if (bRead !== aRead) {
        return bRead - aRead;
      }

      const aMod = a.driveModifiedTime
        ? new Date(a.driveModifiedTime).getTime()
        : 0;
      const bMod = b.driveModifiedTime
        ? new Date(b.driveModifiedTime).getTime()
        : 0;
      return bMod - aMod;
    });
  }

  return result;
}

export async function GET(request: NextRequest) {
  try {
    const { accessToken } = await requireAuthorizedSession();
    const { searchParams } = request.nextUrl;
    const typeFilter = searchParams.get("type");
    const sortBy = searchParams.get("sort");

    const driveBooks = await listBooksFromDriveFolder(accessToken);
    const mergedLibrary = await syncDriveBooksWithSupabase(driveBooks);
    const finalBooks = sortAndFilterBooks(mergedLibrary, typeFilter, sortBy);

    return NextResponse.json({
      books: finalBooks,
      count: finalBooks.length,
      syncedAt: new Date().toISOString(),
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

