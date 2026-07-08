// Creates (or updates) the "Ava" refund voice agent on ElevenLabs Conversational AI,
// with server tools pointing at THIS app's webhook endpoints so the in-browser voice
// agent enforces the same deterministic policy engine as the text agent.
//
// Usage:  node scripts/create-ava-agent.mjs <PUBLIC_BASE_URL>
//   e.g.  node scripts/create-ava-agent.mjs https://abc123.ngrok-free.app
// Reads ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID from .env.local.

import { readFileSync } from "node:fs";

const BASE = process.argv[2];
if (!BASE || !BASE.startsWith("http")) {
  console.error("Usage: node scripts/create-ava-agent.mjs <PUBLIC_BASE_URL>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = env.ELEVENLABS_API_KEY;
const VOICE = env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

const SYSTEM = `You are Ava, a friendly AI voice support agent for Acme Store, handling refund requests. Keep replies short and natural — you're on a live voice call.

You do NOT decide eligibility yourself; the tools do. Workflow: when the caller gives their name (e.g. "I'm Maria") or email, call lookup_customer to find their order — you do NOT need an order ID first; if they give an order ID, use lookup_order. If they have one order, use it; if more than one, confirm which. Determine the reason (defective, damaged, wrong item, not as described, or changed mind); call check_refund_policy; then act on its decision — approve → issue_refund; deny → explain warmly and cite the specific reason. If a caller pushes back on a valid denial, stay kind but firm, restate the policy, and never invent exceptions. Read order IDs back as "order ten-oh-one" style if helpful. Completed actions are FINAL — once you issue a refund for an order, do NOT check policy on it again or second-guess it; after a refund the order correctly shows as already-refunded, which is expected, not a failure. If the caller thanks you or says goodbye, just close warmly — never retract a refund you already completed.`;

// A server (webhook) tool → one of our /api/agent-tools/* endpoints.
const tool = (name, description, seg, properties, required) => ({
  type: "webhook",
  name,
  description,
  response_timeout_secs: 20,
  api_schema: {
    url: `${BASE}/api/agent-tools/${seg}`,
    method: "POST",
    request_body_schema: { type: "object", properties, required },
  },
});

const tools = [
  tool("lookup_customer", "Find a customer by name (or email) and return their orders. Use the moment the caller gives their name — you do NOT need an order ID first.", "lookup-customer",
    { name: { type: "string", description: "Caller's name, e.g. Maria or Maria Alvarez" }, email: { type: "string", description: "Caller's email, if given" } }, []),
  tool("lookup_order", "Look up an order by its ID (e.g. ORD-1001). Returns items, delivery date, total, and refund status.", "lookup-order",
    { orderId: { type: "string", description: "Order ID, e.g. ORD-1001" } }, ["orderId"]),
  tool("check_refund_policy", "Authoritative eligibility check. Returns approve/deny, the eligible amount, and the rules checked. Always call before deciding.", "check-policy",
    { orderId: { type: "string", description: "Order ID" }, reason: { type: "string", description: "defective, damaged, wrong_item, not_as_described, or changed_mind" } }, ["orderId", "reason"]),
  tool("issue_refund", "Issue a refund AFTER check_refund_policy returned approve. Re-verifies policy.", "issue-refund",
    { orderId: { type: "string", description: "Order ID to refund" }, amount: { type: "number", description: "the eligible amount from the policy check" }, reason: { type: "string", description: "the refund reason" } }, ["orderId", "amount", "reason"]),
];

const body = {
  name: "Ava — Acme Refunds",
  conversation_config: {
    agent: {
      first_message: "Hi, thanks for calling Acme Store support — this is Ava. How can I help with your order today?",
      language: "en",
      prompt: { prompt: SYSTEM, llm: process.env.AVA_LLM || "gemini-2.5-flash", tools },
    },
    tts: { voice_id: VOICE },
  },
};

// PATCH_AGENT_ID=<id> updates an existing agent in place (prompt + tool URLs);
// otherwise a new agent is created.
const patchId = process.env.PATCH_AGENT_ID;
const res = await fetch(
  patchId ? `https://api.elevenlabs.io/v1/convai/agents/${patchId}` : "https://api.elevenlabs.io/v1/convai/agents/create",
  {
    method: patchId ? "PATCH" : "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  },
);
const text = await res.text();
if (!res.ok) { console.error((patchId ? "update" : "create") + " failed", res.status, text); process.exit(1); }
const agent_id = patchId ?? JSON.parse(text).agent_id;
console.log(patchId ? "✅ Updated Ava:" : "✅ Created Ava:", agent_id);
console.log("   tools point at:", BASE + "/api/agent-tools/*");
console.log("   next: set ELEVENLABS_AGENT_ID to this id, then tap the mic in the app.");
