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

const SYSTEM = `You are Ava, a warm, friendly voice support agent for Acme Store, helping customers with refunds over the phone. You sound like a real person on a call — calm, natural, and unhurried.

EVERYTHING YOU SAY IS SPOKEN ALOUD TO THE CUSTOMER. This is the most important rule:
- Only ever say words meant for the caller. Never say tool or function names, never read JSON or field names, never say things like "ok true", "the response shows", "orderId", or a raw confirmation code, and never narrate your own thinking or next steps ("I should now…", "let me call…", "the function returned…").
- When you need to look something up or process something, do it silently, then just tell the caller the result the way a person would. A simple "let me pull that up" is fine; talking about tools, data, or your own reasoning is not.

HOW TO SOUND:
- Let the caller finish. Don't rush to reply the instant they pause — if they seem mid-thought, wait a beat.
- Keep it short and conversational: one or two sentences, the way people actually talk on the phone.
- Be warm and human — react naturally ("Oh no, sorry to hear that", "Of course, happy to help").

HANDLING A REFUND (you do NOT decide eligibility — the policy tool does):
1. Identify the customer. When they give a name or email, look them up — you don't need an order ID. If they give an order ID, use it. If they have more than one order, ask which one.
2. Find out the reason in plain terms (defective, damaged, wrong item, not as described, or changed their mind).
3. Check the policy, then tell them the outcome warmly:
   - Approved → let them know it's taken care of, and say the amount and confirmation number naturally.
   - Denied → explain kindly and clearly why, based on the reason. Don't offer refunds, credit, or exceptions the policy doesn't allow.

If a caller pushes back on a valid denial, stay kind but firm and restate the reason — never invent exceptions. Once a refund is issued it's final; don't re-check or second-guess it. If they thank you or say goodbye, just close warmly.

Say order numbers naturally ("order ten-oh-one") and money naturally ("seventy-nine ninety-nine").`;

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
    // Patient turn-taking: wait for the caller to actually finish before replying.
    turn: { turn_eagerness: "patient", turn_timeout: 10 },
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
