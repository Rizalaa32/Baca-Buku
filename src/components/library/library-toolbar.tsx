"use client";

import { ArrowUpDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FileTypeFilter = "all" | "epub" | "pdf";
export type LibrarySortOption = "last_read" | "title" | "drive_recent";

interface LibraryToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  fileTypeFilter: FileTypeFilter;
  onFileTypeChange: (value: FileTypeFilter) => void;
  sortBy: LibrarySortOption;
  onSortChange: (value: LibrarySortOption) => void;
  counts: {
    all: number;
    epub: number;
    pdf: number;
  };
}

export function LibraryToolbar({
  searchQuery,
  onSearchChange,
  fileTypeFilter,
  onFileTypeChange,
  sortBy,
  onSortChange,
  counts,
}: LibraryToolbarProps) {
  const filterOptions: Array<{
    key: FileTypeFilter;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "Semua", count: counts.all },
    { key: "epub", label: "EPUB", count: counts.epub },
    { key: "pdf", label: "PDF", count: counts.pdf },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Pencarian Judul Buku */}
      <div className="relative w-full sm:max-w-xs md:max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari judul buku..."
          className="pl-10 pr-9"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Hapus kata kunci pencarian"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:justify-end">
        {/* Segmented Filter Tipe File */}
        <div
          role="tablist"
          aria-label="Filter tipe file buku"
          className="inline-flex items-center rounded-xl border bg-muted/60 p-1"
        >
          {filterOptions.map((opt) => {
            const active = fileTypeFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFileTypeChange(opt.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{opt.label}</span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px]",
                    active ? "bg-muted text-foreground" : "bg-transparent"
                  )}
                >
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dropdown Urutan */}
        <div className="relative inline-flex items-center">
          <ArrowUpDown className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
          <select
            aria-label="Urutkan buku berdasarkan"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as LibrarySortOption)}
            className="h-9 appearance-none rounded-xl border border-border bg-card pl-8 pr-8 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <option value="last_read">Terakhir Dibaca</option>
            <option value="title">Judul (A–Z)</option>
            <option value="drive_recent">Terbaru di Drive</option>
          </select>
        </div>
      </div>
    </div>
  );
}

