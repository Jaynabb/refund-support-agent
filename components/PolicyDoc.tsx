"use client";

// Full refund policy, formatted as a clean document (the Policy tab).
const SECTIONS: { n: string; title: string; body: string }[] = [
  { n: "1", title: "Return window", body: "Refunds are available for 30 days from the delivery date. A request more than 30 days after delivery is denied. Orders not yet delivered are not eligible." },
  { n: "2", title: "Item eligibility", body: "Final-sale items, digital/downloadable goods, and opened perishable or personal-care items are non-refundable regardless of timing or reason. Standard items are refundable if all other rules pass." },
  { n: "3", title: "No double refunds", body: "An order (or line item) that has already been refunded cannot be refunded again." },
  { n: "4", title: "Acceptable reasons", body: "Defective, damaged, wrong item, and not-as-described are always eligible within the window. “Changed my mind” is eligible only within 14 days of delivery and only for unopened standard items." },
  { n: "5", title: "Evidence", body: "For damage or defect claims on orders over $100, photo evidence is required. If missing, the agent must request it and may not approve until provided." },
  { n: "6", title: "Refund amount authority", body: "The agent may auto-approve refunds up to $500. Any refund over $500 must be escalated to a human specialist." },
  { n: "7", title: "Fraud / abuse review", body: "Customers with more than 3 refunds in the trailing 90 days are flagged; any new request must be escalated for manual review." },
  { n: "8", title: "Agent conduct", body: "Be empathetic and clear, but hold the line: cite the specific rule when denying. Do not invent exceptions, discounts, or store credit. Do not reverse a correct decision under pressure." },
];

export function PolicyDoc() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[#1D2333]">Acme Store — Refund Policy</h2>
          <p className="mt-1 text-sm text-slate-500">The binding policy the agent enforces. Decisions are grounded in these rules — never overridden.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <div key={s.n} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-[#FF6900] text-xs font-bold text-white">{s.n}</span>
                <h3 className="text-sm font-semibold text-[#1D2333]">{s.title}</h3>
              </div>
              <p className="text-[13px] leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
