import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BookFileType } from "@/types/drive";

const DB_NAME = "baca-buku-ereader-cache";
const DB_VERSION = 1;
const STORE_NAME = "books_binary";
const MAX_CACHED_BOOKS = 12;

export interface CachedBookEntry {
  googleFileId: string;
  fileType: BookFileType;
  mimeType: string;
  buffer: ArrayBuffer;
  sizeBytes: number;
  driveModifiedTime: string | null;
  cachedAt: number;
  lastAccessedAt: number;
}

interface EReaderCacheSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: CachedBookEntry;
    indexes: {
      "by-last-accessed": number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<EReaderCacheSchema>> | null = null;

function getCacheDB(): Promise<IDBPDatabase<EReaderCacheSchema>> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("IndexedDB hanya tersedia di lingkungan browser.")
    );
  }

  if (!dbPromise) {
    dbPromise = openDB<EReaderCacheSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "googleFileId",
          });
          store.createIndex("by-last-accessed", "lastAccessedAt");
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Mengambil buku dari IndexedDB jika tersedia dan belum usang dibanding modifiedTime Google Drive.
 */
export async function getCachedBookBinary(
  googleFileId: string,
  expectedModifiedTime?: string | null
): Promise<CachedBookEntry | null> {
  try {
    const db = await getCacheDB();
    const entry = await db.get(STORE_NAME, googleFileId);
    if (!entry) return null;

    // Invalidasi otomatis bila file di Google Drive diperbarui
    if (
      expectedModifiedTime &&
      entry.driveModifiedTime &&
      entry.driveModifiedTime !== expectedModifiedTime
    ) {
      await db.delete(STORE_NAME, googleFileId);
      return null;
    }

    // Perbarui waktu akses terakhir (LRU)
    const updated: CachedBookEntry = {
      ...entry,
      lastAccessedAt: Date.now(),
    };
    await db.put(STORE_NAME, updated);
    return updated;
  } catch (err) {
    console.warn("[BookCache] Gagal membaca cache IndexedDB:", err);
    return null;
  }
}

/**
 * Menyimpan ArrayBuffer buku ke IndexedDB dan memangkas buku terlama (LRU) bila melebihi batas.
 */
export async function saveBookBinaryToCache(
  entry: Omit<CachedBookEntry, "cachedAt" | "lastAccessedAt">
): Promise<void> {
  try {
    const db = await getCacheDB();
    const now = Date.now();

    await db.put(STORE_NAME, {
      ...entry,
      cachedAt: now,
      lastAccessedAt: now,
    });

    // Kebijakan LRU sederhana agar penyimpanan perangkat tetap hemat
    const allByAccess = await db.getAllFromIndex(
      STORE_NAME,
      "by-last-accessed"
    );
    if (allByAccess.length > MAX_CACHED_BOOKS) {
      const excessCount = allByAccess.length - MAX_CACHED_BOOKS;
      const toRemove = allByAccess.slice(0, excessCount);
      const tx = db.transaction(STORE_NAME, "readwrite");
      await Promise.all([
        ...toRemove.map((item) => tx.store.delete(item.googleFileId)),
        tx.done,
      ]);
    }
  } catch (err) {
    console.warn("[BookCache] Gagal menyimpan buku ke IndexedDB:", err);
  }
}

export async function clearAllCachedBooks(): Promise<void> {
  const db = await getCacheDB();
  await db.clear(STORE_NAME);
}

/**
 * Mengunduh stream buku dari `/api/drive/stream/[fileId]` dengan indikator progres,
 * lalu menyimpannya ke IndexedDB untuk akses instan pada pembukaan berikutnya.
 */
export async function loadBookWithIndexedDbCache(options: {
  googleFileId: string;
  expectedModifiedTime?: string | null;
  signal?: AbortSignal;
  onProgress?: (percent: number | null, loadedBytes: number) => void;
}): Promise<CachedBookEntry> {
  const { googleFileId, expectedModifiedTime, signal, onProgress } = options;

  const cached = await getCachedBookBinary(googleFileId, expectedModifiedTime);
  if (cached) {
    onProgress?.(100, cached.sizeBytes);
    return cached;
  }

  const response = await fetch(
    `/api/drive/stream/${encodeURIComponent(googleFileId)}`,
    {
      method: "GET",
      signal,
    }
  );

  if (!response.ok || !response.body) {
    const errPayload = await response.json().catch(() => null);
    throw new Error(
      errPayload?.error ??
        `Gagal mengunduh file buku (HTTP ${response.status}).`
    );
  }

  const totalBytesHeader = response.headers.get("Content-Length");
  const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : 0;
  const mimeType =
    response.headers.get("Content-Type") ?? "application/octet-stream";
  const fileTypeHeader = response.headers.get("X-Book-File-Type");
  const fileType: BookFileType =
    fileTypeHeader === "epub" || mimeType.includes("epub") ? "epub" : "pdf";
  const driveModifiedTime =
    response.headers.get("X-Drive-Modified-Time") ??
    expectedModifiedTime ??
    null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.byteLength;
      const percent =
        totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : null;
      onProgress?.(percent, receivedBytes);
    }
  }

  const combined = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const buffer = combined.buffer;

  await saveBookBinaryToCache({
    googleFileId,
    fileType,
    mimeType,
    buffer,
    sizeBytes: receivedBytes,
    driveModifiedTime,
  });

  return {
    googleFileId,
    fileType,
    mimeType,
    buffer,
    sizeBytes: receivedBytes,
    driveModifiedTime,
    cachedAt: Date.now(),
    lastAccessedAt: Date.now(),
  };
}

