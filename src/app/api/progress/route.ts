import { NextResponse, type NextRequest } from "next/server";
import {
  handleRouteError,
  requireAuthorizedSession,
} from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BookMetadataRow, ReadingProgressRow } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * GET /api/progress?fileId=<googleFileId>
 * Mengambil posisi baca terakhir + metadata buku untuk inisialisasi Reader lintas perangkat.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuthorizedSession();
    const fileId = request.nextUrl.searchParams.get("fileId")?.trim();

    if (!fileId) {
      return NextResponse.json(
        { error: "Query parameter fileId wajib diisi." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const [metaRes, progressRes] = await Promise.all([
      supabase
        .from("books_metadata")
        .select("*")
        .eq("google_file_id", fileId)
        .maybeSingle(),
      supabase
        .from("reading_progress")
        .select("*")
        .eq("google_file_id", fileId)
        .maybeSingle(),
    ]);

    if (metaRes.error) {
      throw new Error(`Gagal memuat metadata buku: ${metaRes.error.message}`);
    }
    if (progressRes.error) {
      throw new Error(
        `Gagal memuat progres baca: ${progressRes.error.message}`
      );
    }

    return NextResponse.json({
      metadata: (metaRes.data as BookMetadataRow | null) ?? null,
      progress: (progressRes.data as ReadingProgressRow | null) ?? null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

interface SaveProgressPayload {
  googleFileId?: string;
  title?: string;
  fileType?: "epub" | "pdf";
  currentLocation?: string;
  percentage?: number;
  totalPagesOrLocations?: number | null;
}

/**
 * POST /api/progress
 * Menyimpan/memperbarui posisi bacaan secara atomik (UPSERT berdasarkan google_file_id).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthorizedSession();
    const body = (await request.json()) as SaveProgressPayload;

    const googleFileId = body.googleFileId?.trim();
    const currentLocation = body.currentLocation?.trim();
    const rawPct = Number(body.percentage ?? 0);

    if (!googleFileId || !currentLocation || Number.isNaN(rawPct)) {
      return NextResponse.json(
        {
          error:
            "Field googleFileId, currentLocation, dan percentage wajib diisi dengan benar.",
        },
        { status: 400 }
      );
    }

    const clampedPercentage = Math.min(100, Math.max(0, Number(rawPct.toFixed(2))));
    const supabase = getSupabaseAdmin();

    // Pastikan baris books_metadata tersedia (agar foreign key reading_progress selalu terpenuhi)
    // sekaligus perbarui total_pages_or_locations bila dikirim oleh Reader.
    const existingMetaRes = await supabase
      .from("books_metadata")
      .select("google_file_id, total_pages_or_locations")
      .eq("google_file_id", googleFileId)
      .maybeSingle();

    if (existingMetaRes.error) {
      throw new Error(
        `Gagal memeriksa metadata buku: ${existingMetaRes.error.message}`
      );
    }

    const validTotal =
      typeof body.totalPagesOrLocations === "number" &&
      body.totalPagesOrLocations > 0
        ? Math.round(body.totalPagesOrLocations)
        : null;

    if (!existingMetaRes.data) {
      const { error: insertMetaErr } = await supabase
        .from("books_metadata")
        .insert({
          google_file_id: googleFileId,
          title: body.title?.trim() || "Buku Tanpa Judul",
          file_type: body.fileType === "epub" ? "epub" : "pdf",
          total_pages_or_locations: validTotal,
        });

      if (insertMetaErr) {
        throw new Error(
          `Gagal membuat metadata buku awal: ${insertMetaErr.message}`
        );
      }
    } else if (
      validTotal !== null &&
      existingMetaRes.data.total_pages_or_locations !== validTotal
    ) {
      const { error: updateTotalErr } = await supabase
        .from("books_metadata")
        .update({ total_pages_or_locations: validTotal })
        .eq("google_file_id", googleFileId);

      if (updateTotalErr) {
        console.warn(
          "[Progress API] Gagal memperbarui total_pages_or_locations:",
          updateTotalErr.message
        );
      }
    }

    const nowIso = new Date().toISOString();
    const { data: savedProgress, error: progressErr } = await supabase
      .from("reading_progress")
      .upsert(
        {
          google_file_id: googleFileId,
          current_location: currentLocation,
          percentage: clampedPercentage,
          last_read_at: nowIso,
        },
        { onConflict: "google_file_id" }
      )
      .select("*")
      .single();

    if (progressErr) {
      throw new Error(
        `Gagal menyimpan progres baca ke Supabase: ${progressErr.message}`
      );
    }

    return NextResponse.json({
      progress: savedProgress as ReadingProgressRow,
      savedAt: nowIso,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

