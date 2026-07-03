"use client";

// Full refund policy, formatted as a clean document (the Policy tab).
const SECTIONS: { n: string; title: string; body: string; tag: string; tone: string }[] = [
  { n: "1", title: "Return window", tag: "Deny if outside", tone: "rose",
    body: "Refunds are available for 30 days from delivery. A request after 30 days — or for an order not yet delivered — is denied." },
  { n: "2", title: "Non-refundable items", tag: "Deny if only these", tone: "rose",
    body: "Final-sale and digital/downloadable items are non-refundable. A mixed order refunds only the refundable portion (partial)." },
  { n: "3", title: "No double refunds", tag: "Deny if repeat", tone: "rose",
    body: "An order that has already been refunded cannot be refunded again." },
  { n: "4", title: "Refund authority", tag: "Escalate over $500", tone: "amber",
    body: "The agent may auto-approve refunds up to $500. Any refund over $500 is escalated to a human specialist." },
  { n: "5", title: "Abuse review", tag: "Escalate if flagged", tone: "amber",
    body: "Customers with more than 3 refunds in the trailing 90 days are flagged; a new request is escalated for manual review." },
  { n: "6", title: "Agent conduct", tag: "Hold the line", tone: "slate",
    body: "Be empathetic and clear, but hold the line: cite the specific rule when denying, never invent exceptions, and don't reverse a correct decision under pressure." },
];

const TONE: Record<string, string> = {
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

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
                <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONE[s.tone]}`}>{s.tag}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
