-- ============================================================================
-- Migration: 0001_initial_schema.sql
-- Project  : Baca-Buku (Personal Cloud E-Reader)
-- Database : Supabase PostgreSQL
-- ============================================================================

-- Pastikan ekstensi pgcrypto tersedia untuk gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TABEL: books_metadata
-- Menyimpan metadata buku yang disinkronkan dari folder Google Drive pribadi.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.books_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_file_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('epub', 'pdf')),
    -- Menyimpan jumlah halaman (PDF) atau total lokasi terindeks (EPUB)
    total_pages_or_locations INTEGER NULL CHECK (
        total_pages_or_locations IS NULL OR total_pages_or_locations >= 0
    ),
    cover_url TEXT NULL,
    -- Metadata tambahan opsional untuk validasi cache & tampilan ukuran file
    file_size_bytes BIGINT NULL,
    drive_modified_time TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.books_metadata IS 'Metadata buku PDF & EPUB dari Google Drive pribadi.';
COMMENT ON COLUMN public.books_metadata.total_pages_or_locations IS 'Total halaman untuk PDF atau total lokasi (locations) untuk EPUB.';

-- ----------------------------------------------------------------------------
-- 2. TABEL: reading_progress
-- Menyimpan posisi baca terakhir lintas perangkat (1 baris unik per buku).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reading_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_file_id TEXT NOT NULL UNIQUE
        REFERENCES public.books_metadata (google_file_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    -- EpubCFI string untuk EPUB (mis. "epubcfi(/6/4!/4/2:0)"), nomor halaman untuk PDF (mis. "45")
    current_location TEXT NOT NULL,
    percentage DOUBLE PRECISION NOT NULL DEFAULT 0.0
        CHECK (percentage >= 0.0 AND percentage <= 100.0),
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.reading_progress IS 'Sinkronisasi progres halaman/lokasi baca lintas perangkat.';

-- ----------------------------------------------------------------------------
-- 3. TABEL: bookmarks_and_notes
-- Menyimpan kutipan sorotan (highlight), markah halaman, dan catatan pribadi.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookmarks_and_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_file_id TEXT NOT NULL
        REFERENCES public.books_metadata (google_file_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    location TEXT NOT NULL,
    highlighted_text TEXT NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.bookmarks_and_notes IS 'Daftar markah halaman, sorotan teks, dan catatan pembaca.';

-- ----------------------------------------------------------------------------
-- 4. INDEXES UNTUK PERFORMA QUERY DASHBOARD & READER
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_books_metadata_file_type
    ON public.books_metadata (file_type);

CREATE INDEX IF NOT EXISTS idx_books_metadata_title
    ON public.books_metadata (LOWER(title));

CREATE INDEX IF NOT EXISTS idx_reading_progress_last_read_at
    ON public.reading_progress (last_read_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookmarks_google_file_id_created
    ON public.bookmarks_and_notes (google_file_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. TRIGGER AUTO-UPDATE updated_at PADA books_metadata
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_books_metadata_updated_at ON public.books_metadata;
CREATE TRIGGER trg_books_metadata_updated_at
    BEFORE UPDATE ON public.books_metadata
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS)
-- Karena autentikasi dikelola oleh NextAuth (Google OAuth + ALLOWED_EMAIL),
-- seluruh akses database dijalankan di sisi server menggunakan SUPABASE_SERVICE_ROLE_KEY.
-- Mengaktifkan RLS tanpa policy publik menutup seluruh akses anon/publik PostgREST.
-- ----------------------------------------------------------------------------
ALTER TABLE public.books_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks_and_notes ENABLE ROW LEVEL SECURITY;

