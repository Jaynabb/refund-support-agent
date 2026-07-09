import { EventEmitter } from "node:events";
import { Redis } from "@upstash/redis";
import type { AgentEvent } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Cross-instance event bus.
//
// On Vercel the webhook that runs a voice/phone tool and the browser's /api/live
// stream land on DIFFERENT serverless instances, so an in-memory bus can't reach
// the panel. When Redis is configured we publish events to a shared sorted set
// (scored by a global counter) that the live feed polls — so a phone call lights
// up the panel in real time. Locally we fall back to an in-process EventEmitter,
// so `npm run dev` needs no external services.
// ─────────────────────────────────────────────────────────────────────────────

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const redis = url && token ? new Redis({ url, token }) : null;

const FEED = "refund:feed";
const SEQ = "refund:seq";
const FEED_TTL = 3600; // seconds — the feed self-expires
const FEED_CAP = 500; // keep only the newest N events

// Local-dev in-process bus (used only when Redis is not configured).
const g = globalThis as unknown as { __refundBus?: EventEmitter; __seq?: number };
export const bus = g.__refundBus ?? (g.__refundBus = new EventEmitter());
bus.setMaxListeners(100);

export async function publish(type: AgentEvent["type"], label: string, data?: unknown): Promise<void> {
  if (redis) {
    const seq = await redis.incr(SEQ);
    const event: AgentEvent = { id: `live_${seq}`, seq, ts: Date.now(), type, label, data };
    await redis.zadd(FEED, { score: seq, member: JSON.stringify(event) });
    await redis.zremrangebyrank(FEED, 0, -(FEED_CAP + 1));
    await redis.expire(FEED, FEED_TTL);
    return;
  }
  g.__seq = (g.__seq ?? 0) + 1;
  const event: AgentEvent = { id: `live_${g.__seq}`, seq: g.__seq, ts: Date.now(), type, label, data };
  bus.emit("event", event);
}

// The current max seq — the live feed starts here so it streams only NEW events
// (not the whole backlog) when a browser connects.
export async function currentSeq(): Promise<number> {
  if (!redis) return 0;
  return Number(await redis.get(SEQ)) || 0;
}

// Events with seq strictly greater than `cursor`. Returns [events, newCursor].
export async function readSince(cursor: number): Promise<[AgentEvent[], number]> {
  if (!redis) return [[], cursor];
  const raw = await redis.zrange<string[]>(FEED, cursor + 1, "+inf", { byScore: true });
  const events: AgentEvent[] = [];
  let next = cursor;
  for (const item of raw) {
    try {
      const ev = (typeof item === "string" ? JSON.parse(item) : item) as AgentEvent;
      events.push(ev);
      if (ev.seq > next) next = ev.seq;
    } catch { /* skip malformed */ }
  }
  return [events, next];
}
