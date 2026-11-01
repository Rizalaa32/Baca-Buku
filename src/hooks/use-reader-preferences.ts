"use client";

import { useCallback, useEffect, useState } from "react";

export type ReaderTheme = "light" | "sepia" | "amoled";
export type ReaderFontFamily = "serif" | "sans" | "dyslexic";

export interface ReaderPreferences {
  theme: ReaderTheme;
  fontFamily: ReaderFontFamily;
  fontSizePercent: number; // 85 - 160
  lineHeight: number;      // 1.4 - 2.2
}

const STORAGE_KEY = "baca-buku-reader-preferences-v1";

const DEFAULT_PREFERENCES: ReaderPreferences = {
  theme: "sepia",
  fontFamily: "serif",
  fontSizePercent: 105,
  lineHeight: 1.75,
};

export const READER_THEME_PALETTES: Record<
  ReaderTheme,
  {
    bg: string;
    fg: string;
    surface: string;
    border: string;
    selectionBg: string;
  }
> = {
  light: {
    bg: "#FFFFFF",
    fg: "#18181B",
    surface: "#F4F4F5",
    border: "#E4E4E7",
    selectionBg: "rgba(59, 130, 246, 0.22)",
  },
  sepia: {
    bg: "#F4ECD8",
    fg: "#3B2E1E",
    surface: "#EAE0C8",
    border: "#DCD0B4",
    selectionBg: "rgba(180, 83, 9, 0.22)",
  },
  amoled: {
    bg: "#000000",
    fg: "#E4E4E7",
    surface: "#121215",
    border: "#27272A",
    selectionBg: "rgba(96, 165, 250, 0.28)",
  },
};

export function useReaderPreferences() {
  const [prefs, setPrefs] = useState<ReaderPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ReaderPreferences>;
        setPrefs((prev) => ({
          theme: parsed.theme ?? prev.theme,
          fontFamily: parsed.fontFamily ?? prev.fontFamily,
          fontSizePercent: parsed.fontSizePercent ?? prev.fontSizePercent,
          lineHeight: parsed.lineHeight ?? prev.lineHeight,
        }));
      }
    } catch {
      // Abaikan bila localStorage tidak dapat dibaca
    }
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<ReaderPreferences>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Abaikan bila kuota localStorage penuh
        }
        return next;
      });
    },
    []
  );

  return { prefs, updatePreferences };
}

