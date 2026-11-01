export type BookFileType = "epub" | "pdf";

export interface GoogleDriveRawFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  modifiedTime: string;
  parents?: string[];
}

export interface GoogleDriveListResponse {
  nextPageToken?: string;
  files: GoogleDriveRawFile[];
}

export interface NormalizedDriveBook {
  googleFileId: string;
  rawFileName: string;
  title: string;
  fileType: BookFileType;
  mimeType: string;
  sizeBytes: number | null;
  thumbnailLink: string | null;
  modifiedTime: string;
}

