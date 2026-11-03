"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import ePub, { type Book, type NavItem, type Rendition } from "epubjs";
import {
  ChevronLeft,
  ChevronRight,
  List,
  X,
} from "lucide-react";
import {
  READER_THEME_PALETTES,
  type ReaderPreferences,
} from "@/hooks/use-reader-preferences";

export interface EpubReaderHandle {
  goToLocation: (cfiOrHref: string) => void;
  extractChapterText: () => Promise<string>;
}

interface EpubReaderViewProps {
  buffer: ArrayBuffer;
  /** Kunci unik (mis. fileId + modifiedTime) untuk menyimpan indeks lokasi. */
  locationsCacheKey?: string;
  initialLocation?: string | null;
  prefs: ReaderPreferences;
  isTocOpen: boolean;
  onCloseToc: () => void;
  onLocationChange: (
    cfi: string,
    percentage: number,
    totalLocations: number | null
  ) => void;
  onTextSelected: (text: string, cfiRange: string) => void;
}

function getCssFontStack(fontFamily: ReaderPreferences["fontFamily"]): string {
  if (fontFamily === "sans") {
    return "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }
  if (fontFamily === "dyslexic") {
    return "'OpenDyslexic', 'Comic Sans MS', Verdana, Tahoma, sans-serif";
  }
  return "Merriweather, Georgia, 'Times New Roman', serif";
}

export const EpubReaderView = forwardRef<EpubReaderHandle, EpubReaderViewProps>(
  function EpubReaderView(
    {
      buffer,
      locationsCacheKey,
      initialLocation,
      prefs,
      isTocOpen,
      onCloseToc,
      onLocationChange,
      onTextSelected,
    },
    ref
  ) {
    const viewerContainerRef = useRef<HTMLDivElement | null>(null);
    const bookRef = useRef<Book | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const totalLocationsRef = useRef<number | null>(null);
    const onLocationChangeRef = useRef(onLocationChange);
    const onTextSelectedRef = useRef(onTextSelected);

    const [toc, setToc] = useState<NavItem[]>([]);
    const [activeHref, setActiveHref] = useState<string>("");

    useEffect(() => {
      onLocationChangeRef.current = onLocationChange;
    }, [onLocationChange]);

    useEffect(() => {
      onTextSelectedRef.current = onTextSelected;
    }, [onTextSelected]);

    const applyTypographyAndTheme = useCallback(
      (rendition: Rendition, currentPrefs: ReaderPreferences) => {
        const palette = READER_THEME_PALETTES[currentPrefs.theme];
        const fontStack = getCssFontStack(currentPrefs.fontFamily);
        const isDyslexic = currentPrefs.fontFamily === "dyslexic";

        rendition.themes.default({
          "html, body": {
            background: `${palette.bg} !important`,
            color: `${palette.fg} !important`,
            "font-family": `${fontStack} !important`,
            "line-height": `${currentPrefs.lineHeight} !important`,
            "letter-spacing": isDyslexic ? "0.04em !important" : "normal",
            "word-spacing": isDyslexic ? "0.12em !important" : "normal",
          },
          "p, li, blockquote, span, div": {
            color: `${palette.fg} !important`,
            "font-family": `${fontStack} !important`,
            "line-height": `${currentPrefs.lineHeight} !important`,
          },
          "a, a:link, a:visited": {
            color: `${
              currentPrefs.theme === "amoled" ? "#60a5fa" : "#2563eb"
            } !important`,
          },
          "::selection": {
            background: `${palette.selectionBg} !important`,
          },
        });
        rendition.themes.fontSize(`${currentPrefs.fontSizePercent}%`);
      },
      []
    );

    useImperativeHandle(
      ref,
      () => ({
        goToLocation(cfiOrHref: string) {
          void renditionRef.current?.display(cfiOrHref);
        },
        async extractChapterText(): Promise<string> {
          const rendition = renditionRef.current;
          if (!rendition) return "";
          try {
            // Ambil isi DOM bab yang sedang dirender di dalam iframe epubjs
            const contentsList = rendition.getContents() as unknown as Array<{
              document?: Document;
            }>;
            const texts = contentsList
              .map((c) => c.document?.body?.innerText?.trim() ?? "")
              .filter(Boolean);
            return texts.join("\n\n");
          } catch {
            return "";
          }
        },
      }),
      []
    );

    // Inisialisasi EPUB Book & Rendition
    useEffect(() => {
      if (!viewerContainerRef.current) return;

      // Salin ArrayBuffer agar buffer asli di state tidak detached
      const clonedBuffer = buffer.slice(0);
      const book = ePub(clonedBuffer);
      bookRef.current = book;

      const rendition = book.renderTo(viewerContainerRef.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "none",
      });
      renditionRef.current = rendition;

      applyTypographyAndTheme(rendition, prefs);

      // Muat Daftar Isi (Table of Contents)
      book.loaded.navigation.then((nav) => {
        setToc(nav.toc ?? []);
      });

      // Tampilkan posisi terakhir atau halaman pembuka
      void rendition.display(initialLocation || undefined);

      // Indeks lokasi untuk persentase presisi. Hasilnya disimpan di localStorage
      // supaya pembukaan berikutnya tidak perlu menghitung ulang (berat untuk buku besar).
      const storageKey = locationsCacheKey
        ? `epub-locations:${locationsCacheKey}`
        : null;
      book.ready
        .then(async () => {
          let saved: string | null = null;
          try {
            saved = storageKey ? window.localStorage.getItem(storageKey) : null;
          } catch {
            saved = null;
          }

          if (saved) {
            book.locations.load(saved);
          } else {
            await book.locations.generate(1200);
            if (storageKey) {
              try {
                window.localStorage.setItem(storageKey, book.locations.save());
              } catch {
                // Abaikan bila kuota localStorage penuh
              }
            }
          }
          totalLocationsRef.current = book.locations.length();
        })
        .catch(() => {
          // Abaikan bila struktur EPUB tidak standar
        });

      // Event berpindah halaman (relocated)
      const handleRelocated = (location: {
        start: { cfi: string; href: string; percentage?: number };
      }) => {
        const cfi = location?.start?.cfi;
        if (!cfi) return;
        setActiveHref(location.start.href ?? "");

        let pct = 0;
        if (totalLocationsRef.current && totalLocationsRef.current > 0) {
          const rawPct = book.locations.percentageFromCfi(cfi);
          if (typeof rawPct === "number" && !Number.isNaN(rawPct)) {
            pct = Math.min(100, Math.max(0, Number((rawPct * 100).toFixed(2))));
          }
        } else if (typeof location.start.percentage === "number") {
          pct = Math.min(
            100,
            Math.max(0, Number((location.start.percentage * 100).toFixed(2)))
          );
        }

        onLocationChangeRef.current(cfi, pct, totalLocationsRef.current);
      };

      rendition.on("relocated", handleRelocated);

      // Event sorotan teks (highlight) untuk AI Buddy & Markah
      const handleSelected = (cfiRange: string, contents: { window: Window }) => {
        const selectedText = contents?.window
          ?.getSelection()
          ?.toString()
          ?.trim();
        if (selectedText) {
          onTextSelectedRef.current(selectedText, cfiRange);
        }
      };

      rendition.on("selected", handleSelected);

      // Navigasi swipe sentuh (HP) & tombol panah di dalam iframe EPUB
      rendition.hooks.content.register((contents: { document: Document }) => {
        let touchStartX = 0;
        let touchStartY = 0;

        contents.document.addEventListener(
          "touchstart",
          (e: TouchEvent) => {
            touchStartX = e.changedTouches[0]?.screenX ?? 0;
            touchStartY = e.changedTouches[0]?.screenY ?? 0;
          },
          { passive: true }
        );

        contents.document.addEventListener(
          "touchend",
          (e: TouchEvent) => {
            const deltaX = (e.changedTouches[0]?.screenX ?? 0) - touchStartX;
            const deltaY = (e.changedTouches[0]?.screenY ?? 0) - touchStartY;
            if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
              if (deltaX < 0) {
                void rendition.next();
              } else {
                void rendition.prev();
              }
            }
          },
          { passive: true }
        );

        contents.document.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "ArrowRight") void rendition.next();
          if (e.key === "ArrowLeft") void rendition.prev();
        });
      });

      const handleWindowKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (e.key === "ArrowRight") void rendition.next();
        if (e.key === "ArrowLeft") void rendition.prev();
      };
      window.addEventListener("keydown", handleWindowKeyDown);

      return () => {
        window.removeEventListener("keydown", handleWindowKeyDown);
        rendition.off("relocated", handleRelocated);
        rendition.off("selected", handleSelected);
        book.destroy();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buffer]);

    // Update tema & tipografi secara reaktif tanpa reload ulang EPUB
    useEffect(() => {
      if (renditionRef.current) {
        applyTypographyAndTheme(renditionRef.current, prefs);
      }
    }, [prefs, applyTypographyAndTheme]);

    const palette = READER_THEME_PALETTES[prefs.theme];

    const renderTocItems = (items: NavItem[], depth = 0) =>
      items.map((item) => {
        const isCurrent =
          activeHref && item.href && activeHref.includes(item.href.split("#")[0]);
        return (
          <div key={`${item.id}-${item.href}`}>
            <button
              type="button"
              onClick={() => {
                void renditionRef.current?.display(item.href);
                onCloseToc();
              }}
              style={{ paddingLeft: `${12 + depth * 14}px` }}
              className={`w-full rounded-lg py-2 pr-3 text-left text-xs transition ${
                isCurrent
                  ? "bg-primary/10 font-semibold text-primary"
                  : "hover:bg-muted/80"
              }`}
            >
              {item.label.trim()}
            </button>
            {item.subitems && item.subitems.length > 0 && (
              <div>{renderTocItems(item.subitems, depth + 1)}</div>
            )}
          </div>
        );
      });

    return (
      <div
        style={{ backgroundColor: palette.bg, color: palette.fg }}
        className="relative flex h-full w-full flex-1 overflow-hidden transition-colors"
      >
        {/* Sidebar Daftar Isi (Table of Contents) */}
        {isTocOpen && (
          <aside className="absolute inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r bg-background text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Daftar Isi</h2>
              </div>
              <button
                type="button"
                onClick={onCloseToc}
                className="rounded-lg p-1 hover:bg-muted"
                aria-label="Tutup daftar isi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {toc.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  Daftar isi tidak tersedia pada file EPUB ini.
                </p>
              ) : (
                renderTocItems(toc)
              )}
            </div>
          </aside>
        )}

        {/* Tombol Navigasi Halaman Kiri (Desktop) */}
        <button
          type="button"
          onClick={() => void renditionRef.current?.prev()}
          aria-label="Halaman sebelumnya"
          className="z-20 hidden w-12 items-center justify-center opacity-30 transition hover:opacity-100 md:flex"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Area Kanvas EPUB */}
        <div className="mx-auto h-full w-full max-w-3xl flex-1 px-2 py-2 sm:px-6">
          <div ref={viewerContainerRef} className="h-full w-full" />
        </div>

        {/* Tombol Navigasi Halaman Kanan (Desktop) */}
        <button
          type="button"
          onClick={() => void renditionRef.current?.next()}
          aria-label="Halaman berikutnya"
          className="z-20 hidden w-12 items-center justify-center opacity-30 transition hover:opacity-100 md:flex"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    );
  }
);

