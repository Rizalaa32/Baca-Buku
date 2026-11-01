import "server-only";
import { GoogleGenAI } from "@google/genai";

let genAiClient: GoogleGenAI | null = null;

export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

export function getGeminiClient(): GoogleGenAI {
  if (genAiClient) {
    return genAiClient;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi pada environment variables.");
  }

  genAiClient = new GoogleGenAI({ apiKey });
  return genAiClient;
}

export function buildReadingBuddySystemInstruction(bookTitle?: string): string {
  const contextLine = bookTitle
    ? `Pengguna sedang membaca buku berjudul "${bookTitle}".`
    : "Pengguna sedang membaca buku di aplikasi Personal Cloud E-Reader.";

  return [
    "Anda adalah AI Reading Buddy yang cerdas, ringkas, dan suportif.",
    contextLine,
    "Gunakan Bahasa Indonesia yang jelas dan mudah dipahami, kecuali istilah teknis yang lebih tepat dipertahankan dalam bahasa aslinya.",
    "Saat menjelaskan kutipan (highlight), uraikan makna inti, konteks argumen penulis, dan contoh konkret bila relevan.",
    "Saat merangkum bab, susun dalam poin-poin terstruktur yang padat tanpa menghilangkan gagasan kunci.",
  ].join(" ");
}

