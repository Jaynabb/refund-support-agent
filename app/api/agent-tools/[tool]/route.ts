import { TOOLS, RetryableToolError } from "@/lib/tools";
import { publish } from "@/lib/events/bus";
import { logConversation } from "@/lib/store/conversations";

// Webhook endpoints for the ElevenLabs voice agent's SERVER tools. Each runs the
// same deterministic tool/policy logic as the browser agent, publishes the step to
// the live feed (so the on-screen panel updates while you speak), and returns the
// result JSON to ElevenLabs. URL: POST /api/agent-tools/<tool>
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOOL_MAP: Record<string, string> = {
  "lookup-order": "lookup_order",
  "lookup-customer": "lookup_customer",
  "check-policy": "check_refund_policy",
  "issue-refund": "issue_refund",
};

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  const { tool } = await ctx.params;
  const name = TOOL_MAP[tool];
  if (!name) return Response.json({ error: `unknown tool ${tool}` }, { status: 404 });

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty body */ }
  const input = ((body.parameters as Record<string, unknown>) ?? body) ?? {};

  publish("tool_call", `🎙️ → ${name}(${summarize(input)})`, { name, input, source: "voice" });

  // Run with the same transient-retry behavior as the browser loop.
  let result: unknown;
  let attempt = 0;
  while (true) {
    try { result = await TOOLS[name].handler(input); break; }
    catch (err) {
      if (err instanceof RetryableToolError && attempt < 2) {
        attempt += 1;
        publish("retry", `${name} transient error — retry ${attempt}/2`, { name, attempt });
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      publish("tool_error", `${name} failed: ${msg}`, { name });
      return Response.json({ ok: false, error: msg });
    }
  }

  const r = result as Record<string, unknown>;
  const orderId = String((input as { orderId?: unknown }).orderId ?? "");
  // Group a call's tool activity under one CRM record keyed by the order.
  const convId = orderId ? `voice_${orderId}` : `voice_${Date.now()}`;

  if (name === "lookup_order" && r.found) {
    // Log the inquiry as soon as Ava pulls the order — the CRM row appears live mid-call.
    logConversation({ id: convId, channel: "voice", orderId, decision: "pending" });
    publish("tool_result", `← ${name} found`, { name, result: r });
  } else if (name === "check_refund_policy" && r.found) {
    publish("policy_check", `policy → ${String(r.decision).toUpperCase()} — ${r.summary}`, r);
    publish("decision", String(r.decision).toUpperCase(), { decision: r.decision, summary: r.summary });
    logConversation({
      id: convId, channel: "voice", orderId,
      reason: String((input as { reason?: unknown }).reason ?? ""),
      decision: r.decision as never, amount: Number(r.eligibleAmount ?? 0),
    });
  } else {
    publish("tool_result", `← ${name} ${resultLabel(name, r)}`, { name, result: r });
  }

  return Response.json(result);
}

function summarize(input: Record<string, unknown>): string {
  return Object.entries(input).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
}
function resultLabel(name: string, r: Record<string, unknown>): string {
  if (name === "issue_refund") return r.ok ? `✓ refunded $${r.refundedAmount}` : `refused: ${r.message}`;
  if (name === "lookup_order" || name === "lookup_customer") return r.found ? "found" : "not found";
  return "ok";
}
