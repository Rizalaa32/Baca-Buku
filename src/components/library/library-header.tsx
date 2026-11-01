"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  BookOpen,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearAllCachedBooks } from "@/lib/storage/book-cache";

interface LibraryHeaderProps {
  totalBooks: number;
  isSyncing: boolean;
  onRefresh: () => void;
}

export function LibraryHeader({
  totalBooks,
  isSyncing,
  onRefresh,
}: LibraryHeaderProps) {
  const { data: session } = useSession();
  const [isDark, setIsDark] = useState(false);
  const [cacheClearedNotice, setCacheClearedNotice] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("baca-buku-dashboard-theme");
    const prefersDark =
      savedTheme === "dark" ||
      (!savedTheme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem(
      "baca-buku-dashboard-theme",
      nextDark ? "dark" : "light"
    );
  };

  const handleClearOfflineCache = async () => {
    await clearAllCachedBooks();
    setCacheClearedNotice(true);
    setTimeout(() => setCacheClearedNotice(false), 2500);
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              Baca Buku
            </h1>
            <p className="text-xs text-muted-foreground">
              {totalBooks} koleksi di Google Drive pribadi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isSyncing}
            title="Sinkronkan ulang daftar buku dari Google Drive"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {isSyncing ? "Menyinkronkan..." : "Sinkronkan Drive"}
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClearOfflineCache}
            title={
              cacheClearedNotice
                ? "Cache offline dibersihkan!"
                : "Bersihkan cache buku lokal (IndexedDB)"
            }
          >
            <HardDrive
              className={`h-4 w-4 ${
                cacheClearedNotice ? "text-emerald-500" : ""
              }`}
            />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Ubah tema tampilan"
            title={isDark ? "Mode Terang" : "Mode Gelap"}
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          <div className="hidden h-5 w-px bg-border sm:block" />

          {session?.user?.email && (
            <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground md:inline">
              {session.user.email}
            </span>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Keluar dari akun"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

