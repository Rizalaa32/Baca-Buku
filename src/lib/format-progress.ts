import type { LibraryBookItem } from "@/types/database";

/**
 * Menghasilkan label progres baca yang informatif sesuai tipe buku:
 * - PDF : "Halaman 45 dari 200 • 22%"
 * - EPUB: "Lokasi 180 dari 820 • 22%" atau "22% selesai"
 */
export function formatBookProgressLabel(book: LibraryBookItem): string {
  if (!book.progress) {
    return book.totalPagesOrLocations && book.fileType === "pdf"
      ? `${book.totalPagesOrLocations} halaman • Belum dibaca`
      : "Belum dibaca";
  }

  const pct = Math.round(book.progress.percentage);
  const total = book.totalPagesOrLocations;

  if (book.fileType === "pdf") {
    const parsedPage = Number.parseInt(book.progress.currentLocation, 10);
    if (!Number.isNaN(parsedPage) && parsedPage > 0) {
      if (total && total > 0) {
        return `Halaman ${parsedPage} dari ${total} • ${pct}%`;
      }
      return `Halaman ${parsedPage} • ${pct}%`;
    }
    return `${pct}% selesai`;
  }

  // EPUB: currentLocation berupa EpubCFI string; estimasi lokasi dari persentase * total lokasi
  if (total && total > 0) {
    const approxLocation = Math.max(1, Math.round((book.progress.percentage / 100) * total));
    return `Lokasi ${approxLocation} dari ${total} • ${pct}%`;
  }

  if (pct >= 100) {
    return "Selesai dibaca • 100%";
  }

  return `${pct}% selesai`;
}

export function formatRelativeTimeId(isoDate?: string | null): string {
  if (!isoDate) return "";
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) return "";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "Baru saja";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} hari lalu`;

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

