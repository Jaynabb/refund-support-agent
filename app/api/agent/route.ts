import { runAgentTurn } from "@/lib/agent/loop";
import type { ChatMessage } from "@/lib/types";

// The agent uses fs + the Anthropic SDK, so it must run on the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { messages: ChatMessage[] } → Server-Sent Events, one per agent step.
// The customer chat consumes the final `agent_message`; the admin panel renders
// every event live as the reasoning timeline.
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 2_000;
const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,64}$/;

function parseBody(raw: unknown): { messages: ChatMessage[]; conversationId?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const { messages, conversationId } = raw as { messages?: unknown; conversationId?: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
  const clean: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    if (content.length === 0 || content.length > MAX_MESSAGE_CHARS) return null;
    clean.push({ role, content });
  }
  if (conversationId !== undefined && (typeof conversationId !== "string" || !CONVERSATION_ID.test(conversationId))) return null;
  return { messages: clean, conversationId: conversationId as string | undefined };
}

export async function POST(req: Request) {
  let parsed: ReturnType<typeof parseBody> = null;
  try { parsed = parseBody(await req.json()); } catch { /* malformed JSON */ }
  if (!parsed) return Response.json({ error: "invalid request body" }, { status: 400 });
  const { messages, conversationId } = parsed;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const event of runAgentTurn(messages, conversationId)) send(event);
      } catch (err) {
        console.error("[api/agent]", err);
        send({ type: "error", label: "The agent hit an error. Please try again.", ts: Date.now() });
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
