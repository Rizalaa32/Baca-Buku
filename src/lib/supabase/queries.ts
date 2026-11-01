import "server-only";
import { getSupabaseAdmin } from "./admin";
import type {
  BookMetadataRow,
  LibraryBookItem,
  ReadingProgressRow,
} from "@/types/database";
import type { NormalizedDriveBook } from "@/types/drive";

/**
 * Menyinkronkan daftar buku dari Google Drive ke tabel `books_metadata` secara hemat kuota
 * (hanya melakukan UPSERT untuk buku baru atau yang metadatanya berubah), lalu menggabungkannya
 * dengan data `reading_progress` untuk ditampilkan di Rak Buku.
 */
export async function syncDriveBooksWithSupabase(
  driveBooks: NormalizedDriveBook[]
): Promise<LibraryBookItem[]> {
  if (driveBooks.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const driveIds = driveBooks.map((b) => b.googleFileId);

  const [metadataResult, progressResult] = await Promise.all([
    supabase
      .from("books_metadata")
      .select("*")
      .in("google_file_id", driveIds),
    supabase
      .from("reading_progress")
      .select("*")
      .in("google_file_id", driveIds),
  ]);

  if (metadataResult.error) {
    throw new Error(
      `Gagal membaca books_metadata dari Supabase: ${metadataResult.error.message}`
    );
  }
  if (progressResult.error) {
    throw new Error(
      `Gagal membaca reading_progress dari Supabase: ${progressResult.error.message}`
    );
  }

  const existingMap = new Map<string, BookMetadataRow>();
  for (const row of (metadataResult.data ?? []) as BookMetadataRow[]) {
    existingMap.set(row.google_file_id, row);
  }

  const rowsToUpsert: Array<{
    google_file_id: string;
    title: string;
    file_type: "epub" | "pdf";
    cover_url: string | null;
    file_size_bytes: number | null;
    drive_modified_time: string;
  }> = [];

  for (const book of driveBooks) {
    const existing = existingMap.get(book.googleFileId);
    const proxyCoverUrl = book.thumbnailLink
      ? `/api/drive/thumbnail/${encodeURIComponent(book.googleFileId)}`
      : null;

    const needsSync =
      !existing ||
      existing.drive_modified_time !== book.modifiedTime ||
      existing.cover_url !== proxyCoverUrl ||
      existing.file_size_bytes !== book.sizeBytes;

    if (needsSync) {
      rowsToUpsert.push({
        google_file_id: book.googleFileId,
        // Pertahankan judul di DB bila sudah pernah disunting sebelumnya
        title: existing?.title ?? book.title,
        file_type: book.fileType,
        cover_url: proxyCoverUrl,
        file_size_bytes: book.sizeBytes,
        drive_modified_time: book.modifiedTime,
      });
    }
  }

  if (rowsToUpsert.length > 0) {
    const { data: upsertedRows, error: upsertError } = await supabase
      .from("books_metadata")
      .upsert(rowsToUpsert, { onConflict: "google_file_id" })
      .select("*");

    if (upsertError) {
      throw new Error(
        `Gagal menyinkronkan books_metadata ke Supabase: ${upsertError.message}`
      );
    }

    for (const row of (upsertedRows ?? []) as BookMetadataRow[]) {
      existingMap.set(row.google_file_id, row);
    }
  }

  const progressMap = new Map<string, ReadingProgressRow>();
  for (const p of (progressResult.data ?? []) as ReadingProgressRow[]) {
    progressMap.set(p.google_file_id, p);
  }

  return driveBooks.map((driveBook) => {
    const meta = existingMap.get(driveBook.googleFileId);
    const prog = progressMap.get(driveBook.googleFileId);

    return {
      id: meta?.id ?? driveBook.googleFileId,
      googleFileId: driveBook.googleFileId,
      title: meta?.title ?? driveBook.title,
      fileType: meta?.file_type ?? driveBook.fileType,
      totalPagesOrLocations: meta?.total_pages_or_locations ?? null,
      coverUrl:
        meta?.cover_url ??
        (driveBook.thumbnailLink
          ? `/api/drive/thumbnail/${encodeURIComponent(driveBook.googleFileId)}`
          : null),
      fileSizeBytes: meta?.file_size_bytes ?? driveBook.sizeBytes,
      driveModifiedTime: meta?.drive_modified_time ?? driveBook.modifiedTime,
      progress: prog
        ? {
            currentLocation: prog.current_location,
            percentage: prog.percentage,
            lastReadAt: prog.last_read_at,
          }
        : null,
    };
  });
}

