"use client";

import { useState } from "react";
import Link from "next/link";
import { BookText, FileText, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  formatBookProgressLabel,
  formatRelativeTimeId,
} from "@/lib/format-progress";
import { formatBytes } from "@/lib/utils";
import type { LibraryBookItem } from "@/types/database";

interface BookCardProps {
  book: LibraryBookItem;
}

export function BookCard({ book }: BookCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const showCoverImage = Boolean(book.coverUrl) && !imgFailed;
  const percentage = book.progress?.percentage ?? 0;
  const progressLabel = formatBookProgressLabel(book);
  const relativeLastRead = formatRelativeTimeId(book.progress?.lastReadAt);
  const sizeLabel = formatBytes(book.fileSizeBytes);

  return (
    <Link
      href={`/reader/${encodeURIComponent(book.googleFileId)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {/* Sampul Buku 2:3 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {showCoverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverUrl!}
            alt={`Sampul ${book.title}`}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className={`flex h-full w-full flex-col justify-between p-4 ${
              book.fileType === "epub"
                ? "bg-gradient-to-br from-emerald-950/90 via-teal-900/85 to-slate-900 text-emerald-50"
                : "bg-gradient-to-br from-slate-900 via-zinc-800 to-rose-950/90 text-rose-50"
            }`}
          >
            <div className="flex items-center justify-between opacity-75">
              {book.fileType === "epub" ? (
                <BookText className="h-5 w-5" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-widest">
                {book.fileType}
              </span>
            </div>

            <div className="my-auto py-2">
              <p className="line-clamp-4 font-serif text-sm font-bold leading-snug tracking-tight">
                {book.title}
              </p>
            </div>

            <div className="h-1 w-10 rounded-full bg-white/30" />
          </div>
        )}

        {/* Badge Tipe File di Sudut Kanan Atas */}
        <div className="absolute right-2.5 top-2.5">
          <Badge
            variant={book.fileType === "epub" ? "epub" : "pdf"}
            className="backdrop-blur-md"
          >
            {book.fileType}
          </Badge>
        </div>
      </div>

      {/* Informasi & Progress Bar */}
      <div className="flex flex-1 flex-col justify-between p-3.5">
        <div>
          <h2
            title={book.title}
            className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight group-hover:text-primary"
          >
            {book.title}
          </h2>

          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {relativeLastRead ? (
              <span className="inline-flex items-center gap-1 truncate">
                <Clock className="h-3 w-3 shrink-0" />
                {relativeLastRead}
              </span>
            ) : sizeLabel ? (
              <span>{sizeLabel}</span>
            ) : (
              <span>Koleksi Drive</span>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-1.5 border-t pt-2.5">
          <Progress value={percentage} />
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {progressLabel}
          </p>
        </div>
      </div>
    </Link>
  );
}

