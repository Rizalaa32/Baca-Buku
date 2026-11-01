import { NextResponse, type NextRequest } from "next/server";
import {
  buildReadingBuddySystemInstruction,
  DEFAULT_GEMINI_MODEL,
  getGeminiClient,
} from "@/lib/ai/gemini";
import {
  handleRouteError,
  requireAuthorizedSession,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AiQuickAction = "explain_highlight" | "summarize_chapter" | "chat";

interface AiChatRequestPayload {
  action?: AiQuickAction;
  message?: string;
  highlightedText?: string;
  chapterText?: string;
  bookTitle?: string;
  previousInteractionId?: string | null;
}

function composePrompt(payload: AiChatRequestPayload): string {
  const action = payload.action ?? "chat";
  const excerpt = payload.chapterText
    ? payload.chapterText.slice(0, 28_000)
    : "";

  if (action === "explain_highlight" && payload.highlightedText) {
    return [
      "Tolong jelaskan kutipan teks yang saya sorot berikut ini dengan bahasa yang jernih dan mendalam:",
      `"""\n${payload.highlightedText}\n"""`,
      excerpt
        ? `\nKonteks halaman/bab di sekitarnya:\n"""\n${excerpt.slice(0, 6_000)}\n"""`
        : "",
      payload.message ? `\nPertanyaan tambahan pembaca: ${payload.message}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (action === "summarize_chapter" && excerpt) {
    return [
      "Rangkum isi bab atau bagian bacaan berikut ke dalam poin-poin utama yang terstruktur, ringkas, dan mudah diingat:",
      `"""\n${excerpt}\n"""`,
      payload.message ? `\nFokus khusus: ${payload.message}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const userQuestion = payload.message?.trim() ?? "";
  if (payload.highlightedText) {
    return `Kutipan terkait:\n"""\n${payload.highlightedText}\n"""\n\nPertanyaan saya: ${userQuestion}`;
  }
  if (excerpt && !payload.previousInteractionId) {
    return `Konteks halaman yang sedang saya baca:\n"""\n${excerpt.slice(
      0,
      8_000
    )}\n"""\n\nPertanyaan saya: ${userQuestion}`;
  }

  return userQuestion;
}

/**
 * POST /api/ai/chat
 * Streaming respons AI Reading Buddy menggunakan Google GenAI Interactions API (gemini-3.8-flash).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthorizedSession();

    if (!process.env.GEMINI_API_KEY?.trim()) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY belum diisi pada .env.local. Buat API Key gratis di https://aistudio.google.com/apikey lalu simpan ke GEMINI_API_KEY.",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as AiChatRequestPayload;
    const prompt = composePrompt(body);

    if (!prompt.trim()) {
      return NextResponse.json(
        { error: "Pesan atau teks sorotan tidak boleh kosong." },
        { status: 400 }
      );
    }

    const client = getGeminiClient();
    const systemInstruction = buildReadingBuddySystemInstruction(body.bookTitle);

    const interactionStream = await client.interactions.create({
      model: DEFAULT_GEMINI_MODEL,
      system_instruction: systemInstruction,
      input: prompt,
      ...(body.previousInteractionId
        ? { previous_interaction_id: body.previousInteractionId }
        : {}),
      stream: true,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let latestInteractionId: string | null = null;

          for await (const event of interactionStream) {
            if (event.event_type === "interaction.created" && event.interaction?.id) {
              latestInteractionId = event.interaction.id;
            } else if (
              event.event_type === "step.delta" &&
              event.delta?.type === "text" &&
              event.delta.text
            ) {
              const line = JSON.stringify({
                type: "delta",
                text: event.delta.text,
              });
              controller.enqueue(encoder.encode(`${line}\n`));
            } else if (event.event_type === "interaction.completed") {
              latestInteractionId =
                event.interaction?.id ?? latestInteractionId;
              const doneLine = JSON.stringify({
                type: "done",
                interactionId: latestInteractionId,
              });
              controller.enqueue(encoder.encode(`${doneLine}\n`));
            }
          }
        } catch (streamErr: unknown) {
          const errMessage =
            streamErr instanceof Error
              ? streamErr.message
              : "Terjadi kendala saat streaming dari Gemini API.";
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: "error", error: errMessage })}\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(readable, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

