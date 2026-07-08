import { EventEmitter } from "node:events";
import type { AgentEvent } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// In-process event bus. When the ElevenLabs voice agent calls our server tools
// (webhooks), each tool handler publishes an AgentEvent here; the /api/live SSE
// endpoint relays them to the browser so the admin panel shows the live voice
// session's reasoning in real time. Singleton across the dev-server process.
// ─────────────────────────────────────────────────────────────────────────────

const g = globalThis as unknown as { __refundBus?: EventEmitter; __seq?: number };
export const bus = g.__refundBus ?? (g.__refundBus = new EventEmitter());
bus.setMaxListeners(100);

export function publish(type: AgentEvent["type"], label: string, data?: unknown): void {
  g.__seq = (g.__seq ?? 0) + 1;
  const event: AgentEvent = { id: `live_${g.__seq}`, seq: g.__seq, ts: Date.now(), type, label, data };
  bus.emit("event", event);
}
