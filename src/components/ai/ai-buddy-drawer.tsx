"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Eraser,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Quote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiQuickAction } from "@/app/api/ai/chat/route";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  badge?: string;
}

interface AiBuddyDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bookTitle: string;
  selectedHighlight: string;
  onClearHighlight: () => void;
  extractChapterText: () => Promise<string>;
  autoExplainSignal?: number;
}

export function AiBuddyDrawer({
  isOpen,
  onOpenChange,
  bookTitle,
  selectedHighlight,
  onClearHighlight,
  extractChapterText,
  autoExplainSignal = 0,
}: AiBuddyDrawerProps) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [previousInteractionId, setPreviousInteractionId] = useState<
    string | null
  >(null);
  const lastHandledSignalRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const sendAiRequest = async (options: {
    action: AiQuickAction;
    userLabel: string;
    messageText?: string;
    badge?: string;
  }) => {
    if (isStreaming) return;

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: options.userLabel,
        badge: options.badge,
      },
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
      },
    ]);
    setIsStreaming(true);

    try {
      let chapterText = "";
      if (
        options.action === "summarize_chapter" ||
        !previousInteractionId
      ) {
        chapterText = await extractChapterText().catch(() => "");
      }

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: options.action,
          message: options.messageText,
          highlightedText: selectedHighlight || undefined,
          chapterText: chapterText || undefined,
          bookTitle,
          previousInteractionId,
        }),
      });

      if (!response.ok || !response.body) {
        const errJson = await response.json().catch(() => null);
        throw new Error(
          errJson?.error ?? `Permintaan AI gagal (HTTP ${response.status}).`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) continue;

          const parsed = JSON.parse(trimmed) as {
            type: "delta" | "done" | "error";
            text?: string;
            interactionId?: string | null;
            error?: string;
          };

          if (parsed.type === "delta" && parsed.text) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + parsed.text }
                  : m
              )
            );
          } else if (parsed.type === "done" && parsed.interactionId) {
            setPreviousInteractionId(parsed.interactionId);
          } else if (parsed.type === "error") {
            throw new Error(parsed.error ?? "Gagal memproses respons AI.");
          }
        }
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menghubungi Gemini AI.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: `⚠️ ${errorMsg}` } : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  // Jalankan "Jelaskan Sorotan" otomatis saat pengguna menekan tombol cepat dari teks yang disorot
  useEffect(() => {
    if (
      autoExplainSignal > 0 &&
      autoExplainSignal !== lastHandledSignalRef.current &&
      selectedHighlight
    ) {
      lastHandledSignalRef.current = autoExplainSignal;
      void sendAiRequest({
        action: "explain_highlight",
        userLabel: `Jelaskan kutipan ini:\n"${selectedHighlight.slice(0, 220)}${
          selectedHighlight.length > 220 ? "..." : ""
        }"`,
        badge: "Explain Highlight",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExplainSignal, selectedHighlight]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    void sendAiRequest({
      action: "chat",
      userLabel: trimmed,
      messageText: trimmed,
    });
  };

  const handleResetChat = () => {
    setMessages([]);
    setPreviousInteractionId(null);
  };

  return (
    <>
      {/* Floating Action Button AI Reading Buddy */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          title="Buka AI Reading Buddy (Gemini Flash)"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">AI Buddy</span>
        </button>
      )}

      {/* Drawer Panel Samping */}
      {isOpen && (
        <aside
          aria-label="Panel AI Reading Buddy"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background text-foreground shadow-2xl"
        >
          {/* Header Drawer */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold leading-tight">
                  AI Reading Buddy
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Gemini Flash • Konteks Buku Aktif
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleResetChat}
                  title="Mulai percakapan baru"
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                title="Tutup panel AI"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Kutipan Sorotan Aktif (jika ada) */}
          {selectedHighlight && (
            <div className="border-b bg-muted/50 px-4 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 text-xs">
                  <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p className="line-clamp-3 italic text-muted-foreground">
                    &ldquo;{selectedHighlight}&rdquo;
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearHighlight}
                  className="text-muted-foreground hover:text-foreground"
                  title="Hapus konteks sorotan"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Tombol Fitur Cepat (Quick Actions) */}
          <div className="flex flex-wrap gap-2 border-b px-4 py-2.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!selectedHighlight || isStreaming}
              onClick={() =>
                void sendAiRequest({
                  action: "explain_highlight",
                  userLabel: `Jelaskan teks yang saya sorot:\n"${selectedHighlight.slice(
                    0,
                    180
                  )}${selectedHighlight.length > 180 ? "..." : ""}"`,
                  badge: "Explain Highlight",
                })
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
              Jelaskan Sorotan
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isStreaming}
              onClick={() =>
                void sendAiRequest({
                  action: "summarize_chapter",
                  userLabel: "Rangkum bab / bagian bacaan yang sedang terbuka ini.",
                  badge: "Summarize Chapter",
                })
              }
            >
              <FileText className="h-3.5 w-3.5" />
              Rangkum Bab Ini
            </Button>
          </div>

          {/* Riwayat Percakapan */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
                <Sparkles className="mb-3 h-8 w-8 opacity-40" />
                <p className="font-medium text-foreground">
                  Teman Diskusi Bacaan Anda
                </p>
                <p className="mt-1 text-xs leading-relaxed">
                  Sorot kalimat di buku lalu klik{" "}
                  <strong>Jelaskan Sorotan</strong>, gunakan{" "}
                  <strong>Rangkum Bab Ini</strong>, atau ajukan pertanyaan bebas
                  di bawah.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {msg.badge && (
                    <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {msg.badge}
                    </span>
                  )}
                  <div
                    className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border bg-card text-card-foreground"
                    }`}
                  >
                    {msg.content ||
                      (isStreaming ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Menyusun jawaban...
                        </span>
                      ) : null)}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Form Input Chat Bebas */}
          <form
            onSubmit={handleFormSubmit}
            className="flex items-center gap-2 border-t p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanyakan apa saja tentang bagian ini..."
              disabled={isStreaming}
              className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isStreaming}
              title="Kirim pertanyaan"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </aside>
      )}
    </>
  );
}

