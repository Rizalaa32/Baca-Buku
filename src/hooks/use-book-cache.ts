"use client";

import { useEffect, useState } from "react";
import {
  loadBookWithIndexedDbCache,
  type CachedBookEntry,
} from "@/lib/storage/book-cache";

export interface UseBookCacheResult {
  bookData: CachedBookEntry | null;
  isLoading: boolean;
  downloadPercent: number | null;
  loadedBytes: number;
  error: string | null;
}

export function useBookBinaryCache(
  googleFileId: string,
  expectedModifiedTime?: string | null
): UseBookCacheResult {
  const [bookData, setBookData] = useState<CachedBookEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(0);
  const [loadedBytes, setLoadedBytes] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setDownloadPercent(0);
    setLoadedBytes(0);

    loadBookWithIndexedDbCache({
      googleFileId,
      expectedModifiedTime,
      signal: controller.signal,
      onProgress: (percent, bytes) => {
        setDownloadPercent(percent);
        setLoadedBytes(bytes);
      },
    })
      .then((entry) => {
        if (!controller.signal.aborted) {
          setBookData(entry);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Gagal memuat buku dari cache/Drive."
        );
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [googleFileId, expectedModifiedTime]);

  return { bookData, isLoading, downloadPercent, loadedBytes, error };
}

