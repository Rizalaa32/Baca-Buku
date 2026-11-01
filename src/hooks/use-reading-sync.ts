"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookFileType } from "@/types/drive";

export type SyncStatus = "idle" | "saving" | "saved" | "error";

interface SyncPayload {
  googleFileId: string;
  title: string;
  fileType: BookFileType;
  currentLocation: string;
  percentage: number;
  totalPagesOrLocations?: number | null;
}

/**
 * Hook auto-save posisi baca dengan debounce 1.5 detik untuk sinkronisasi lintas perangkat.
 * Juga melakukan flush saat tab disembunyikan / ditutup agar halaman terakhir tidak hilang.
 */
export function useReadingSync(debounceMs = 1500) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadRef = useRef<SyncPayload | null>(null);
  const lastSavedKeyRef = useRef<string>("");

  const flushNow = useCallback(async (payload: SyncPayload) => {
    const dedupeKey = `${payload.googleFileId}:${payload.currentLocation}:${payload.totalPagesOrLocations ?? ""}`;
    if (lastSavedKeyRef.current === dedupeKey) {
      return;
    }

    setSyncStatus("saving");
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      lastSavedKeyRef.current = dedupeKey;
      pendingPayloadRef.current = null;
      setSyncStatus("saved");
    } catch (err) {
      console.warn("[ReadingSync] Gagal menyimpan posisi baca:", err);
      setSyncStatus("error");
    }
  }, []);

  const scheduleSave = useCallback(
    (payload: SyncPayload) => {
      pendingPayloadRef.current = payload;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        if (pendingPayloadRef.current) {
          void flushNow(pendingPayloadRef.current);
        }
      }, debounceMs);
    },
    [debounceMs, flushNow]
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && pendingPayloadRef.current) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        void flushNow(pendingPayloadRef.current);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (pendingPayloadRef.current) {
        void flushNow(pendingPayloadRef.current);
      }
    };
  }, [flushNow]);

  return { syncStatus, scheduleSave };
}

