"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  formatBookProgressLabel,
  formatRelativeTimeId,
} from "@/lib/format-progress";
import type { LibraryBookItem } from "@/types/database";

interface ContinueReadingBannerProps {
  book: LibraryBookItem;
}

export function ContinueReadingBanner({ book }: ContinueReadingBannerProps) {
  const progressLabel = formatBookProgressLabel(book);
  const lastReadLabel = formatRelativeTimeId(book.progress?.lastReadAt);

  return (
    <section
      aria-label="Lanjutkan membaca"
      className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
              <BookOpenCheck className="h-4 w-4" />
              Sedang Dibaca
            </span>
            <Badge variant={book.fileType === "epub" ? "epub" : "pdf"}>
              {book.fileType}
            </Badge>
            {lastReadLabel && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {lastReadLabel}
              </span>
            )}
          </div>

          <h2 className="font-serif text-xl font-bold tracking-tight sm:text-2xl">
            {book.title}
          </h2>

          <div className="max-w-md space-y-1.5 pt-1">
            <Progress value={book.progress?.percentage ?? 0} className="h-2" />
            <p className="text-xs font-medium text-muted-foreground">
              {progressLabel}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`/reader/${encodeURIComponent(book.googleFileId)}`}>
              Lanjutkan Membaca
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

