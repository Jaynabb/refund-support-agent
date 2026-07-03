import type {
  Order, OrderItem, PolicyEvaluation, PolicyRuleResult, RefundReason,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic refund policy engine.
//
// This is the agent's source of truth. The LLM orchestrates the conversation and
// explains outcomes, but it NEVER decides eligibility — this function does, from
// hard rules, and returns every rule it checked so the decision is fully auditable
// (and shown in the admin reasoning panel). Mirrors lib/data/policy.md.
// ─────────────────────────────────────────────────────────────────────────────

const RETURN_WINDOW_DAYS = 30;
const CHANGED_MIND_WINDOW_DAYS = 14;
const AUTO_APPROVE_CAP = 500;
const EVIDENCE_REQUIRED_OVER = 100;
const FRAUD_REFUND_THRESHOLD = 3;

const NON_REFUNDABLE = new Set(["final_sale", "digital", "perishable", "personal_care"]);

const daysSince = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const money = (n: number) => `$${n.toFixed(2)}`;

export function evaluateRefund(
  order: Order,
  reason: RefundReason,
  refundsLast90Days: number,
): PolicyEvaluation {
  const rules: PolicyRuleResult[] = [];
  const eligibleItems: OrderItem[] = order.items.filter((i) => !NON_REFUNDABLE.has(i.category));
  const eligibleAmount = eligibleItems.reduce((s, i) => s + i.price * i.quantity, 0);

  // ── Hard-deny rules ────────────────────────────────────────────────────────

  const delivered = order.deliveredAt !== null;
  rules.push({
    rule: "delivered",
    passed: delivered,
    detail: delivered
      ? `Order was delivered on ${order.deliveredAt}.`
      : `Order has not been delivered yet — not eligible for a refund (policy §1).`,
  });

  const notRefunded = !order.refunded;
  rules.push({
    rule: "not_already_refunded",
    passed: notRefunded,
    detail: notRefunded
      ? `No prior refund on this order.`
      : `Order was already refunded (${money(order.refundedAmount)}) — no double refunds (policy §3).`,
  });

  const daysOut = delivered ? daysSince(order.deliveredAt as string) : Infinity;
  const inWindow = delivered && daysOut <= RETURN_WINDOW_DAYS;
  rules.push({
    rule: "return_window",
    passed: inWindow,
    detail: delivered
      ? `Delivered ${daysOut} day(s) ago; the return window is ${RETURN_WINDOW_DAYS} days (policy §1).`
      : `Cannot evaluate window — order not delivered.`,
  });

  const anyEligible = eligibleItems.length > 0;
  const ineligibleNames = order.items.filter((i) => NON_REFUNDABLE.has(i.category)).map((i) => i.name);
  rules.push({
    rule: "item_eligibility",
    passed: anyEligible,
    detail: anyEligible
      ? (ineligibleNames.length
          ? `Refundable items total ${money(eligibleAmount)}; non-refundable items excluded: ${ineligibleNames.join(", ")} (policy §2).`
          : `All items are refundable categories.`)
      : `Every item is non-refundable (${ineligibleNames.join(", ")}) — policy §2.`,
  });

  const changedMindOk = reason !== "changed_mind" || daysOut <= CHANGED_MIND_WINDOW_DAYS;
  rules.push({
    rule: "reason_validity",
    passed: changedMindOk,
    detail: reason === "changed_mind"
      ? (changedMindOk
          ? `Changed-mind request within the ${CHANGED_MIND_WINDOW_DAYS}-day changed-mind window (policy §4).`
          : `Changed-mind request ${daysOut} days after delivery exceeds the ${CHANGED_MIND_WINDOW_DAYS}-day changed-mind window (policy §4).`)
      : `Reason "${reason}" is always eligible within the return window (policy §4).`,
  });

  // ── Evidence rule (not a hard deny — triggers an evidence request) ──────────

  const needsEvidence =
    (reason === "damaged" || reason === "defective") && eligibleAmount > EVIDENCE_REQUIRED_OVER;
  const evidenceOk = !needsEvidence || order.hasPhotoEvidence;
  rules.push({
    rule: "evidence",
    passed: evidenceOk,
    detail: needsEvidence
      ? (evidenceOk
          ? `Photo evidence is on file for this ${reason} claim over ${money(EVIDENCE_REQUIRED_OVER)} (policy §5).`
          : `Photo evidence is REQUIRED for a ${reason} claim over ${money(EVIDENCE_REQUIRED_OVER)} but none is on file — request it before approving (policy §5).`)
      : `No photo evidence required for this claim.`,
  });

  // ── Escalation signals ─────────────────────────────────────────────────────

  const flagged = refundsLast90Days > FRAUD_REFUND_THRESHOLD;
  rules.push({
    rule: "fraud_review",
    passed: !flagged,
    detail: flagged
      ? `Customer has ${refundsLast90Days} refunds in the last 90 days (> ${FRAUD_REFUND_THRESHOLD}) — must escalate for manual review (policy §7).`
      : `Customer refund history is within normal limits (${refundsLast90Days} in 90 days).`,
  });

  const overCap = eligibleAmount > AUTO_APPROVE_CAP;
  rules.push({
    rule: "amount_authority",
    passed: !overCap,
    detail: overCap
      ? `Refund amount ${money(eligibleAmount)} exceeds the ${money(AUTO_APPROVE_CAP)} auto-approve cap — must escalate (policy §6).`
      : `Refund amount ${money(eligibleAmount)} is within the ${money(AUTO_APPROVE_CAP)} auto-approve authority.`,
  });

  // ── Decision precedence ────────────────────────────────────────────────────
  // 1) any hard-deny rule fails → deny
  // 2) escalation signal (fraud / over-cap) → escalate
  // 3) evidence missing → deny (request evidence)
  // 4) otherwise → approve (possibly partial, for eligibleAmount only)

  const hardDeny = rules.filter(
    (r) => ["delivered", "not_already_refunded", "return_window", "item_eligibility", "reason_validity"].includes(r.rule) && !r.passed,
  );

  let decision: PolicyEvaluation["decision"];
  let summary: string;

  if (hardDeny.length > 0) {
    decision = "deny";
    summary = hardDeny[0].detail;
  } else if (flagged || overCap) {
    decision = "escalate";
    summary = flagged
      ? `Escalate: customer flagged for manual review (${refundsLast90Days} refunds in 90 days).`
      : `Escalate: ${money(eligibleAmount)} exceeds the ${money(AUTO_APPROVE_CAP)} auto-approve cap.`;
  } else if (!evidenceOk) {
    decision = "deny";
    summary = `Cannot approve yet — photo evidence required for this ${reason} claim over ${money(EVIDENCE_REQUIRED_OVER)}. Request it from the customer.`;
  } else {
    decision = "approve";
    const partial = ineligibleNames.length > 0;
    summary = partial
      ? `Approve a partial refund of ${money(eligibleAmount)} (non-refundable items excluded).`
      : `Approve a full refund of ${money(eligibleAmount)}.`;
  }

  return { decision, eligibleAmount, rules, summary };
}
