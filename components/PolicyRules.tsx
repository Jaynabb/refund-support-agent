"use client";

// Always-on-display summary of the binding refund policy (mirrors lib/data/policy.md).
// Kept visible so a viewer can see exactly what the agent is enforcing.
const RULES: [string, string][] = [
  ["30-day window", "Refund only within 30 days of delivery"],
  ["Non-refundable", "Final-sale · digital · perishable/personal-care"],
  ["No double refunds", "Already-refunded orders are ineligible"],
  ["Changed mind", "Only within 14 days, unopened"],
  ["Photo evidence", "Required for damage claims over $100"],
  ["Auto-approve ≤ $500", "Anything over $500 → escalate"],
  ["Fraud review", "> 3 refunds in 90 days → escalate"],
];

export function PolicyRules() {
  return (
    <div className="flex flex-wrap items-stretch gap-2 border-b border-slate-800 bg-slate-900/40 px-6 py-2.5">
      <span className="self-center text-xs font-medium uppercase tracking-wide text-slate-500">Refund policy</span>
      {RULES.map(([title, detail]) => (
        <div key={title} className="rounded-md border border-slate-700/70 bg-slate-800/40 px-2.5 py-1">
          <div className="text-[11px] font-semibold leading-tight text-slate-200">{title}</div>
          <div className="text-[10px] leading-tight text-slate-400">{detail}</div>
        </div>
      ))}
    </div>
  );
}
