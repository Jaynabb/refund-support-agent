import { bus, redis, readSince, currentSeq } from "@/lib/events/bus";
import type { AgentEvent } from "@/lib/types";

// Server-Sent Events feed of live agent activity (from the voice agent's server
// tools). With Redis configured it POLLS a shared feed, so phone-call activity on
// one serverless instance reaches the browser on another — the panel updates during
// a real phone call. Locally it subscribes to the in-process bus.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // keep the SSE stream open; EventSource auto-reconnects after

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ }
      };
      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch { /* closed */ }
      }, 15000);

      const hello: AgentEvent = {
        type: "thinking", id: "live_hello", seq: 0, ts: Date.now(),
        label: redis
          ? "Live feed connected — start a chat or call the number."
          : "Live feed connected — tap the mic to begin.",
      };

      let cleanup: () => void;

      if (redis) {
        // Cross-instance: poll the shared feed for events newer than our cursor.
        let cursor = await currentSeq();
        send(hello);
        const poll = setInterval(async () => {
          try {
            const [events, next] = await readSince(cursor);
            cursor = next;
            for (const e of events) send(e);
          } catch { /* transient Redis error — try again next tick */ }
        }, 1000);
        cleanup = () => { clearInterval(poll); clearInterval(keepAlive); try { controller.close(); } catch {} };
      } else {
        // Local dev: in-process event bus.
        const onEvent = (e: AgentEvent) => send(e);
        bus.on("event", onEvent);
        send(hello);
        cleanup = () => { clearInterval(keepAlive); bus.off("event", onEvent); try { controller.close(); } catch {} };
      }

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
