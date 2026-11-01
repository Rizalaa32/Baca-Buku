"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  CheckCircle2,
  CloudUpload,
  List,
  Loader2,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { AiBuddyDrawer } from "@/components/ai/ai-buddy-drawer";
import { EpubSettingsPanel } from "@/components/reader/epub/epub-settings-panel";
import type { EpubReaderHandle } from "@/components/reader/epub/epub-reader-view";
import type { PdfReaderHandle } from "@/components/reader/pdf/pdf-reader-view";
import { BookmarksDrawer } from "@/components/reader/shared/bookmarks-drawer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBookBinaryCache } from "@/hooks/use-book-cache";
import {
  READER_THEME_PALETTES,
  useReaderPreferences,
} from "@/hooks/use-reader-preferences";
import { useReadingSync } from "@/hooks/use-reading-sync";
import { formatBytes } from "@/lib/utils";
import type { BookMetadataRow, ReadingProgressRow } from "@/types/database";

const EpubReaderView = dynamic(
  () =>
    import("@/components/reader/epub/epub-reader-view").then(
      (m) => m.EpubReaderView
    ),
  { ssr: false }
);

const PdfReaderView = dynamic(
  () =>
    import("@/components/reader/pdf/pdf-reader-view").then(
      (m) => m.PdfReaderView
    ),
  { ssr: false }
);

interface ReaderShellProps {
  googleFileId: string;
}

export function ReaderShell({ googleFileId }: ReaderShellProps) {
  const [meta, setMeta] = useState<BookMetadataRow | null>(null);
  const [initialProgress, setInitialProgress] =
    useState<ReadingProgressRow | null>(null);
  const [isMetaLoaded, setIsMetaLoaded] = useState(false);

  const [currentLocation, setCurrentLocation] = useState<string>("");
  const [percentage, setPercentage] = useState<number>(0);

  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const [selectedHighlight, setSelectedHighlight] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [showSelectionBar, setShowSelectionBar] = useState(false);
  const [autoExplainSignal, setAutoExplainSignal] = useState(0);
  const [bookmarkRefreshSignal, setBookmarkRefreshSignal] = useState(0);

  const epubHandleRef = useRef<EpubReaderHandle | null>(null);
  const pdfHandleRef = useRef<PdfReaderHandle | null>(null);

  const { prefs, updatePreferences } = useReaderPreferences();
  const { syncStatus, scheduleSave } = useReadingSync(1500);

  // 1. Ambil metadata & posisi baca terakhir dari Supabase
  useEffect(() => {
    let active = true;
    fetch(`/api/progress?fileId=${encodeURIComponent(googleFileId)}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.metadata) setMeta(data.metadata as BookMetadataRow);
        if (data?.progress) {
          const prog = data.progress as ReadingProgressRow;
          setInitialProgress(prog);
          setCurrentLocation(prog.current_location);
          setPercentage(prog.percentage);
        }
      })
      .catch(() => {
        // Lanjutkan meskipun buku baru belum tercatat di reading_progress
      })
      .finally(() => {
        if (active) setIsMetaLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [googleFileId]);

  // 2. Muat binary buku dari IndexedDB atau stream Google Drive
  const { bookData, isLoading, downloadPercent, loadedBytes, error } =
    useBookBinaryCache(googleFileId, meta?.drive_modified_time);

  const resolvedTitle = meta?.title ?? "Membaca Buku";
  const resolvedFileType = bookData?.fileType ?? meta?.file_type ?? "pdf";

  const handleLocationChange = useCallback(
    (
      location: string,
      nextPct: number,
      totalPagesOrLocations: number | null
    ) => {
      setCurrentLocation(location);
      setPercentage(nextPct);
      scheduleSave({
        googleFileId,
        title: resolvedTitle,
        fileType: resolvedFileType,
        currentLocation: location,
        percentage: nextPct,
        totalPagesOrLocations,
      });
    },
    [googleFileId, resolvedTitle, resolvedFileType, scheduleSave]
  );

  const handleTextSelected = useCallback((text: string, loc: string) => {
    setSelectedHighlight(text);
    setSelectedLocation(loc);
    setShowSelectionBar(true);
  }, []);

  const handleQuickSaveHighlight = async () => {
    if (!selectedHighlight) return;
    await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        googleFileId,
        location: selectedLocation || currentLocation || "1",
        highlightedText: selectedHighlight,
      }),
    });
    setBookmarkRefreshSignal((s) => s + 1);
    setShowSelectionBar(false);
    setIsBookmarksOpen(true);
  };

  const handleJumpToLocation = (location: string) => {
    if (resolvedFileType === "epub") {
      epubHandleRef.current?.goToLocation(location);
    } else {
      const pageNum = Number.parseInt(location, 10);
      if (!Number.isNaN(pageNum)) {
        pdfHandleRef.current?.goToPage(pageNum);
      }
    }
  };

  const extractChapterText = useCallback(async (): Promise<string> => {
    if (resolvedFileType === "epub") {
      return (await epubHandleRef.current?.extractChapterText()) ?? "";
    }
    return (await pdfHandleRef.current?.extractChapterText()) ?? "";
  }, [resolvedFileType]);

  const palette = READER_THEME_PALETTES[prefs.theme];

  return (
    <div
      style={{ backgroundColor: palette.bg, color: palette.fg }}
      className="flex h-screen w-screen flex-col overflow-hidden"
    >
      {/* Top Bar Reader */}
      <header
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
        }}
        className="relative z-30 flex h-13 shrink-0 items-center justify-between gap-3 border-b px-3 py-2 sm:px-5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10"
            title="Kembali ke Rak Buku"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          {resolvedFileType === "epub" && (
            <button
              type="button"
              onClick={() => setIsTocOpen((o) => !o)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10"
              title="Daftar Isi (Table of Contents)"
            >
              <List className="h-4 w-4" />
            </button>
          )}

          <div className="min-w-0 pl-1">
            <h1 className="truncate text-sm font-semibold leading-tight">
              {resolvedTitle}
            </h1>
            <div className="flex items-center gap-2 text-[11px] opacity-75">
              <span>{Math.round(percentage)}% dibaca</span>
              {syncStatus === "saving" && (
                <span className="inline-flex items-center gap-1">
                  <CloudUpload className="h-3 w-3 animate-pulse" />
                  Menyimpan...
                </span>
              )}
              {syncStatus === "saved" && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Tersinkron
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tombol Pengaturan UI, Markah, & AI Buddy */}
        <div className="relative flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsSettingsOpen((o) => !o)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            title="Pengaturan Tema & Tipografi"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Tampilan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsAiOpen(false);
              setIsBookmarksOpen((o) => !o);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            title="Markah & Catatan"
          >
            <Bookmark className="h-4 w-4" />
            <span className="hidden sm:inline">Markah</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsBookmarksOpen(false);
              setIsAiOpen((o) => !o);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            title="Buka AI Reading Buddy"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Buddy</span>
          </button>

          {/* Popover Pengaturan Reader */}
          {isSettingsOpen && (
            <div className="absolute right-0 top-11 z-50">
              <EpubSettingsPanel
                prefs={prefs}
                onUpdate={updatePreferences}
                showTypography={resolvedFileType === "epub"}
              />
            </div>
          )}
        </div>
      </header>

      {/* Floating Action Bar saat Teks Disorot (Highlight) */}
      {showSelectionBar && selectedHighlight && (
        <div className="fixed left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-3.5 py-1.5 text-xs text-foreground shadow-xl">
          <button
            type="button"
            onClick={() => {
              setShowSelectionBar(false);
              setIsBookmarksOpen(false);
              setIsAiOpen(true);
              setAutoExplainSignal((s) => s + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
          >
            <Sparkles className="h-3 w-3" />
            Jelaskan Sorotan
          </button>

          <button
            type="button"
            onClick={() => void handleQuickSaveHighlight()}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium hover:bg-muted"
          >
            <BookmarkPlus className="h-3 w-3" />
            Simpan Kutipan
          </button>

          <button
            type="button"
            onClick={() => setShowSelectionBar(false)}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            aria-label="Tutup menu sorotan"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Konten Utama Reader */}
      <main
        onClick={() => {
          if (isSettingsOpen) setIsSettingsOpen(false);
        }}
        className="relative flex flex-1 flex-col overflow-hidden"
      >
        {(!isMetaLoaded || isLoading) && (
          <div className="m-auto flex w-full max-w-sm flex-col items-center gap-3 px-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin opacity-75" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                Menyiapkan Buku ke Cache Lokal...
              </p>
              <p className="text-xs opacity-70">
                {downloadPercent !== null && downloadPercent > 0
                  ? `${downloadPercent}% terunduh (${formatBytes(loadedBytes)})`
                  : "Memeriksa IndexedDB & stream Google Drive"}
              </p>
            </div>
            {downloadPercent !== null && (
              <Progress value={downloadPercent} className="w-full" />
            )}
          </div>
        )}

        {error && !isLoading && (
          <div className="m-auto max-w-md space-y-3 px-6 text-center">
            <p className="text-sm font-semibold text-red-500">{error}</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/">Kembali ke Rak Buku</Link>
            </Button>
          </div>
        )}

        {isMetaLoaded && !isLoading && !error && bookData && (
          <>
            {bookData.fileType === "epub" ? (
              <EpubReaderView
                ref={epubHandleRef}
                buffer={bookData.buffer}
                initialLocation={initialProgress?.current_location}
                prefs={prefs}
                isTocOpen={isTocOpen}
                onCloseToc={() => setIsTocOpen(false)}
                onLocationChange={handleLocationChange}
                onTextSelected={handleTextSelected}
              />
            ) : (
              <PdfReaderView
                ref={pdfHandleRef}
                buffer={bookData.buffer}
                initialPage={
                  initialProgress?.current_location
                    ? Number.parseInt(initialProgress.current_location, 10) || 1
                    : 1
                }
                prefs={prefs}
                onLocationChange={(pageStr, pct, total) =>
                  handleLocationChange(pageStr, pct, total)
                }
                onTextSelected={handleTextSelected}
              />
            )}
          </>
        )}
      </main>

      {/* Progress Bar Tipis di Bawah Layar */}
      <div className="h-1 w-full shrink-0 bg-black/5 dark:bg-white/10">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>

      {/* Drawer Markah & Catatan */}
      <BookmarksDrawer
        isOpen={isBookmarksOpen}
        onOpenChange={setIsBookmarksOpen}
        googleFileId={googleFileId}
        currentLocation={currentLocation}
        selectedHighlight={selectedHighlight}
        onJumpToLocation={handleJumpToLocation}
        refreshSignal={bookmarkRefreshSignal}
      />

      {/* Drawer & Floating Button AI Reading Buddy (Gemini Flash) */}
      <AiBuddyDrawer
        isOpen={isAiOpen}
        onOpenChange={setIsAiOpen}
        bookTitle={resolvedTitle}
        selectedHighlight={selectedHighlight}
        onClearHighlight={() => setSelectedHighlight("")}
        extractChapterText={extractChapterText}
        autoExplainSignal={autoExplainSignal}
      />
    </div>
  );
}

