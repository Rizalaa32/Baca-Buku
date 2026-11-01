"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs, type DocumentProps } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  Columns,
  Maximize2,
  ScrollText,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type LoadedPdfDocument = Parameters<
  NonNullable<DocumentProps["onLoadSuccess"]>
>[0];
import {
  READER_THEME_PALETTES,
  type ReaderPreferences,
} from "@/hooks/use-reader-preferences";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Gunakan worker resmi sesuai versi pdfjs-dist yang dimuat react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type PdfScrollMode = "continuous" | "single";

export interface PdfReaderHandle {
  goToPage: (pageNumber: number) => void;
  extractChapterText: () => Promise<string>;
}

interface PdfReaderViewProps {
  buffer: ArrayBuffer;
  initialPage?: number;
  prefs: ReaderPreferences;
  onLocationChange: (
    pageStr: string,
    percentage: number,
    totalPages: number
  ) => void;
  onTextSelected: (text: string, pageStr: string) => void;
}

export const PdfReaderView = forwardRef<PdfReaderHandle, PdfReaderViewProps>(
  function PdfReaderView(
    { buffer, initialPage = 1, prefs, onLocationChange, onTextSelected },
    ref
  ) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const pdfDocRef = useRef<LoadedPdfDocument | null>(null);
    const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
    const didJumpInitialRef = useRef<boolean>(false);

    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(
      Math.max(1, initialPage)
    );
    const [scrollMode, setScrollMode] = useState<PdfScrollMode>("continuous");
    const [scale, setScale] = useState<number>(1.0);
    const [fitToWidth, setFitToWidth] = useState<boolean>(true);
    const [containerWidth, setContainerWidth] = useState<number>(800);

    // Salin buffer ke Uint8Array baru agar aman dipakai ulang oleh PDF.js worker
    const fileSource = useMemo(
      () => ({ data: new Uint8Array(buffer.slice(0)) }),
      [buffer]
    );

    // Pantau lebar kontainer untuk fitur Fit-to-Width responsif
    useEffect(() => {
      const el = scrollContainerRef.current;
      if (!el) return;

      const updateWidth = () => {
        const nextWidth = Math.max(280, Math.min(960, el.clientWidth - 32));
        setContainerWidth(nextWidth);
      };
      updateWidth();

      const observer = new ResizeObserver(updateWidth);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const reportPageProgress = useCallback(
      (page: number, total: number) => {
        if (total <= 0) return;
        const clamped = Math.min(total, Math.max(1, page));
        setCurrentPage(clamped);
        const pct = Number(((clamped / total) * 100).toFixed(2));
        onLocationChange(String(clamped), pct, total);
      },
      [onLocationChange]
    );

    const jumpToPage = useCallback(
      (targetPage: number) => {
        if (numPages <= 0) return;
        const clamped = Math.min(numPages, Math.max(1, targetPage));
        setCurrentPage(clamped);

        if (scrollMode === "continuous") {
          const targetNode = pageElementsRef.current.get(clamped);
          targetNode?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        reportPageProgress(clamped, numPages);
      },
      [numPages, scrollMode, reportPageProgress]
    );

    useImperativeHandle(
      ref,
      () => ({
        goToPage(pageNumber: number) {
          jumpToPage(pageNumber);
        },
        async extractChapterText(): Promise<string> {
          const doc = pdfDocRef.current;
          if (!doc) return "";

          // Ambil teks dari halaman aktif hingga 4 halaman berikutnya sebagai konteks AI
          const start = Math.max(1, currentPage);
          const end = Math.min(doc.numPages, currentPage + 4);
          const parts: string[] = [];

          for (let p = start; p <= end; p++) {
            try {
              const page = await doc.getPage(p);
              const content = await page.getTextContent();
              const pageText = content.items
                .map((item) => ("str" in item ? item.str : ""))
                .join(" ")
                .trim();
              if (pageText) {
                parts.push(`[Halaman ${p}]\n${pageText}`);
              }
            } catch {
              // Lanjutkan halaman berikutnya bila gagal ekstrak
            }
          }
          return parts.join("\n\n");
        },
      }),
      [currentPage, jumpToPage]
    );

    // IntersectionObserver untuk auto-save halaman aktif saat Continuous Vertical Scroll
    useEffect(() => {
      if (scrollMode !== "continuous" || numPages <= 0) return;
      const rootEl = scrollContainerRef.current;
      if (!rootEl) return;

      const observer = new IntersectionObserver(
        (entries) => {
          let bestPage: number | null = null;
          let bestRatio = 0;

          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
              const pageAttr = Number(
                (entry.target as HTMLElement).dataset.pageNumber
              );
              if (!Number.isNaN(pageAttr)) {
                bestRatio = entry.intersectionRatio;
                bestPage = pageAttr;
              }
            }
          }

          if (bestPage && bestPage !== currentPage) {
            reportPageProgress(bestPage, numPages);
          }
        },
        {
          root: rootEl,
          threshold: [0.35, 0.65],
        }
      );

      pageElementsRef.current.forEach((node) => observer.observe(node));
      return () => observer.disconnect();
    }, [scrollMode, numPages, currentPage, reportPageProgress]);

    // Navigasi keyboard panah kiri/kanan pada mode Single-Page
    useEffect(() => {
      if (scrollMode !== "single" || numPages <= 0) return;
      const onKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (e.key === "ArrowRight") jumpToPage(currentPage + 1);
        if (e.key === "ArrowLeft") jumpToPage(currentPage - 1);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [scrollMode, numPages, currentPage, jumpToPage]);

    const handleMouseUpSelection = () => {
      const selected = window.getSelection()?.toString()?.trim();
      if (selected && selected.length > 2) {
        onTextSelected(selected, String(currentPage));
      }
    };

    const handleDocumentLoadSuccess = (pdf: LoadedPdfDocument) => {
      pdfDocRef.current = pdf;
      setNumPages(pdf.numPages);

      const targetInitial = Math.min(pdf.numPages, Math.max(1, initialPage));
      setCurrentPage(targetInitial);
      reportPageProgress(targetInitial, pdf.numPages);

      if (!didJumpInitialRef.current && targetInitial > 1) {
        didJumpInitialRef.current = true;
        setTimeout(() => {
          const el = pageElementsRef.current.get(targetInitial);
          el?.scrollIntoView({ behavior: "auto", block: "start" });
        }, 200);
      }
    };

    const palette = READER_THEME_PALETTES[prefs.theme];
    const pageFilterClass =
      prefs.theme === "amoled"
        ? "invert hue-rotate-180 contrast-95"
        : prefs.theme === "sepia"
        ? "sepia-[.28] brightness-[0.98]"
        : "";

    return (
      <div
        style={{ backgroundColor: palette.bg, color: palette.fg }}
        className="flex h-full w-full flex-1 flex-col overflow-hidden"
      >
        {/* Sub-Toolbar Kontrol PDF: Scroll/Single, Halaman, Zoom, Fit-to-Width */}
        <div
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
          }}
          className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs"
        >
          {/* Mode Tampilan */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-black/10 p-0.5 dark:border-white/10">
            <button
              type="button"
              onClick={() => setScrollMode("continuous")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                scrollMode === "continuous"
                  ? "bg-primary text-primary-foreground"
                  : "opacity-75 hover:opacity-100"
              }`}
              title="Continuous Vertical Scroll"
            >
              <ScrollText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Scroll</span>
            </button>
            <button
              type="button"
              onClick={() => setScrollMode("single")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                scrollMode === "single"
                  ? "bg-primary text-primary-foreground"
                  : "opacity-75 hover:opacity-100"
              }`}
              title="Single-Page View"
            >
              <Columns className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Per Halaman</span>
            </button>
          </div>

          {/* Navigasi Nomor Halaman */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => jumpToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded-lg p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium">
              Hal.{" "}
              <input
                type="number"
                min={1}
                max={numPages || 1}
                value={currentPage}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isNaN(val)) jumpToPage(val);
                }}
                className="w-12 rounded border border-black/15 bg-transparent px-1.5 py-0.5 text-center text-xs font-semibold dark:border-white/20"
              />{" "}
              / {numPages || "—"}
            </span>
            <button
              type="button"
              onClick={() => jumpToPage(currentPage + 1)}
              disabled={numPages > 0 && currentPage >= numPages}
              className="rounded-lg p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Kontrol Zoom & Fit to Width */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setFitToWidth(false);
                setScale((s) => Math.max(0.6, Number((s - 0.15).toFixed(2))));
              }}
              className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
              title="Perkecil (Zoom Out)"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[44px] text-center font-semibold">
              {fitToWidth ? "Lebar" : `${Math.round(scale * 100)}%`}
            </span>
            <button
              type="button"
              onClick={() => {
                setFitToWidth(false);
                setScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))));
              }}
              className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
              title="Perbesar (Zoom In)"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setFitToWidth(true);
                setScale(1.0);
              }}
              className={`ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium transition ${
                fitToWidth
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
              title="Sesuaikan Lebar Layar (Fit to Width)"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Fit Width</span>
            </button>
          </div>
        </div>

        {/* Area Dokumen PDF */}
        <div
          ref={scrollContainerRef}
          onMouseUp={handleMouseUpSelection}
          className="flex-1 overflow-auto px-2 py-4 sm:px-4"
        >
          <Document
            file={fileSource}
            onLoadSuccess={handleDocumentLoadSuccess}
            loading={
              <div className="py-20 text-center text-sm opacity-70">
                Menyiapkan dokumen PDF...
              </div>
            }
            error={
              <div className="py-20 text-center text-sm text-red-500">
                Gagal merender dokumen PDF.
              </div>
            }
            className="flex flex-col items-center gap-4"
          >
            {scrollMode === "single" ? (
              <div className={`overflow-hidden rounded-lg shadow-md ${pageFilterClass}`}>
                <Page
                  pageNumber={currentPage}
                  width={fitToWidth ? containerWidth : undefined}
                  scale={fitToWidth ? 1 : scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </div>
            ) : (
              Array.from({ length: numPages }, (_, idx) => {
                const pageNum = idx + 1;
                return (
                  <div
                    key={pageNum}
                    data-page-number={pageNum}
                    ref={(node) => {
                      if (node) {
                        pageElementsRef.current.set(pageNum, node);
                      } else {
                        pageElementsRef.current.delete(pageNum);
                      }
                    }}
                    className={`overflow-hidden rounded-lg shadow-md ${pageFilterClass}`}
                  >
                    <Page
                      pageNumber={pageNum}
                      width={fitToWidth ? containerWidth : undefined}
                      scale={fitToWidth ? 1 : scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                    />
                  </div>
                );
              })
            )}
          </Document>
        </div>
      </div>
    );
  }
);
