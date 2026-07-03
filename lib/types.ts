// ─────────────────────────────────────────────────────────────────────────────
// Domain types — CRM, orders, refund policy, and the streaming agent event log.
// ─────────────────────────────────────────────────────────────────────────────

export type ItemCategory =
  | "standard"
  | "final_sale"
  | "digital"
  | "perishable"
  | "personal_care";

export interface OrderItem {
  sku: string;
  name: string;
  category: ItemCategory;
  price: number;
  quantity: number;
}

export interface Order {
  orderId: string;
  customerId: string;
  placedAt: string; // ISO date
  deliveredAt: string | null; // ISO date, null if not yet delivered
  items: OrderItem[];
  total: number;
  refunded: boolean; // already refunded in full?
  refundedAmount: number;
  hasPhotoEvidence: boolean; // customer supplied photos for damage claims
}

export interface Customer {
  customerId: string;
  name: string;
  email: string;
  loyaltyTier: "standard" | "gold" | "platinum";
  refundsLast90Days: number; // trailing refund count — fraud/abuse signal
  orders: Order[];
}

// ── Policy evaluation ────────────────────────────────────────────────────────

export type RefundDecision = "approve" | "deny" | "escalate";

export type RefundReason =
  | "defective"
  | "damaged"
  | "wrong_item"
  | "not_as_described"
  | "changed_mind";

export interface PolicyRuleResult {
  rule: string; // e.g. "return_window"
  passed: boolean;
  detail: string; // human-readable explanation, cites the policy
}

export interface PolicyEvaluation {
  decision: RefundDecision;
  eligibleAmount: number; // amount that would be refunded if approved
  rules: PolicyRuleResult[]; // every rule checked, in order — the audit trail
  summary: string; // one-line rationale the agent can cite to the customer
}

// ── Streaming agent events (rendered live in the admin reasoning panel) ───────

export type AgentEventType =
  | "user_message" // inbound from the customer
  | "thinking" // Claude's natural-language reasoning between tool calls
  | "tool_call" // the agent invoked a tool
  | "tool_result" // a tool returned (ok) …
  | "tool_error" // … or failed
  | "retry" // a failed tool is being retried
  | "policy_check" // check_refund_policy ran — decision + rule trail
  | "decision" // final refund decision
  | "agent_message" // final text reply to the customer
  | "error"; // unrecoverable loop error

export interface AgentEvent {
  id: string;
  seq: number; // monotonic order within a conversation turn
  ts: number; // epoch ms
  type: AgentEventType;
  label: string; // short human label for the timeline
  data?: unknown; // structured payload (tool input/output, policy eval, etc.)
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
