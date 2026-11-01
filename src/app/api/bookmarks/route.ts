import { NextResponse, type NextRequest } from "next/server";
import {
  handleRouteError,
  requireAuthorizedSession,
} from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BookmarkAndNoteRow } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * GET /api/bookmarks?fileId=<googleFileId>
 * Mengambil seluruh markah halaman, sorotan teks, dan catatan pada satu buku.
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
    const { data, error } = await supabase
      .from("bookmarks_and_notes")
      .select("*")
      .eq("google_file_id", fileId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Gagal memuat daftar markah: ${error.message}`);
    }

    return NextResponse.json({
      bookmarks: (data ?? []) as BookmarkAndNoteRow[],
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

interface CreateBookmarkPayload {
  googleFileId?: string;
  location?: string;
  highlightedText?: string | null;
  note?: string | null;
}

/**
 * POST /api/bookmarks
 * Menyimpan markah halaman atau sorotan kutipan baru.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthorizedSession();
    const body = (await request.json()) as CreateBookmarkPayload;

    const googleFileId = body.googleFileId?.trim();
    const location = body.location?.trim();

    if (!googleFileId || !location) {
      return NextResponse.json(
        { error: "Field googleFileId dan location wajib diisi." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("bookmarks_and_notes")
      .insert({
        google_file_id: googleFileId,
        location,
        highlighted_text: body.highlightedText?.trim() || null,
        note: body.note?.trim() || null,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Gagal menyimpan markah: ${error.message}`);
    }

    return NextResponse.json({
      bookmark: data as BookmarkAndNoteRow,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/bookmarks?id=<uuid>
 * Menghapus satu item markah/catatan berdasarkan ID.
 */
export async function DELETE(request: NextRequest) {
  try {
    await requireAuthorizedSession();
    const id = request.nextUrl.searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json(
        { error: "Query parameter id wajib diisi." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("bookmarks_and_notes")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`Gagal menghapus markah: ${error.message}`);
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

