// Returns a short-lived signed URL so the browser can open a real-time voice
// session with the private "Ava" agent (WebRTC, continuous — no push-to-talk).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return Response.json({ error: "ELEVENLABS_AGENT_ID not set" }, { status: 500 });

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" } },
  );
  if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
  const data = (await res.json()) as { signed_url?: string };
  return Response.json({ signedUrl: data.signed_url });
}
