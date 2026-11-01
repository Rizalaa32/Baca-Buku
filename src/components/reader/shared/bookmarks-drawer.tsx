"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTimeId } from "@/lib/format-progress";
import type { BookmarkAndNoteRow } from "@/types/database";

interface BookmarksDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  googleFileId: string;
  currentLocation: string;
  selectedHighlight: string;
  onJumpToLocation: (location: string) => void;
  refreshSignal?: number;
}

export function BookmarksDrawer({
  isOpen,
  onOpenChange,
  googleFileId,
  currentLocation,
  selectedHighlight,
  onJumpToLocation,
  refreshSignal = 0,
}: BookmarksDrawerProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkAndNoteRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadBookmarks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/bookmarks?fileId=${encodeURIComponent(googleFileId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setBookmarks((data.bookmarks ?? []) as BookmarkAndNoteRow[]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [googleFileId]);

  useEffect(() => {
    if (isOpen) {
      void loadBookmarks();
    }
  }, [isOpen, refreshSignal, loadBookmarks]);

  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLocation || isSaving) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleFileId,
          location: currentLocation,
          highlightedText: selectedHighlight || null,
          note: noteInput.trim() || null,
        }),
      });
      if (res.ok) {
        setNoteInput("");
        await loadBookmarks();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/bookmarks?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      aria-label="Markah dan Catatan"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l bg-background text-foreground shadow-2xl"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Markah &amp; Catatan</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form Tambah Markah / Catatan di Posisi Saat Ini */}
      <form onSubmit={handleAddBookmark} className="space-y-2.5 border-b p-4">
        {selectedHighlight && (
          <p className="line-clamp-2 rounded-lg bg-muted p-2 text-xs italic text-muted-foreground">
            &ldquo;{selectedHighlight}&rdquo;
          </p>
        )}
        <textarea
          rows={2}
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="Tulis catatan pribadi opsional untuk halaman/kutipan ini..."
          className="w-full resize-none rounded-xl border border-border bg-card p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <Button
          type="submit"
          size="sm"
          className="w-full"
          disabled={!currentLocation || isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BookmarkPlus className="h-3.5 w-3.5" />
          )}
          Simpan Markah di Posisi Ini
        </Button>
      </form>

      {/* Daftar Markah */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Memuat markah...
          </div>
        ) : bookmarks.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Belum ada markah atau kutipan yang disimpan untuk buku ini.
          </p>
        ) : (
          bookmarks.map((item) => (
            <div
              key={item.id}
              className="group rounded-xl border bg-card p-3 transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onJumpToLocation(item.location);
                    onOpenChange(false);
                  }}
                  className="flex-1 text-left"
                >
                  <p className="text-[11px] font-semibold text-primary">
                    {item.location.startsWith("epubcfi")
                      ? "Lokasi EPUB"
                      : `Halaman ${item.location}`}{" "}
                    <span className="font-normal text-muted-foreground">
                      • {formatRelativeTimeId(item.created_at)}
                    </span>
                  </p>
                  {item.highlighted_text && (
                    <p className="mt-1 line-clamp-3 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">
                      &ldquo;{item.highlighted_text}&rdquo;
                    </p>
                  )}
                  {item.note && (
                    <p className="mt-1.5 text-xs text-foreground">{item.note}</p>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  className="text-muted-foreground opacity-60 hover:text-red-500 hover:opacity-100"
                  title="Hapus markah"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

