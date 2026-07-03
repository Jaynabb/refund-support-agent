import type {
  Order, OrderItem, PolicyEvaluation, PolicyRuleResult, RefundReason,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic refund policy engine — the agent's source of truth.
//
// Intentionally small and unambiguous. The LLM gathers info and explains; this
// decides, and returns every rule it checked (shown in the reasoning panel).
//   Deny:    not delivered / outside 30-day window / already refunded /
//            no refundable items.
//   Approve: otherwise (partial when a mix of refundable + non-refundable items).
// Mirrors lib/data/policy.md.
// ─────────────────────────────────────────────────────────────────────────────

const RETURN_WINDOW_DAYS = 30;

const NON_REFUNDABLE = new Set(["final_sale", "digital"]);

const daysSince = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const money = (n: number) => `$${n.toFixed(2)}`;

// `reason` is recorded on the conversation but does not gate the decision.
export function evaluateRefund(
  order: Order,
  _reason: RefundReason,
  _refundsLast90Days: number,
): PolicyEvaluation {
  const rules: PolicyRuleResult[] = [];
  const eligibleItems: OrderItem[] = order.items.filter((i) => !NON_REFUNDABLE.has(i.category));
  const eligibleAmount = eligibleItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const ineligibleNames = order.items.filter((i) => NON_REFUNDABLE.has(i.category)).map((i) => i.name);

  // ── Deny gates ──────────────────────────────────────────────────────────────
  const delivered = order.deliveredAt !== null;
  rules.push({
    rule: "delivered", passed: delivered,
    detail: delivered ? `Delivered on ${order.deliveredAt}.` : `Order not delivered yet — not eligible (policy §1).`,
  });

  const notRefunded = !order.refunded;
  rules.push({
    rule: "not_already_refunded", passed: notRefunded,
    detail: notRefunded ? `No prior refund on this order.` : `Already refunded (${money(order.refundedAmount)}) — no double refunds (policy §3).`,
  });

  const daysOut = delivered ? daysSince(order.deliveredAt as string) : Infinity;
  const inWindow = delivered && daysOut <= RETURN_WINDOW_DAYS;
  rules.push({
    rule: "return_window", passed: inWindow,
    detail: delivered ? `Delivered ${daysOut} day(s) ago; window is ${RETURN_WINDOW_DAYS} days (policy §1).` : `Window N/A — not delivered.`,
  });

  const anyEligible = eligibleItems.length > 0;
  rules.push({
    rule: "item_eligibility", passed: anyEligible,
    detail: anyEligible
      ? (ineligibleNames.length ? `Refundable ${money(eligibleAmount)}; non-refundable excluded: ${ineligibleNames.join(", ")} (policy §2).` : `All items are refundable.`)
      : `Every item is non-refundable (${ineligibleNames.join(", ")}) — policy §2.`,
  });

  // ── Decision ────────────────────────────────────────────────────────────────
  const hardDeny = rules.filter((r) => ["delivered", "not_already_refunded", "return_window", "item_eligibility"].includes(r.rule) && !r.passed);

  let decision: PolicyEvaluation["decision"];
  let summary: string;
  if (hardDeny.length > 0) {
    decision = "deny";
    summary = hardDeny[0].detail;
  } else {
    decision = "approve";
    summary = ineligibleNames.length
      ? `Approve a partial refund of ${money(eligibleAmount)} (non-refundable items excluded).`
      : `Approve a full refund of ${money(eligibleAmount)}.`;
  }

  return { decision, eligibleAmount, rules, summary };
}
