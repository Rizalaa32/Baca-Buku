import type {
  BookFileType,
  GoogleDriveListResponse,
  GoogleDriveRawFile,
  NormalizedDriveBook,
} from "@/types/drive";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export class DriveApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DriveApiError";
    this.status = status;
  }
}

export function getConfiguredFolderId(): string {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new DriveApiError(
      "GOOGLE_DRIVE_FOLDER_ID belum dikonfigurasi pada environment variables.",
      500
    );
  }
  return folderId;
}

/**
 * Menentukan tipe buku ('epub' | 'pdf').
 * Google Drive terkadang melabeli file .epub sebagai 'application/octet-stream',
 * sehingga pengecekan ekstensi nama file wajib dikombinasikan dengan mimeType.
 */
export function resolveBookFileType(
  fileName: string,
  mimeType: string
): BookFileType | null {
  const lowerName = fileName.trim().toLowerCase();
  const lowerMime = mimeType.trim().toLowerCase();

  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    lowerMime === "application/epub+zip" ||
    lowerMime === "application/epub" ||
    lowerName.endsWith(".epub")
  ) {
    return "epub";
  }

  return null;
}

export function cleanBookTitle(fileName: string): string {
  return fileName
    .replace(/\.(epub|pdf)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function upgradeThumbnailResolution(thumbnailLink?: string): string | null {
  if (!thumbnailLink) return null;
  // Default thumbnail Google Drive adalah =s220 (resolusi rendah); naikkan ke =s600
  return thumbnailLink.replace(/=s\d+$/, "=s600");
}

function normalizeDriveFile(file: GoogleDriveRawFile): NormalizedDriveBook | null {
  const fileType = resolveBookFileType(file.name, file.mimeType);
  if (!fileType) return null;

  return {
    googleFileId: file.id,
    rawFileName: file.name,
    title: cleanBookTitle(file.name) || file.name,
    fileType,
    mimeType:
      fileType === "epub" ? "application/epub+zip" : "application/pdf",
    sizeBytes: file.size ? Number(file.size) : null,
    thumbnailLink: upgradeThumbnailResolution(file.thumbnailLink),
    modifiedTime: file.modifiedTime,
  };
}

/**
 * Mengambil seluruh daftar file .pdf & .epub dari folder Google Drive (mendukung paginasi).
 */
export async function listBooksFromDriveFolder(
  accessToken: string,
  customFolderId?: string
): Promise<NormalizedDriveBook[]> {
  const folderId = (customFolderId ?? getConfiguredFolderId()).replace(/'/g, "\\'");
  const query = [
    `'${folderId}' in parents`,
    "trashed = false",
    "mimeType != 'application/vnd.google-apps.folder'",
    "(mimeType = 'application/pdf' or mimeType = 'application/epub+zip' or name contains '.epub' or name contains '.pdf')",
  ].join(" and ");

  const collected: NormalizedDriveBook[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      pageSize: "100",
      fields:
        "nextPageToken,files(id,name,mimeType,size,thumbnailLink,modifiedTime)",
      orderBy: "modifiedTime desc",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new DriveApiError(
        `Gagal membaca daftar buku dari Google Drive (${response.status}): ${errBody}`,
        response.status
      );
    }

    const data = (await response.json()) as GoogleDriveListResponse;
    for (const rawFile of data.files ?? []) {
      const normalized = normalizeDriveFile(rawFile);
      if (normalized) {
        collected.push(normalized);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return collected;
}

/**
 * Mengambil metadata satu file buku sekaligus memvalidasi bahwa file tersebut
 * berada di dalam folder GOOGLE_DRIVE_FOLDER_ID milik user.
 */
export async function getVerifiedDriveBookMetadata(
  accessToken: string,
  fileId: string
): Promise<NormalizedDriveBook & { rawThumbnailLink: string | null }> {
  const allowedFolderId = getConfiguredFolderId();
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,thumbnailLink,modifiedTime,parents",
    supportsAllDrives: "true",
  });

  const response = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new DriveApiError(
      `File buku tidak ditemukan di Google Drive (${response.status}).`,
      response.status
    );
  }

  const rawFile = (await response.json()) as GoogleDriveRawFile;

  if (rawFile.parents && !rawFile.parents.includes(allowedFolderId)) {
    throw new DriveApiError(
      "Akses ditolak: file tidak berada di dalam folder koleksi buku yang diizinkan.",
      403
    );
  }

  const normalized = normalizeDriveFile(rawFile);
  if (!normalized) {
    throw new DriveApiError(
      "Format file tidak didukung. Hanya mendukung PDF dan EPUB.",
      415
    );
  }

  return {
    ...normalized,
    rawThumbnailLink: upgradeThumbnailResolution(rawFile.thumbnailLink),
  };
}

/**
 * Mengambil stream binary buku langsung dari Google Drive API v3 (?alt=media)
 * tanpa menyimpannya ke disk ataupun mem-buffer seluruh isi file di RAM server Vercel.
 * Mendukung HTTP Range Request untuk pemuatan PDF secara parsial.
 */
export async function fetchDriveFileBinaryStream(
  accessToken: string,
  fileId: string,
  rangeHeader?: string | null
): Promise<Response> {
  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
  });

  if (rangeHeader) {
    headers.set("Range", rangeHeader);
  }

  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(
    fileId
  )}?alt=media&supportsAllDrives=true`;

  const upstream = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!upstream.ok && upstream.status !== 206) {
    const errText = await upstream.text().catch(() => "");
    throw new DriveApiError(
      `Gagal mengunduh stream buku dari Google Drive (${upstream.status}): ${errText}`,
      upstream.status
    );
  }

  return upstream;
}

