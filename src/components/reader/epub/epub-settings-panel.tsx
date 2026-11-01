"use client";

import {
  READER_THEME_PALETTES,
  type ReaderFontFamily,
  type ReaderPreferences,
  type ReaderTheme,
} from "@/hooks/use-reader-preferences";
import { cn } from "@/lib/utils";

interface EpubSettingsPanelProps {
  prefs: ReaderPreferences;
  onUpdate: (patch: Partial<ReaderPreferences>) => void;
  showTypography?: boolean;
}

export function EpubSettingsPanel({
  prefs,
  onUpdate,
  showTypography = true,
}: EpubSettingsPanelProps) {
  const themes: Array<{ key: ReaderTheme; label: string }> = [
    { key: "light", label: "Light" },
    { key: "sepia", label: "Warm Sepia" },
    { key: "amoled", label: "AMOLED" },
  ];

  const fonts: Array<{ key: ReaderFontFamily; label: string }> = [
    { key: "serif", label: "Serif" },
    { key: "sans", label: "Sans-Serif" },
    { key: "dyslexic", label: "Dyslexic" },
  ];

  return (
    <div className="w-72 space-y-4 rounded-2xl border bg-background p-4 text-foreground shadow-xl">
      {/* Tema Warna */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tema Baca
        </p>
        <div className="grid grid-cols-3 gap-2">
          {themes.map((t) => {
            const palette = READER_THEME_PALETTES[t.key];
            const active = prefs.theme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onUpdate({ theme: t.key })}
                style={{
                  backgroundColor: palette.bg,
                  color: palette.fg,
                  borderColor: active ? "#3b82f6" : palette.border,
                }}
                className={cn(
                  "rounded-xl border-2 px-2 py-2 text-center text-xs font-medium transition",
                  active && "ring-2 ring-blue-500/30"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {showTypography && (
        <>
          {/* Jenis Huruf */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Jenis Font
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {fonts.map((f) => {
                const active = prefs.fontFamily === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => onUpdate({ fontFamily: f.key })}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-xs font-medium transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ukuran Font */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                Ukuran Huruf
              </span>
              <span className="font-semibold">{prefs.fontSizePercent}%</span>
            </div>
            <input
              type="range"
              min={85}
              max={160}
              step={5}
              value={prefs.fontSizePercent}
              onChange={(e) =>
                onUpdate({ fontSizePercent: Number(e.target.value) })
              }
              className="w-full accent-primary"
            />
          </div>

          {/* Spasi Antarbaris */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                Tinggi Baris (Line Height)
              </span>
              <span className="font-semibold">{prefs.lineHeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={1.4}
              max={2.2}
              step={0.1}
              value={prefs.lineHeight}
              onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
        </>
      )}
    </div>
  );
}

