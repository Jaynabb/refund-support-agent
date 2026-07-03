// Text-to-speech via ElevenLabs. POST { text } → audio/mpeg stream (Ava's voice).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) return new Response("No text", { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5", // low-latency model, good for a live voice agent
      voice_settings: { stability: 0.4, similarity_boost: 0.7 },
    }),
  });

  if (!res.ok || !res.body) {
    return new Response(await res.text(), { status: res.status || 500 });
  }
  return new Response(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
