import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findOrder } from "@/lib/data/crm";
import type { RefundDecision } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Conversation store. Every refund interaction — text or browser voice —
// is logged here. The CRM has exactly 15 standing accounts (the seed customers);
// conversations are a separate, growing activity LOG shown alongside them, not
// additional accounts — so they never change the account count. A logged decision
// also feeds the customer's refund history, which the next policy check reads.
// Persisted to a JSON file so it survives restarts.
// ─────────────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  channel: "text" | "voice";
  customerName: string;
  orderId?: string;
  reason?: string;
  decision?: RefundDecision | "pending";
  amount?: number;
  createdAt: number;
  updatedAt: number;
}

// On Vercel the project dir is read-only; only /tmp is writable. Fall back there
// so serverless invocations (e.g. the phone agent's webhooks) can still log.
const DIR = process.env.VERCEL ? join(tmpdir(), "refund-agent-data") : join(process.cwd(), ".data");
const FILE = join(DIR, "conversations.json");

function load(): Conversation[] {
  try { return JSON.parse(readFileSync(FILE, "utf8")) as Conversation[]; } catch { return []; }
}
function save(list: Conversation[]): void {
  // Best-effort: the activity log is a nice-to-have, never worth 500-ing a refund
  // over if the filesystem is read-only.
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(list, null, 2));
  } catch { /* read-only FS — skip persistence */ }
}

export function getConversations(): Conversation[] {
  return load().sort((a, b) => b.createdAt - a.createdAt);
}

// Upsert a conversation by id — so multiple turns of one chat/call collapse into a
// single growing record rather than a row per tool call.
export function logConversation(input: {
  id: string;
  channel: "text" | "voice";
  orderId?: string;
  reason?: string;
  decision?: RefundDecision | "pending";
  amount?: number;
  customerName?: string;
}): Conversation {
  const list = load();
  const now = Date.now();

  // Resolve the customer name from the order when we can.
  let name = input.customerName;
  if (!name && input.orderId) name = findOrder(input.orderId)?.customer.name;

  const idx = list.findIndex((c) => c.id === input.id);
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = {
      ...prev,
      channel: input.channel,
      orderId: input.orderId ?? prev.orderId,
      reason: input.reason ?? prev.reason,
      decision: input.decision ?? prev.decision,
      amount: input.amount ?? prev.amount,
      customerName: name ?? prev.customerName,
      updatedAt: now,
    };
    save(list);
    return list[idx];
  }

  const rec: Conversation = {
    id: input.id,
    channel: input.channel,
    customerName: name ?? "New caller",
    orderId: input.orderId,
    reason: input.reason,
    decision: input.decision ?? "pending",
    amount: input.amount,
    createdAt: now,
    updatedAt: now,
  };
  list.push(rec);
  save(list);
  return rec;
}
