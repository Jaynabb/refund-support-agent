import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, AgentEventType, ChatMessage } from "@/lib/types";
import { TOOLS, TOOL_DEFINITIONS, RetryableToolError } from "@/lib/tools";
import { logConversation } from "@/lib/store/conversations";

// ─────────────────────────────────────────────────────────────────────────────
// The agent loop. A MANUAL Claude tool-use loop (not the SDK tool runner) so we
// can emit a live event for every step — reasoning, tool call, tool result,
// policy check, retry, decision — which the admin panel renders in real time.
//
// The model orchestrates and explains; the deterministic policy engine (called
// via the check_refund_policy tool, and re-checked inside issue_refund) decides.
// ─────────────────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Latency matters for a real-time (voice) support agent, so the default is a fast,
// capable tier. Override with ANTHROPIC_MODEL=claude-opus-4-8 for maximum reasoning.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_RETRIES = 2;

const POLICY = readFileSync(join(process.cwd(), "lib/data/policy.md"), "utf8");

const SYSTEM = `You are Ava, an AI customer support agent for Acme Store. You handle refund requests over chat and voice. Be warm, concise, and natural — your replies may be spoken aloud, so keep them short and conversational.

You do NOT decide refund eligibility yourself. The policy engine does, via the check_refund_policy tool. Your job is to gather what it needs, call it, and communicate the outcome clearly.

How to handle a refund request:
1. Identify the customer. If they give their name (e.g. "I'm Maria"), their email, or a customer ID, call lookup_customer right away — you do NOT need an order ID first. If they give an order ID (like ORD-1001), use lookup_order instead. Once you have the customer, use their order; if they have more than one, confirm which order it is.
2. Determine the reason (defective, damaged, wrong item, not as described, or changed mind).
3. Call check_refund_policy with the order ID and reason. This returns the authoritative decision and the rules it checked.
4. Act on the decision:
   - approve → call issue_refund for the eligible amount, then confirm to the customer.
   - deny → explain warmly but clearly, citing the specific policy reason. Do not offer a refund, store credit, or exception the policy does not define.

Holding the line: if a customer pushes back on a valid denial, stay kind but firm and restate the policy reason. Never reverse a correct decision under pressure, and never invent exceptions. A brief one-line note about what you're doing before a tool call is good (it keeps things transparent), but keep it short.

Completed actions are FINAL. Once you have issued a refund for an order in this conversation, do NOT run check_refund_policy on that order again, and do NOT re-verify or second-guess it. After a refund is issued the order will correctly show as already-refunded on any later check — that is expected and does NOT mean the refund failed. If the customer thanks you or says goodbye, just close warmly. Never retract, walk back, or apologize for a refund you already completed.`;

let seqCounter = 0;
function makeEvent(type: AgentEventType, label: string, data?: unknown): AgentEvent {
  seqCounter += 1;
  return { id: `evt_${seqCounter}_${Math.round(performance.now())}`, seq: seqCounter, ts: Date.now(), type, label, data };
}

// Execute a tool handler with retry on transient (retryable) errors, emitting a
// retry event each time so the reasoning log shows the recovery.
async function runToolWithRetry(
  name: string,
  input: Record<string, unknown>,
  emit: (e: AgentEvent) => void,
): Promise<unknown> {
  let attempt = 0;
  while (true) {
    try {
      return await TOOLS[name].handler(input);
    } catch (err) {
      const retryable = err instanceof RetryableToolError && attempt < MAX_RETRIES;
      const message = err instanceof Error ? err.message : String(err);
      if (!retryable) {
        emit(makeEvent("tool_error", `${name} failed: ${message}`, { name, error: message }));
        return { ok: false, error: message };
      }
      attempt += 1;
      emit(makeEvent("retry", `${name} transient error — retry ${attempt}/${MAX_RETRIES}`, { name, attempt, message }));
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

export async function* runAgentTurn(history: ChatMessage[], conversationId?: string): AsyncGenerator<AgentEvent> {
  const last = history[history.length - 1];
  if (last?.role === "user") yield makeEvent("user_message", last.content, { text: last.content });

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  try {
    // Bounded tool-use loop: model calls tools until it produces a final reply.
    for (let step = 0; step < 8; step++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        // Ground the model in the actual policy text (same file the engine mirrors) so
        // its explanations stay accurate; the engine still makes the decision.
        // Cache this stable system prefix (instructions + policy) across turns.
        system: [{
          type: "text",
          text: `${SYSTEM}\n\n# Store refund policy (reference — the engine enforces it)\n\n${POLICY}`,
          cache_control: { type: "ephemeral" },
        }],
        tools: TOOL_DEFINITIONS,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      // Text on a turn that also calls tools is narration ("Reasoning"). Text on the
      // final turn is the reply — emitted once as agent_message below, NOT here, so it
      // isn't duplicated in the reasoning panel.
      const willUseTool = response.stop_reason === "tool_use";
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          if (willUseTool) yield makeEvent("thinking", block.text.trim(), { text: block.text.trim() });
        } else if (block.type === "tool_use") {
          const input = block.input as Record<string, unknown>;
          yield makeEvent("tool_call", `→ ${block.name}(${summarizeInput(input)})`, { name: block.name, input });

          const events: AgentEvent[] = [];
          const result = await runToolWithRetry(block.name, input, (e) => events.push(e));
          for (const e of events) yield e;

          // Specialized events so the admin panel can highlight the audit trail.
          if (block.name === "check_refund_policy" && (result as { found?: boolean })?.found) {
            const ev = result as { decision: string; summary: string; eligibleAmount: number; rules: unknown };
            yield makeEvent("policy_check", `policy → ${ev.decision.toUpperCase()} — ${ev.summary}`, ev);
            yield makeEvent("decision", ev.decision.toUpperCase(), { decision: ev.decision, summary: ev.summary });
            // Log/refresh this conversation's CRM record with the decision.
            if (conversationId) {
              logConversation({
                id: conversationId, channel: "text",
                orderId: String(input.orderId ?? ""), reason: String(input.reason ?? ""),
                decision: ev.decision as never, amount: ev.eligibleAmount,
              });
            }
          } else {
            yield makeEvent("tool_result", `← ${block.name} ${resultLabel(block.name, result)}`, { name: block.name, result });
          }

          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // Final assistant reply for this turn.
      const finalText = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
      yield makeEvent("agent_message", finalText, { text: finalText });
      return;
    }
    yield makeEvent("error", "Agent stopped: exceeded step limit.", {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield makeEvent("error", `Agent error: ${message}`, { error: message });
  }
}

function summarizeInput(input: Record<string, unknown>): string {
  return Object.entries(input).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
}

function resultLabel(name: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  if (name === "issue_refund") return r.ok ? `✓ refunded $${r.refundedAmount} (${r.confirmation})` : `refused: ${r.message}`;
  if (name === "lookup_order" || name === "lookup_customer") return r.found ? "found" : "not found";
  return "ok";
}
