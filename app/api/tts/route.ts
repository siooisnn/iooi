import { TtsError, isTtsEnabled, synthesizeSpeech } from "../../lib/tts";
import { TTS_MAX_CHARS, hasSpeakableText, speakableText } from "../../lib/tts-text";

// GET: is the speaker available? POST { text }: the spoken MP3 for one bubble.

export async function GET() {
  return Response.json({ enabled: isTtsEnabled() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const raw = typeof body?.text === "string" ? body.text : "";
  if (raw.length > TTS_MAX_CHARS * 4) {
    return Response.json({ error: "这段太长了" }, { status: 413 });
  }
  if (!hasSpeakableText(raw)) {
    return Response.json({ error: "没有可以念的文字" }, { status: 400 });
  }

  try {
    const audio = await synthesizeSpeech(speakableText(raw));
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof TtsError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[tts] unexpected:", error);
    return Response.json({ error: "语音合成失败" }, { status: 500 });
  }
}
