// Speech-to-text via OpenAI Whisper. POST multipart { audio } → { text }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return Response.json({ error: "No audio" }, { status: 400 });

  const oa = new FormData();
  oa.append("file", audio, "speech.webm");
  oa.append("model", "whisper-1");
  oa.append("language", "en");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` },
    body: oa,
  });

  if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
  const data = (await res.json()) as { text?: string };
  return Response.json({ text: data.text ?? "" });
}
