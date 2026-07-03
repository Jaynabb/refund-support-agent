import type { Anthropic } from "@anthropic-ai/sdk";
import type { RefundReason } from "@/lib/types";
import { findCustomerByEmail, findCustomerById, findCustomersByName, findOrder } from "@/lib/data/crm";
import { evaluateRefund } from "@/lib/policy/engine";

// ─────────────────────────────────────────────────────────────────────────────
// Tool layer. Each tool has an Anthropic schema (what Claude sees) and a handler
// (deterministic logic). Handlers return plain JSON that goes back to the model.
//
// Design note for the code tour: issue_refund RE-EVALUATES the policy engine before
// moving any money. The LLM cannot cause a non-compliant refund even if it tries —
// the deterministic engine is the final gate, not the model.
// ─────────────────────────────────────────────────────────────────────────────

// Mock mutable state (in-memory; resets on server restart).
const refundedOrders = new Set<string>();
// Tracks first-attempt gateway failures per order so the demo reliably shows one retry.
const gatewayFirstAttempt = new Set<string>();

export class RetryableToolError extends Error {
  retryable = true;
}

function orderView(orderId: string) {
  const hit = findOrder(orderId);
  if (!hit) return null;
  const { customer, order } = hit;
  return {
    orderId: order.orderId,
    customer: { customerId: customer.customerId, name: customer.name, email: customer.email, loyaltyTier: customer.loyaltyTier, refundsLast90Days: customer.refundsLast90Days },
    placedAt: order.placedAt,
    deliveredAt: order.deliveredAt,
    total: order.total,
    alreadyRefunded: order.refunded || refundedOrders.has(order.orderId),
    hasPhotoEvidence: order.hasPhotoEvidence,
    items: order.items,
  };
}

export interface Tool {
  definition: Anthropic.Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

export const TOOLS: Record<string, Tool> = {
  lookup_customer: {
    definition: {
      name: "lookup_customer",
      description:
        "Find a customer by NAME, email address, or customer ID, and return their profile and orders. Use this the moment a customer identifies themselves (e.g. \"my name is Maria\") — you do NOT need an order ID first.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer's name (first name or full name), e.g. \"Maria\" or \"Maria Alvarez\"" },
          email: { type: "string", description: "Customer email address" },
          customerId: { type: "string", description: "Customer ID, e.g. C001" },
        },
      },
    },
    handler: async ({ email, customerId, name }) => {
      let customer = email ? findCustomerByEmail(String(email)) : customerId ? findCustomerById(String(customerId)) : undefined;
      if (!customer && name) {
        const matches = findCustomersByName(String(name));
        if (matches.length === 1) customer = matches[0];
        else if (matches.length > 1) {
          return { found: false, ambiguous: true, matches: matches.map((c) => c.name), message: `Multiple customers match "${name}". Ask for the order ID or email to confirm which one.` };
        }
      }
      if (!customer) return { found: false, message: "No customer found with that name, email, or ID." };
      return {
        found: true,
        customerId: customer.customerId,
        name: customer.name,
        email: customer.email,
        loyaltyTier: customer.loyaltyTier,
        refundsLast90Days: customer.refundsLast90Days,
        orders: customer.orders.map((o) => ({ orderId: o.orderId, deliveredAt: o.deliveredAt, total: o.total, items: o.items.map((i) => i.name) })),
      };
    },
  },

  lookup_order: {
    definition: {
      name: "lookup_order",
      description:
        "Look up a single order by its order ID (e.g. ORD-1001). Returns the order details, its items and categories, delivery date, total, and whether it was already refunded. Always look up the order before checking policy.",
      input_schema: {
        type: "object",
        properties: { orderId: { type: "string", description: "Order ID, e.g. ORD-1001" } },
        required: ["orderId"],
      },
    },
    handler: async ({ orderId }) => {
      const view = orderView(String(orderId));
      return view ? { found: true, ...view } : { found: false, message: `No order found with ID ${orderId}.` };
    },
  },

  check_refund_policy: {
    definition: {
      name: "check_refund_policy",
      description:
        "Evaluate whether an order qualifies for a refund under the store policy. Returns a decision (approve / deny), the eligible amount, and the full list of policy rules checked with pass/fail and explanations. This is the authoritative eligibility check — always call it before approving or denying.",
      input_schema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID to evaluate" },
          reason: {
            type: "string",
            enum: ["defective", "damaged", "wrong_item", "not_as_described", "changed_mind"],
            description: "The customer's stated reason for the refund",
          },
        },
        required: ["orderId", "reason"],
      },
    },
    handler: async ({ orderId, reason }) => {
      const hit = findOrder(String(orderId));
      if (!hit) return { found: false, message: `No order found with ID ${orderId}.` };
      const { customer, order } = hit;
      const evalOrder = { ...order, refunded: order.refunded || refundedOrders.has(order.orderId) };
      const evaluation = evaluateRefund(evalOrder, reason as RefundReason, customer.refundsLast90Days);
      return { found: true, orderId: order.orderId, ...evaluation };
    },
  },

  issue_refund: {
    definition: {
      name: "issue_refund",
      description:
        "Issue a refund for an order. ONLY call this after check_refund_policy returned an 'approve' decision. The amount must equal the eligible amount from that check. This tool re-verifies policy and will refuse a non-compliant refund.",
      input_schema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID to refund" },
          amount: { type: "number", description: "Refund amount in USD (must equal the eligible amount)" },
          reason: {
            type: "string",
            enum: ["defective", "damaged", "wrong_item", "not_as_described", "changed_mind"],
            description: "The refund reason (same as used in check_refund_policy)",
          },
        },
        required: ["orderId", "amount", "reason"],
      },
    },
    handler: async ({ orderId, amount, reason }) => {
      const id = String(orderId);
      const hit = findOrder(id);
      if (!hit) return { ok: false, message: `No order found with ID ${orderId}.` };
      const { customer, order } = hit;

      // Final deterministic gate — the LLM cannot bypass policy here.
      const evalOrder = { ...order, refunded: order.refunded || refundedOrders.has(order.orderId) };
      const evaluation = evaluateRefund(evalOrder, reason as RefundReason, customer.refundsLast90Days);
      if (evaluation.decision !== "approve") {
        return { ok: false, refused: true, message: `Refund refused by policy engine: ${evaluation.summary}`, decision: evaluation.decision };
      }
      if (Math.abs(Number(amount) - evaluation.eligibleAmount) > 0.01) {
        return { ok: false, refused: true, message: `Amount ${amount} does not match the eligible amount ${evaluation.eligibleAmount}.` };
      }

      // Simulate a transient payment-gateway failure on the first attempt, so the
      // agent's retry handling is visible in the reasoning log.
      if (!gatewayFirstAttempt.has(id)) {
        gatewayFirstAttempt.add(id);
        throw new RetryableToolError("Payment gateway timeout (503). Transient — safe to retry.");
      }

      refundedOrders.add(id);
      return { ok: true, orderId: id, refundedAmount: evaluation.eligibleAmount, confirmation: `RF-${id.replace("ORD-", "")}-${refundedOrders.size}` };
    },
  },
};

export const TOOL_DEFINITIONS: Anthropic.Tool[] = Object.values(TOOLS).map((t) => t.definition);
