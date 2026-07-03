import { bus } from "@/lib/events/bus";
import type { AgentEvent } from "@/lib/types";

// Server-Sent Events feed of live agent activity (from phone-call server tools).
// The admin panel opens an EventSource here and renders events as they arrive.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const onEvent = (e: AgentEvent) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ }
      };
      bus.on("event", onEvent);
      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch { /* closed */ }
      }, 15000);

      const close = () => { clearInterval(keepAlive); bus.off("event", onEvent); try { controller.close(); } catch {} };
      req.signal.addEventListener("abort", close);
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking", label: "Live feed connected — call the number to begin.", ts: Date.now(), id: "live_hello", seq: 0 })}\n\n`));
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
