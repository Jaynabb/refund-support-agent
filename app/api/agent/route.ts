import { runAgentTurn } from "@/lib/agent/loop";
import type { ChatMessage } from "@/lib/types";

// The agent uses fs + the Anthropic SDK, so it must run on the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { messages: ChatMessage[] } → Server-Sent Events, one per agent step.
// The customer chat consumes the final `agent_message`; the admin panel renders
// every event live as the reasoning timeline.
export async function POST(req: Request) {
  const { messages, conversationId } = (await req.json()) as { messages: ChatMessage[]; conversationId?: string };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const event of runAgentTurn(messages, conversationId)) send(event);
      } catch (err) {
        send({ type: "error", label: err instanceof Error ? err.message : "stream error", ts: Date.now() });
      }
      controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
