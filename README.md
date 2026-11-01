# Baca Buku — Personal Cloud E-Reader

Aplikasi web pribadi (*Single-User Personal Cloud E-Reader*) untuk membaca koleksi **PDF & EPUB** langsung dari folder **Google Drive** pribadi, lengkap dengan sinkronisasi halaman lintas perangkat via **Supabase** dan **AI Reading Buddy (`gemini-3.8-flash`)**.

## Fitur Utama
- **Google Drive API v3 Streaming**: Menampilkan buku dari `GOOGLE_DRIVE_FOLDER_ID` dan melakukan streaming binary langsung (`206 Partial Content` / `ReadableStream`) tanpa menyimpan file di server Vercel.
- **Cache Offline Cerdas (IndexedDB)**: Menyimpan buku aktif di browser (LRU maks. 12 buku) dengan invalidasi otomatis berdasarkan `modifiedTime` Google Drive.
- **Cross-Device Sync (Supabase)**: Auto-save posisi halaman PDF atau `EpubCFI` dengan debounce 1.5 detik + flush saat tab ditutup.
- **EPUB & PDF Reader Lengkap**:
  - **EPUB**: Navigasi *swipe* (HP) & panah keyboard, Daftar Isi (ToC), tema *Light / Warm Sepia / AMOLED*, font *Serif / Sans-Serif / Dyslexic*, slider ukuran huruf & tinggi baris.
  - **PDF**: Mode *Continuous Vertical Scroll* & *Single-Page*, *Zoom In/Out*, serta *Fit to Width*.
- **AI Reading Buddy (`@google/genai` + `gemini-3.8-flash`)**: *Explain Highlight*, *Summarize Chapter*, dan diskusi *multi-turn* kontekstual.
- **PWA Ready**: Dapat di-install di Android, iOS, maupun Desktop.

## Cara Menjalankan Lokal
1. Salin `.env.example` ke `.env.local` dan lengkapi kredensial Google OAuth, `GOOGLE_DRIVE_FOLDER_ID`, Supabase, serta `GEMINI_API_KEY`.
2. Jalankan isi `supabase/migrations/0001_initial_schema.sql` pada **SQL Editor** Supabase.
3. Jalankan perintah berikut:
   ```bash
   npm install
   npm run dev
   ```
4. Buka `http://localhost:3000`.
