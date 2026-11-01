"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, FolderOpen, RefreshCw } from "lucide-react";
import { BookCard } from "@/components/library/book-card";
import { ContinueReadingBanner } from "@/components/library/continue-reading-banner";
import { LibraryHeader } from "@/components/library/library-header";
import {
  LibraryToolbar,
  type FileTypeFilter,
  type LibrarySortOption,
} from "@/components/library/library-toolbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LibraryBookItem } from "@/types/database";

export function BookshelfClient() {
  const [books, setBooks] = useState<LibraryBookItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>("all");
  const [sortBy, setSortBy] = useState<LibrarySortOption>("last_read");

  const fetchBooks = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsSyncing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/drive/files", {
        method: "GET",
        cache: "no-store",
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.error ?? `Gagal memuat rak buku (HTTP ${response.status}).`
        );
      }

      setBooks((payload.books ?? []) as LibraryBookItem[]);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menghubungi server."
      );
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    void fetchBooks(false);
  }, [fetchBooks]);

  const counts = useMemo(() => {
    let epub = 0;
    let pdf = 0;
    for (const b of books) {
      if (b.fileType === "epub") epub++;
      else if (b.fileType === "pdf") pdf++;
    }
    return { all: books.length, epub, pdf };
  }, [books]);

  // Buku terakhir yang sedang aktif dibaca (0 < % < 100)
  const activeReadingBook = useMemo(() => {
    const candidates = books.filter(
      (b) => b.progress && b.progress.percentage > 0 && b.progress.percentage < 100
    );
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const aTime = new Date(a.progress?.lastReadAt ?? 0).getTime();
      const bTime = new Date(b.progress?.lastReadAt ?? 0).getTime();
      return bTime - aTime;
    });
    return candidates[0];
  }, [books]);

  const filteredAndSortedBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = books.filter((book) => {
      if (fileTypeFilter !== "all" && book.fileType !== fileTypeFilter) {
        return false;
      }
      if (q && !book.title.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title, "id");
      }

      if (sortBy === "drive_recent") {
        const aMod = new Date(a.driveModifiedTime ?? 0).getTime();
        const bMod = new Date(b.driveModifiedTime ?? 0).getTime();
        return bMod - aMod;
      }

      // Default: Terakhir Dibaca
      const aRead = a.progress?.lastReadAt
        ? new Date(a.progress.lastReadAt).getTime()
        : 0;
      const bRead = b.progress?.lastReadAt
        ? new Date(b.progress.lastReadAt).getTime()
        : 0;
      if (bRead !== aRead) return bRead - aRead;

      const aMod = new Date(a.driveModifiedTime ?? 0).getTime();
      const bMod = new Date(b.driveModifiedTime ?? 0).getTime();
      return bMod - aMod;
    });

    return filtered;
  }, [books, searchQuery, fileTypeFilter, sortBy]);

  return (
    <div className="min-h-screen bg-background">
      <LibraryHeader
        totalBooks={books.length}
        isSyncing={isSyncing}
        onRefresh={() => void fetchBooks(true)}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Banner Lanjutkan Membaca */}
        {!isLoading && !error && activeReadingBook && !searchQuery && (
          <ContinueReadingBanner book={activeReadingBook} />
        )}

        {/* Toolbar Pencarian, Filter Tipe, dan Sortir */}
        <LibraryToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          fileTypeFilter={fileTypeFilter}
          onFileTypeChange={setFileTypeFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          counts={counts}
        />

        {/* Error State */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 dark:border-red-900/50 dark:bg-red-950/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
                  Gagal menyinkronkan Rak Buku
                </h3>
                <p className="text-sm text-red-800/90 dark:text-red-300/90">
                  {error}
                </p>
                <p className="text-xs text-red-700/80 dark:text-red-400/80">
                  Pastikan migrasi SQL di Supabase sudah dijalankan dan folder{" "}
                  <code className="rounded bg-red-100 px-1 py-0.5 dark:bg-red-900/60">
                    GOOGLE_DRIVE_FOLDER_ID
                  </code>{" "}
                  dapat diakses oleh akun Google Anda.
                </p>
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void fetchBooks(true)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Coba Lagi
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Skeleton Loading Grid */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="flex flex-col overflow-hidden rounded-2xl border bg-card"
              >
                <Skeleton className="aspect-[2/3] w-full rounded-none" />
                <div className="space-y-2.5 p-3.5">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="mt-2 h-1.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredAndSortedBooks.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FolderOpen className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold">
              {books.length === 0
                ? "Belum ada buku di folder Google Drive Anda"
                : "Tidak ada buku yang cocok dengan filter pencarian"}
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {books.length === 0
                ? "Unggah file berformat .epub atau .pdf ke folder Google Drive Anda, lalu tekan tombol Sinkronkan Drive."
                : "Coba ubah kata kunci pencarian atau pilih kategori tipe file lainnya."}
            </p>
          </div>
        )}

        {/* Grid Responsif Rak Buku */}
        {!isLoading && !error && filteredAndSortedBooks.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredAndSortedBooks.map((book) => (
              <BookCard key={book.googleFileId} book={book} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

