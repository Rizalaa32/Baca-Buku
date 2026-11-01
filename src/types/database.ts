import type { BookFileType } from "./drive";

export interface BookMetadataRow {
  id: string;
  google_file_id: string;
  title: string;
  file_type: BookFileType;
  total_pages_or_locations: number | null;
  cover_url: string | null;
  file_size_bytes: number | null;
  drive_modified_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReadingProgressRow {
  id: string;
  google_file_id: string;
  current_location: string;
  percentage: number;
  last_read_at: string;
}

export interface BookmarkAndNoteRow {
  id: string;
  google_file_id: string;
  location: string;
  highlighted_text: string | null;
  note: string | null;
  created_at: string;
}

export interface LibraryBookItem {
  id: string;
  googleFileId: string;
  title: string;
  fileType: BookFileType;
  totalPagesOrLocations: number | null;
  coverUrl: string | null;
  fileSizeBytes: number | null;
  driveModifiedTime: string | null;
  progress: {
    currentLocation: string;
    percentage: number;
    lastReadAt: string;
  } | null;
}

